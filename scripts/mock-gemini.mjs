// Test-only mock Gemini upstream — mock upstream, not real Google.
// Node built-ins only. Never imported by app code. Run only on
// localhost, pointed at by FOODLENS_GEMINI_BASE_URL in development.
// Captures each request (model, URL, payload shape/body) to a JSON-lines
// capture file for inspection. Never logs or stores any API key: only
// whether an x-goog-api-key header was present is recorded.
//
// Usage:
//   node scripts/mock-gemini.mjs --port 4101 --mode fallback-404 \
//     --fail-model gemini-3.8-flash --capture-file /tmp/gemini-capture.jsonl
// Modes:
//   fallback-404  404 (Google-style NOT_FOUND body) for --fail-model,
//                 200 SSE reply for every other model.
//   quota-429     429 RESOURCE_EXHAUSTED body for every request.
//   success       200 SSE reply for every request.
import { createServer } from "node:http";
import { appendFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
function argValue(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const port = Number(argValue("--port", "4101"));
const mode = argValue("--mode", "success");
const failModel = argValue("--fail-model", "gemini-3.8-flash");
const captureFile = argValue("--capture-file", "/tmp/mock-gemini-capture.jsonl");
if (!["fallback-404", "quota-429", "success"].includes(mode)) {
  console.error(`mock-gemini: unknown mode ${mode}`);
  process.exit(1);
}
writeFileSync(captureFile, "");

let seq = 0;
const server = createServer((req, res) => {
  let bodyText = "";
  req.on("data", (chunk) => {
    bodyText += chunk;
  });
  req.on("end", () => {
    seq += 1;
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const match = url.pathname.match(/^\/v1beta\/models\/([^/]+):(streamGenerateContent|generateContent)$/);
    const model = match ? decodeURIComponent(match[1]) : null;
    let body = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      body = null;
    }
    // Capture shape and body for inspection. Header VALUES are never
    // recorded; only whether a key header was present.
    const record = {
      seq,
      method: req.method,
      url: url.pathname + url.search,
      model,
      hasApiKeyHeader: Boolean(req.headers["x-goog-api-key"]),
      bodyShape: body
        ? {
            hasSystemInstruction: Boolean(body.system_instruction),
            systemInstructionText: body.system_instruction?.parts?.[0]?.text ?? null,
            contentsCount: Array.isArray(body.contents) ? body.contents.length : null,
            contents: body.contents ?? null,
            generationConfig: body.generationConfig ?? null,
            tools: body.tools ?? null,
          }
        : null,
    };
    appendFileSync(captureFile, `${JSON.stringify(record)}\n`);

    if (!match) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { code: 404, message: "Mock upstream: unknown path (not real Google).", status: "NOT_FOUND" } }));
      console.log(`request ${seq} model=${model} status=404 (unknown path)`);
      return;
    }
    if (mode === "quota-429") {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: 429,
            message: "Quota exceeded for quota metric 'Generate Content API requests per minute' and limit 'GenerateContent requests per minute per project'. RESOURCE_EXHAUSTED (mock upstream, not real Google).",
            status: "RESOURCE_EXHAUSTED",
          },
        }),
      );
      console.log(`request ${seq} model=${model} status=429 (mock quota)`);
      return;
    }
    if (mode === "fallback-404" && model === failModel) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            code: 404,
            message: `models/${model} is not found for API version v1beta, or is not supported for generateContent. Call ListModels to see the list of available models and their supported methods. (mock upstream, not real Google)`,
            status: "NOT_FOUND",
          },
        }),
      );
      console.log(`request ${seq} model=${model} status=404 (mock model-not-found)`);
      return;
    }
    // Google-shaped SSE reply: one data line with candidates/content/parts.
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.end(
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: "Mock upstream reply (not real Google): this is a test answer about food." }] } }] })}\n\ndata: [DONE]\n\n`,
    );
    console.log(`request ${seq} model=${model} status=200 (mock reply)`);
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`mock-gemini listening on http://127.0.0.1:${port} mode=${mode} fail-model=${failModel} (mock upstream, not real Google)`);
});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
