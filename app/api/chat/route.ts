import { NextRequest } from "next/server";
import { envKey, isCustomBaseUrlAllowed, isModelNotFoundError, isQuotaError, isSafeHttpsUrl, jsonError, mapProviderError, rateLimit, resolveGeminiBaseUrl } from "@/lib/proxy";
import { FOODLENS_SYSTEM_PROMPT, TRANSCRIPTION_ONLY_INSTRUCTION } from "@/lib/types";
import { CHAT_TEMPERATURE, geminiFallbackChain, resolveChatModel } from "@/lib/models";
import { classifyUserText } from "@/lib/guards";
import { formatAboutMe, formatBarcodeData } from "@/lib/delimit";
import type { BarcodeProduct } from "@/lib/barcode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InMsg = { role: "user" | "assistant"; text: string; images?: { dataUrl: string; mime: string }[] };

const PROVIDERS = ["gemini", "openai", "anthropic", "compatible", "local"] as const;
const ALLOWED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
// Provider image budget (smallest documented cap, Gemini): total image
// bytes per request. Rejecting early avoids a confusing provider error.
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

function sseStreamFromProvider(upstream: Response, extract: (line: string) => string | null, modelUsed?: string): Response {
  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let first = true;
  const stream = new ReadableStream({
    async pull(controller) {
      // Record which model answered (clients ignore events without a delta).
      if (first && modelUsed) {
        first = false;
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ model: modelUsed })}\n\n`));
      }
      const { done, value } = await reader.read();
      if (done) {
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
        return;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const delta = extract(line.trim());
        if (delta) controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ delta })}\n\n`));
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
}

