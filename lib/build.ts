// Build label shown in Settings so a bug report can say exactly which
// build is running. Bump on every preview-branch fix.
// preview v7: /api/models hang fixed (fetch timeouts in all four proxy
// routes), on-device blurry/dark photo warning added, npm audit fixed
// (postcss override), local engine expanded (v7 batch).
// preview v8: docs updated (key vault, local engine, blur defence),
// final verification pass.
// preview v9: hang-then-fail fixed — every provider fetch bounded by a
// 30 s headers timeout, SSE streams by a 30 s inactivity watchdog
// (lib/provider-net.ts), client-side 45 s first-byte / 40 s chunk /
// 180 s total watchdogs with clear error text, pure greetings answered
// instantly from code, service-worker cache bumped to v4.
// preview v10: Hugging Face provider added (router.huggingface.co/v1,
// default Qwen/Qwen3.8-27B, vision on) with a distinct 402 credits
// error (lib/proxy.ts). No other provider touched.
// preview v11: model picker in Settings (text input + curated Hugging
// Face suggestions) and a route guard that blocks photos to known
// text-only models with a clear message.
// preview v12: Groq provider (free tier, gpt-oss-120b default) with a
// shared server key, and server-first no-key flow — the client tries
// the server and falls back to local answers on 401/no_key or offline.
// preview v13: Groq answers are fetched non-streaming and relayed as
// SSE deltas, because Groq's streaming took ~90 s to deliver a reply
// and tripped the client's 40 s watchdog.
export const BUILD_LABEL = "preview v13";
