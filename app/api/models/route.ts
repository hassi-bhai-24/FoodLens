import { NextRequest } from "next/server";
import { envKey, isCustomBaseUrlAllowed, isSafeHttpsUrl, jsonError, rateLimit, resolveGeminiBaseUrl } from "@/lib/proxy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Dynamic model lists. Anthropic has no public list-models API, so the
// client falls back to letting the user type a model name (see UI).
// The client key travels in the Authorization header, never in the URL
// (URLs are logged and kept in history); the server env key is used
// when no client key is supplied.
export async function GET(req: NextRequest) {
  if (!rateLimit(req, "models")) return jsonError("Too many requests.", 429);
  const provider = req.nextUrl.searchParams.get("provider") || "";
  const customBaseUrl = req.nextUrl.searchParams.get("baseUrl") || "";
  const auth = req.headers.get("authorization") || "";
  const headerKey = auth.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-api-key") || "";
  const key = headerKey || envKey(provider === "gemini" ? "GEMINI_API_KEY" : provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY");
  try {
    if (provider === "gemini" && key) {
      // Step B: same test-only localhost override as the chat route.
      // Ignored entirely in production; non-localhost is a 400.
      const geminiBase = resolveGeminiBaseUrl();
      if (!geminiBase.ok) return jsonError(geminiBase.error, 400);
      const res = await fetch(`${geminiBase.baseUrl}/v1beta/models?pageSize=100`, { headers: { "x-goog-api-key": key } });
      if (!res.ok) return jsonError("Could not list models.", 502);
      const data = (await res.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
      const models = (data.models || []).filter((m) => m.supportedGenerationMethods?.includes("generateContent")).map((m) => (m.name || "").replace("models/", "")).filter(Boolean);
      return Response.json({ models });
    }
    if ((provider === "openai" || provider === "compatible") && key) {
      let base = "https://api.openai.com/v1";
      if (provider === "compatible") {
        if (!isCustomBaseUrlAllowed()) return jsonError("Custom base URLs are disabled on this deployment.", 400);
        if (!isSafeHttpsUrl(customBaseUrl)) return jsonError("Invalid base URL.", 400);
        base = customBaseUrl.replace(/\/$/, "");
      }
      const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` }, redirect: "manual" });
      if (res.status >= 300 && res.status < 400) return jsonError("Could not list models.", 502);
      if (!res.ok) return jsonError("Could not list models.", 502);
      const data = (await res.json()) as { data?: { id?: string }[] };
      return Response.json({ models: (data.data || []).map((m) => m.id || "").filter(Boolean).sort() });
    }
    return Response.json({ models: [], note: "This provider has no dynamic model list in this build; type a model name in Settings." });
  } catch {
    return jsonError("Could not list models.", 502);
  }
}