export async function POST(req: NextRequest) {
  if (!rateLimit(req, "chat")) return jsonError("Too many requests. Please wait a moment and try again.", 429);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request.", 400);
  }
  const b = body as { provider?: string; model?: string; customBaseUrl?: string; apiKey?: string; messages?: InMsg[]; searchEnabled?: boolean; aboutMe?: string; mode?: string; confirmedIngredients?: string; barcodeData?: BarcodeProduct };
  if (!b.provider || !(PROVIDERS as readonly string[]).includes(b.provider)) return jsonError("Invalid provider.", 400);
  if (!Array.isArray(b.messages) || b.messages.length === 0 || b.messages.length > 40) return jsonError("Invalid messages.", 400);
  let totalText = 0;
  for (const m of b.messages) {
    if (m.role !== "user" && m.role !== "assistant") return jsonError("Invalid messages.", 400);
    if (typeof m.text !== "string" || m.text.length > 20000) return jsonError("Message too long.", 400);
    totalText += m.text.length;
    if (totalText > 60000) return jsonError("Conversation is too long. Start a new chat to continue.", 400);
    if (m.images) {
      if (m.images.length > 6) return jsonError("Too many images in one message (maximum 6).", 400);
      let bytes = 0;
      for (const img of m.images) {
        if (!img || typeof img.dataUrl !== "string" || !img.dataUrl.startsWith("data:image/") || !ALLOWED_IMAGE_MIMES.has(img.mime)) {
          return jsonError("Only JPEG, PNG, WebP and GIF photos are supported.", 400);
        }
        const b64 = img.dataUrl.split(",")[1] || "";
        if (!/^[A-Za-z0-9+/=]+$/.test(b64)) return jsonError("Photo data is not valid.", 400);
        bytes += Math.floor((b64.length * 3) / 4);
      }
      if (bytes > MAX_IMAGE_BYTES) return jsonError("Photos are too large in total. Please use smaller photos (under 20 MB total).", 400);
      if (b.provider === "local") return jsonError("Photos are not supported with the local model in this build. Choose Gemini, OpenAI, Claude or a compatible vision provider for photo questions.", 400);
    }
  }
  const lastUser = [...b.messages].reverse().find((m) => m.role === "user");
  if (lastUser && !lastUser.text.trim() && !(lastUser.images || []).length) {
    return jsonError("Please type a food question, or attach a photo of food or a label.", 400);
  }
  // Deterministic guards check ONLY the latest user message (Batch 3).
  // Trade-off, documented: an injection split across turns, or planted
  // in an earlier turn, is NOT caught by this check. The mitigation is
  // defence in depth, not history scanning: history is sent to the model
  // as conversation data, About Me and barcode data are sent only inside
  // delimited <...> untrusted-data tags (see Batch 5), and the system
  // prompt instructs the model to treat history and tagged data as data,
  // never as instructions. Live split-turn model behaviour is deferred
  // to Phase 2. Scanning history caused false positives on legitimate
  // follow-ups (e.g. quoting an earlier question) and could not in any
  // case stop a determined split-turn attack once history reaches the
  // model. Guard replies are fixed safe text, never model output, so
  // they cannot leak the prompt or keys.
  const guard =
    lastUser ? classifyUserText(lastUser.text, Boolean(lastUser.images?.length)) : null;
  if (guard) {
    const text = guard.text;
    return new Response(`data: ${JSON.stringify({ delta: text })}\n\ndata: [DONE]\n\n`, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }

  const mode = b.mode === "transcribe" || b.mode === "analyse-confirmed" ? b.mode : "chat";
  const confirmedIngredients = typeof b.confirmedIngredients === "string" ? b.confirmedIngredients.trim() : "";
  if (mode === "transcribe" && !(lastUser && lastUser.images && lastUser.images.length > 0)) {
    return jsonError("A photo is needed for transcription.", 400);
  }
  if (mode === "analyse-confirmed" && (!confirmedIngredients || confirmedIngredients.length > 2000)) {
    return jsonError("Confirmed ingredients text is required for analysis (max 2000 characters).", 400);
  }
  // In analyse-confirmed mode the confirmed text is the ONLY source for
  // the analysis: image parts are never sent to the provider in this mode,
  // so the model cannot re-analyse the photo directly and bypass confirmation.
  const stripImages = mode === "analyse-confirmed";

  // About-me notes are user-provided DATA, delimited and labelled as
  // such, so instruction-like text in them cannot become instructions.
  let system = FOODLENS_SYSTEM_PROMPT;
  // About Me is sent ONLY inside delimited untrusted-data tags (Batch 5).
  if (b.aboutMe) system += `\n\n${formatAboutMe(b.aboutMe)}`;
  // Barcode (Open Food Facts) data is sent ONLY inside delimited
  // untrusted-data tags (Batch 5) — never concatenated into user text.
  if (b.barcodeData) {
    if (typeof b.barcodeData !== "object" || typeof b.barcodeData.code !== "string") {
      return jsonError("Invalid barcode data.", 400);
    }
    system += `\n\n${formatBarcodeData(b.barcodeData)}`;
  }
  if (mode === "transcribe") {
    system += `\n\n${TRANSCRIPTION_ONLY_INSTRUCTION}`;
  }
  if (mode === "analyse-confirmed") {
    system += `\n\n<user-confirmed-ingredients>\n${confirmedIngredients}\n</user-confirmed-ingredients>\nAnalyse ONLY the ingredients text inside <user-confirmed-ingredients> above. It is the text the user read and confirmed from the label. Do not use any earlier transcription or photo description. Do not state any E-number, allergen, ingredient or nutrition value that is not in the confirmed text. Do not use legibility tags such as [Directly visible], [Visual estimate], [Externally verified] or [Unknown] in this analysis. Refer to items only as text the user confirmed; do not present confirmed text as seen in the photo. End with the exact sentence: Please verify against the real label.`;
  }
  const model = (b.model || "").trim();

  // Local provider: Ollama / llama.cpp on localhost. Vision is not
  // supported by this path unless the local model itself is a vision
  // model; the UI says so plainly.
  if (b.provider === "local") {
    const base = (b.customBaseUrl || "http://localhost:11434").replace(/\/$/, "");
    try {
      const res = await fetch(`${base}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: resolveChatModel("local", model, process.env),
          stream: false,
          options: { temperature: CHAT_TEMPERATURE },
          messages: [
            { role: "system", content: system },
            ...b.messages.map((m) => ({ role: m.role, content: m.text })),
          ],
        }),
      });
      if (!res.ok) return jsonError("Local model is unavailable. Start Ollama (or llama.cpp) and check the model name in Settings.", 502);
      const data = (await res.json()) as { message?: { content?: string } };
      const text = data.message?.content || "The local model returned an empty reply.";
      const localModel = resolveChatModel("local", model, process.env);
      return new Response(`data: ${JSON.stringify({ model: localModel })}\n\ndata: ${JSON.stringify({ delta: text })}\n\ndata: [DONE]\n\n`, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      });
    } catch {
      return jsonError("Local model is unavailable. Start Ollama (or llama.cpp) and check the model name in Settings.", 502);
    }
  }

  const clientKey = typeof b.apiKey === "string" && b.apiKey.trim() ? b.apiKey.trim() : undefined;
  const envName = b.provider === "gemini" ? "GEMINI_API_KEY" : b.provider === "openai" ? "OPENAI_API_KEY" : b.provider === "anthropic" ? "ANTHROPIC_API_KEY" : undefined;
  const apiKey = clientKey || (envName ? envKey(envName) : undefined);
  if (!apiKey) {
    return jsonError("No API key configured. Add your key in Settings, or set the server environment key for this deployment. Your key is never stored on the server.", 401);
  }

  try {
    if (b.provider === "gemini") {
      // Step B: test-only localhost override (FOODLENS_GEMINI_BASE_URL).
      // Ignored entirely in production; a non-localhost value in
      // non-production is a 400, never a fetch. See lib/proxy.ts.
      const geminiBase = resolveGeminiBaseUrl();
      if (!geminiBase.ok) return jsonError(geminiBase.error, 400);
      const primaryModel = resolveChatModel("gemini", model, process.env);
      const contents = b.messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [
          { text: m.text },
          ...(!stripImages ? (m.images || []).map((img) => ({
            inline_data: { mime_type: img.mime, data: img.dataUrl.split(",")[1] || "" },
          })) : []),
        ],
      }));
      // Try the requested/default model, then the fallback chain on a
      // model-not-found (404) error only. Quota errors never fall back.
      let res: Response | null = null;
      let usedModel = primaryModel;
      let lastErrorText = "";
      for (const attemptModel of geminiFallbackChain(primaryModel)) {
        const payload: Record<string, unknown> = { system_instruction: { parts: [{ text: system }] }, contents, generationConfig: { temperature: CHAT_TEMPERATURE } };
        if (b.searchEnabled) payload.tools = [{ google_search: {} }];
        const attempt = await fetch(
          `${geminiBase.baseUrl}/v1beta/models/${encodeURIComponent(attemptModel)}:streamGenerateContent?alt=sse`,
          { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey }, body: JSON.stringify(payload) },
        );
        if (attempt.ok) {
          res = attempt;
          usedModel = attemptModel;
          break;
        }
        lastErrorText = await attempt.text().catch(() => "");
        if (isQuotaError(attempt.status, lastErrorText)) {
          const mapped = mapProviderError(attempt.status, lastErrorText);
          return jsonError(mapped.message, mapped.status);
        }
        if (!isModelNotFoundError(attempt.status, lastErrorText)) {
          const mapped = mapProviderError(attempt.status, lastErrorText);
          return jsonError(mapped.message, mapped.status);
        }
        // Model not found: try the next model in the fallback chain.
      }
      if (!res) {
        const mapped = mapProviderError(404, lastErrorText);
        return jsonError(mapped.message, mapped.status);
      }
      return sseStreamFromProvider(res, (line) => {
        if (!line.startsWith("data:")) return null;
        try {
          const j = JSON.parse(line.slice(5));
          const parts = j.candidates?.[0]?.content?.parts as { text?: string }[] | undefined;
          return parts?.map((p) => p.text || "").join("") || null;
        } catch {
          return null;
        }
      }, usedModel);
    }

    if (b.provider === "anthropic") {
      const claudeModel = resolveChatModel("anthropic", model, process.env);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-beta": "messages-2023-12-15" },
        body: JSON.stringify({
          model: claudeModel,
          max_tokens: 1024,
          temperature: CHAT_TEMPERATURE,
          system,
          stream: true,
          messages: b.messages.map((m) => ({
            role: m.role,
            content: [
              ...(!stripImages ? (m.images || []).map((img) => ({ type: "image", source: { type: "base64", media_type: img.mime, data: img.dataUrl.split(",")[1] || "" } })) : []),
              { type: "text", text: m.text || "(photo attached — please describe what you can see and answer honestly.)" },
            ],
          })),
        }),
      });
      if (!res.ok) {
        const mapped = mapProviderError(res.status, await res.text().catch(() => ""));
        return jsonError(mapped.message, mapped.status);
      }
      return sseStreamFromProvider(res, (line) => {
        if (!line.startsWith("data:")) return null;
        try {
          const j = JSON.parse(line.slice(5));
          return j.type === "content_block_delta" ? j.delta?.text || null : null;
        } catch {
          return null;
        }
      }, claudeModel);
    }

    // OpenAI + OpenAI-compatible
    let baseUrl = "https://api.openai.com/v1";
    if (b.provider === "compatible") {
      if (!isCustomBaseUrlAllowed()) {
        return jsonError("Custom base URLs are disabled on this deployment. Choose one of the built-in providers in Settings.", 400);
      }
      if (!b.customBaseUrl || !isSafeHttpsUrl(b.customBaseUrl)) {
        return jsonError("Custom base URL must be a public https URL. Private, localhost and metadata addresses are blocked.", 400);
      }
      baseUrl = b.customBaseUrl.replace(/\/$/, "");
    }
    const openaiModel = resolveChatModel(b.provider === "compatible" ? "compatible" : "openai", model, process.env);
    const payload: Record<string, unknown> = {
      model: openaiModel,
      stream: true,
      temperature: CHAT_TEMPERATURE,
      messages: [
        { role: "system", content: system },
        ...b.messages.map((m) => ({
          role: m.role,
          content: [
            ...(!stripImages ? (m.images || []).map((img) => ({ type: "image_url", image_url: { url: img.dataUrl } })) : []),
            { type: "text", text: m.text || "(photo attached — please describe what you can see and answer honestly.)" },
          ],
        })),
      ],
    };
    if (b.searchEnabled && b.provider === "openai") payload.tools = [{ type: "web_search" }];
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      // Do not follow redirects for a user-supplied base URL: a public
      // URL that redirects to a private address would bypass the SSRF
      // check above. Legitimate chat endpoints do not redirect.
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) return jsonError("The AI provider returned an unexpected redirect. Check your base URL and try again.", 502);
    if (!res.ok) {
      const mapped = mapProviderError(res.status, await res.text().catch(() => ""));
      return jsonError(mapped.message, mapped.status);
    }
    return sseStreamFromProvider(res, (line) => {
      if (!line.startsWith("data:") || line.includes("[DONE]")) return null;
      try {
        const j = JSON.parse(line.slice(5));
        return j.choices?.[0]?.delta?.content || null;
      } catch {
        return null;
      }
    }, openaiModel);
  } catch {
    return jsonError("Could not reach the AI provider. Check your connection and try again.", 502);
  }
}
