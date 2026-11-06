// Server-only proxy helpers: rate limiting, SSRF restrictions, env keys.
// Never log secrets or request bodies containing keys.
import { NextRequest } from "next/server";

// Rate-limit buckets are per (scope, client IP): chat, barcode, models
// and search each get their own budget, so a barcode lookup cannot
// consume the chat budget (and vice versa).
const buckets = new Map<string, number[]>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

// Batch 6: x-forwarded-for is client-controlled and must not be trusted
// blindly. It is used ONLY when TRUST_PROXY=true (a known proxy in front
// of this deployment, e.g. Vercel/Cloudflare/Nginx, which sets the header
// truthfully). By default the key is the non-spoofable constant "direct":
// one shared bucket for all clients. Trade-off: the default bucket can
// be exhausted by one client (shared 30/min), but no client can spoof
// its way into a fresh bucket and bypass the limit. NextRequest exposes
// no reliable remote IP in this runtime, so there is no better default.
export function clientRateLimitKey(headers: Headers, env: NodeJS.ProcessEnv = process.env): string {
  if (env.TRUST_PROXY === "true") {
    const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return "direct";
}

// Batch 6: hosted deployments can disable user-supplied compatible base
// URLs entirely. Default (unset / anything but "false") keeps current
// local behaviour. When disabled, the chat/models routes return a
// friendly 400 instead of fetching a user-supplied URL.
export function isCustomBaseUrlAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ALLOW_CUSTOM_BASE_URL !== "false";
}

// Step B: test-only, localhost-only base-URL overrides (never for
// production). A base URL override is honoured ONLY when all of these
// hold: (a) NODE_ENV is not "production" — in production the override
// is ignored entirely and the real endpoint is used, whatever the
// value; (b) the URL parses and uses http: or https:; (c) the hostname
// is exactly "localhost", "127.0.0.1" or "::1"; (d) the URL carries no
// username/password. In non-production, a set-but-invalid override is
// an error (the route returns 400) rather than a fetch — a non-localhost
// host must never be fetched through this mechanism. The override is
// an env-var mechanism for local mock upstreams only; it is not a
// user-supplied value and it is never read from request bodies.
export type TestOnlyBaseUrlResult = { ok: true; baseUrl: string } | { ok: false; error: string };

export function resolveTestOnlyBaseUrl(
  rawValue: string | undefined,
  defaultBase: string,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): TestOnlyBaseUrlResult {
  if (nodeEnv === "production") return { ok: true, baseUrl: defaultBase };
  const raw = (rawValue || "").trim();
  if (!raw) return { ok: true, baseUrl: defaultBase };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Test-only base URL is not a valid URL. It must point at localhost and is ignored in production." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Test-only base URL must use http or https and point at localhost. It is ignored in production." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Test-only base URL must not carry credentials. It must point at localhost and is ignored in production." };
  }
  const host = url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    return { ok: false, error: "Test-only base URL must point at localhost (localhost, 127.0.0.1 or ::1). Non-localhost hosts are never fetched through this override. It is ignored in production." };
  }
  return { ok: true, baseUrl: raw.replace(/\/+$/, "") };
}

/** Gemini API base URL: real endpoint unless a valid test-only localhost override applies. */
export function resolveGeminiBaseUrl(
  env: Record<string, string | undefined> = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): TestOnlyBaseUrlResult {
  return resolveTestOnlyBaseUrl(env.FOODLENS_GEMINI_BASE_URL, "https://generativelanguage.googleapis.com", nodeEnv);
}

/** Open Food Facts base URL: real endpoint unless a valid test-only localhost override applies. */
export function resolveOpenFoodFactsBaseUrl(
  env: Record<string, string | undefined> = process.env,
  nodeEnv: string | undefined = process.env.NODE_ENV,
): TestOnlyBaseUrlResult {
  return resolveTestOnlyBaseUrl(env.FOODLENS_OFF_BASE_URL, "https://world.openfoodfacts.org", nodeEnv);
}

export function rateLimit(req: NextRequest, scope = "default"): boolean {
  const key = `${scope}:${clientRateLimitKey(req.headers)}`;
  const now = Date.now();
  const hits = (buckets.get(key) || []).filter((t) => now - t < WINDOW_MS);
  hits.push(now);
  buckets.set(key, hits);
  return hits.length <= MAX_PER_WINDOW;
}

function isPrivateIPv6(host: string): boolean {
  // host is the URL hostname without brackets for IPv6 literals.
  if (!host.includes(":")) return false;
  const h = host.toLowerCase();
  // Expand :: shorthand for prefix checks on the common private forms.
  if (h === "::1" || h.startsWith("::ffff:")) return true;
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true; // fe80::/10 link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // fc00::/7 unique-local
  if (h.startsWith("::ffff:127.") || h.startsWith("::ffff:10.") || h.startsWith("::ffff:192.168.") || h.startsWith("::ffff:169.254.")) return true;
  // IPv4-mapped / compatible forms that normalise to a private IPv4.
  const mapped = h.replace(/^::ffff:/, "");
  if (/^\d+\.\d+\.\d+\.\d+$/.test(mapped)) {
    const [a, b] = mapped.split(".").map(Number);
    if (a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 169) return true;
  }
  return false;
}

export function isSafeHttpsUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false;
  // WHATWG URL keeps IPv6 literals in brackets; strip them so the
  // prefix checks below see the address itself.
  const host = url.hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1") return false;
  if (isPrivateIPv6(host)) return false;
  // Block private / loopback / link-local IPv4 literals. WHATWG URL
  // parsing normalises decimal, octal and hex IP forms to dotted
  // quad, so this check also covers those encodings.
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 169 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a === 0) return false;
  }
  return true;
}

export function envKey(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

/** True when an upstream failure is a quota / rate-limit failure. */
export function isQuotaError(status: number, bodyText = ""): boolean {
  if (status === 429) return true;
  return /RESOURCE_EXHAUSTED|quota|rate limit|rate_limit|too many requests/i.test(bodyText);
}

/** True when an upstream failure means the requested model was not found. */
export function isModelNotFoundError(status: number, bodyText = ""): boolean {
  if (status === 404) return true;
  return /model .*not (found|available)|not available to|model_not_found/i.test(bodyText);
}

/**
 * True when an upstream failure means the API key itself was rejected
 * (wrong key, revoked key, or the provider API not enabled for the
 * key's project) — NOT a bad model and NOT quota. Gemini rejects a bad
 * key with HTTP 400 + API_KEY_INVALID; OpenAI and Anthropic reject one
 * with HTTP 401. A 403 PERMISSION_DENIED from Gemini also means the
 * key/project cannot use the API. Detecting this separately matters:
 * without it a bad key produced the same generic message as a bad
 * model, so the user could not tell which one to fix.
 */
export function isInvalidKeyError(status: number, bodyText = ""): boolean {
  if (status === 401) return true;
  return /API_KEY_INVALID|API key not valid|incorrect API key|invalid x-api-key|invalid api key|authentication_error|PERMISSION_DENIED|API keys are not supported|api key (expired|revoked|disabled)/i.test(bodyText);
}

export interface ProviderErrorMapping {
  status: number;
  message: string;
}

/**
 * Map an upstream provider failure to the status/message the client
 * sees. Each cause gets its own message so the user can tell a bad key
 * from a bad model from quota: invalid key keeps HTTP 401, quota
 * failures keep HTTP 429, everything else is a 502.
 */
export function mapProviderError(status: number, bodyText = ""): ProviderErrorMapping {
  if (isQuotaError(status, bodyText)) {
    return {
      status: 429,
      message:
        "The AI provider's usage limit has been reached for this key or model. Please wait a little while and try again, or try a different model or key in Settings. No fallback model was tried for a quota error.",
    };
  }
  if (isInvalidKeyError(status, bodyText)) {
    return {
      status: 401,
      message:
        "The AI provider rejected this API key. Check that the key is copied exactly in Settings, and that the provider's API is enabled for the account the key belongs to. The model was not the problem.",
    };
  }
  if (isModelNotFoundError(status, bodyText)) {
    return {
      status: 502,
      message:
        "The selected AI model is not available for this key. Please try a different model in Settings, or check that the model name is correct, then try again.",
    };
  }
  return {
    status: 502,
    message: "The AI provider returned an error. Check your key and model, then try again.",
  };
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}
