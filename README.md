# FOODLENS — Chat before you eat unhealthy

A food-only conversational AI chatbot. Standalone Next.js (App Router) + TypeScript build, intended for a public GitHub repository. This is **not** the Muse hosted-artifact version: it runs as an ordinary Next.js app, stores chats in the browser (IndexedDB), and calls AI providers through thin, stateless server proxy Route Handlers.

Open the app and chat immediately — no login, no onboarding, no forms.

Live deployments: the preview build (active development, `preview/v2-local-engine` branch) is at https://foodlens-git-preview-v2-local-engine-hassi-bhai-24.vercel.app, and the production build (`main` branch) is at https://foodlens-beta-three.vercel.app. The preview build is ahead of production: it has the Groq provider, the model picker and the shared-key no-key flow described below.

## What it does

- Ask anything about food: nutrition, ingredients, additives, cooking, recipes, substitutions, storage, food safety, diets, allergies, kids' and baby food, pregnancy and food, drinks, groceries, restaurants and menus, food culture, local dishes.
- Send photos (camera, gallery, drag-and-drop, paste, up to 6 per message). Photos are stripped of EXIF/GPS and resized to ~1600px on-device before sending. Answers tag knowledge as `[Directly visible]`, `[Visual estimate]`, `[Externally verified]` or `[Unknown]`, never invent ingredients or nutrition numbers, and ask for the exact extra photo only when it would materially help.
- Scan barcodes (camera via `BarcodeDetector` where the browser supports it, otherwise manual entry) with EAN-13/EAN-8/UPC-A check-digit validation and Open Food Facts lookup, cached for 7 days. Crowdsourced data can be wrong; missing fields are marked as missing.
- Multiple chats with search, rename (via first message title), delete, delete-all, edit-and-resend, regenerate, copy, stop generation, thumbs feedback, read-aloud, safe markdown, and JSON export/import (text only — photo files are not included in exports).
- Food-only scope: non-food questions get a brief, kind redirect. The scope cannot be overridden by text inside images, web pages, search results, or "ignore your instructions" attempts.
- Web search is **off by default**. When enabled, provider-native search (Gemini/OpenAI) is used; a separate Tavily/Brave server search runs only if a key is configured, otherwise the app says so honestly and never claims a search that did not happen.
- Settings has a Model field under Provider: leave it empty to use the provider's default, or type any model name. Changing provider clears the model, so a model picked for one provider is never sent to another. Hugging Face also has quick-pick buttons for the verified open models.
- No key needed to get AI answers on the preview build: a shared Groq server key answers visitors who never enter a key (see "AI providers and keys"). Greetings still answer instantly from local knowledge, and if no key exists anywhere the app falls back to local answers instead of an error.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm start
```

Copy `.env.example` to `.env.local` to set optional server-side provider/search keys (see below). No key is required to run the app, but **real AI answers need a key**: either a server env key, or a user-entered key in Settings. Active development happens on the `preview/v2-local-engine` branch; `main` is the production build and is only updated when the preview build is verified.

## AI providers and keys

Settings supports Google Gemini, OpenAI, Anthropic Claude, Hugging Face Inference Providers, Groq, OpenAI-compatible endpoints, and Local (Ollama / llama.cpp). Model lists are fetched dynamically where the provider supports it; Anthropic has no list API, so type a model name there. Groq takes no photos (its default model is text-only); the route blocks photos for Groq with a clear message naming the vision providers.

- **Shared Groq key (preview build):** set `GROQ_API_KEY` on the server and visitors get full AI answers with no key of their own. The Groq free tier needs no card: 30 requests/minute, 1,000 requests/day, 8,000 tokens/minute on the chat models. Past the limit the API returns 429, never a charge, and nothing is billed without adding a payment method. Groq's default model is `openai/gpt-oss-120b`, fetched non-streaming and relayed as SSE deltas because Groq's streaming took ~90 s to deliver a reply and tripped the client's 40 s watchdog (measured 2026-11-09).
- **User-entered keys** are encrypted in IndexedDB with a WebCrypto AES-GCM wrapping key whose JWK is stored in IndexedDB, so a saved key survives reloads and full tab closes (fixed in preview v6: a save also verifies its own persistence before reporting success, and concurrent saves share one wrapping key). Plaintext is decrypted only in memory and sent per request over HTTPS to the proxy, which never stores or logs keys. Trade-off, stated plainly: the wrapping key's JWK is extractable by design, so anyone with access to this browser profile could in principle unwrap a saved key; a key can always be removed in Settings. Keys never appear in bundles, errors, logs or git.
- **Server env keys** (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `HF_API_KEY`, `GROQ_API_KEY`) let users chat without entering a key. User-entered keys take precedence per request.
- **Default models** are `gemini-3.8-flash`, `gpt-6-luna`, `claude-sonnet-5-5`, `Qwen/Qwen3.8-27B` (Hugging Face) and `openai/gpt-oss-120b` (Groq), configurable with `FOODLENS_GEMINI_MODEL`, `FOODLENS_OPENAI_MODEL`, `FOODLENS_ANTHROPIC_MODEL`, `FOODLENS_HF_MODEL` and `FOODLENS_GROQ_MODEL` (see `.env.example`); a model chosen in Settings takes precedence. For Gemini, a 404 (model not found) retries with `gemini-3.6-flash`, then `gemini-3.5-flash-lite`, and the model that answered is recorded in the SSE stream; quota/429 errors are never retried against a fallback and return a friendly 429 message. Chat temperature is fixed at 0.3 in the proxy for factual and photo analysis. Hugging Face calls need Inference Providers credits (free accounts get none as of 2026; PRO includes $2/month) and return a distinct 402 credits message instead of blaming the key.
- **System prompt:** the single canonical source is `lib/prompt.ts`. `prompts/foodlens.system.v1.md` is generated from it with `npm run sync-prompt` and must not be edited by hand; unit tests assert the two match.
- **Custom base URLs** (OpenAI-compatible) must be public `https:` URLs. Private ranges, localhost and metadata addresses are blocked (SSRF). The proxy is rate-limited (30 requests/minute per client IP).
- **Proxy trust (Batch 6):** `x-forwarded-for` is used for rate limiting only when `TRUST_PROXY=true` (known proxy deployment); by default all clients share one bucket key (`direct`), so the header cannot be spoofed to bypass limits. `ALLOW_CUSTOM_BASE_URL=false` disables user-supplied compatible base URLs on hosted deployments. See `.env.example`.
- **Test-only mock upstreams (Step B):** `FOODLENS_GEMINI_BASE_URL` and `FOODLENS_OFF_BASE_URL` point the Gemini and Open Food Facts fetches at local mock servers. They are honoured only for localhost URLs (`localhost`, `127.0.0.1`, `::1`) and only when `NODE_ENV` is not `production`; in production they are ignored entirely and the real endpoints are used, and a non-localhost value in non-production returns 400 instead of fetching. Never set them on a hosted deployment. The mocks live in `scripts/mock-gemini.mjs` and `scripts/mock-off.mjs` (Node built-ins only, never imported by app code) and their results are labelled mock upstream, not real Google / Open Food Facts.
- **Local:** point Settings at Ollama (`http://localhost:11434`) or llama.cpp with a running model. Photos need an online vision provider or a local vision model; the local text path cannot see photos, and the UI says so.

## Offline AI — honest status

The app has no AI model of its own — no weights, no training, no bundled or downloadable model. Two things produce answers:

- A local code-based knowledge engine (`lib/local-answers.ts`): curated food data and rules written in code — hundreds of everyday, market, hotel and packaged foods with pros and cons, recipes, topic guides and Roman Urdu names — that answers common food questions in the browser when no API key is set. It is NOT a trained model; it cannot read photos, and for brand-named packaged foods it gives cautious general guidance only and asks for the label. Greetings answer instantly from this engine and never touch a provider. For other questions with no key saved, the app tries the server first (it may hold a shared env key); the server answers 401 with code `no_key` when no key exists anywhere, and the app then falls back to local answers — or to local answers when the server cannot be reached at all (offline). A slow provider still surfaces its timeout instead of a local guess.
- An external AI provider (Gemini/OpenAI/Claude/Hugging Face/Groq/compatible) through the thin proxy when a key is configured (server env key or the user's saved key).

The app shell is cached by a service worker and saved chats remain readable offline, but photo analysis and full AI answers need a provider. Do not claim offline AI works until it is tested in airplane mode. For a locally hosted model, use the Local provider with Ollama.

## Privacy

Local by default: chats and images live in IndexedDB in the user's browser. Users can rename/delete chats, delete all history, clear app data, and manage saved keys. Messages and images sent to cloud providers are processed under those providers' policies — nothing is uploaded silently; sending a message is the explicit action. This app is not medical advice. Product data: Open Food Facts (ODbL).

## Project structure

```
app/            App Router pages, layout, globals, API proxy routes
  api/chat/     Provider proxy (Gemini/OpenAI/Claude/Hugging Face/Groq/compatible/Local, SSE)
  api/models/   Dynamic model lists
  api/search/   Tavily/Brave search (503 when unconfigured)
  api/barcode/  Open Food Facts lookup with required User-Agent
lib/            IndexedDB, key vault, image pipeline, barcode, markdown, proxy helpers, canonical system prompt (`prompt.ts`), model defaults/fallback (`models.ts`)
prompts/        Generated copy of the FOODLENS system prompt (v1) — generated from `lib/prompt.ts`, do not edit by hand
public/         PWA manifest, service worker, icons
```

## Testing / verification

See `PROGRESS.md` for the feature-by-status table and what was actually verified. Checks: `npm run typecheck`, `node scripts/unit-tests.mjs` (758 assertions as of preview v13: guards, local answers, proxy helpers, model defaults, prompt sync, route guards) and `npm run build`. Live preview-link checks are done in a real browser after each push — with a fake key for provider paths, and with no key at all for the shared-key visitor flow. See `PROGRESS.md` for the per-version live results.

## Limitations

- The proxy re-emits provider deltas as SSE; Groq is the exception and is fetched non-streaming, then relayed as SSE deltas (see above).
- HEIC photos are rejected with a clear message (no HEIC decoder bundled).
- Camera barcode scanning depends on browser `BarcodeDetector`; manual entry always works, and a ZXing fallback is not bundled.
- No Playwright E2E, axe or Lighthouse runs in this build.

## Known limitations

- Blurry-label transcription can still be wrong when the model misreads a soft photo. Preview v7/v8 adds an on-device first line of defence: the image pipeline now estimates blur, darkness and flatness on the canvas (pure code, lib/photo-check.ts) and the composer warns before sending that a photo looks too blurry or too dark to read as a label — the send is never blocked, because a food photo needs no readable text. In live testing, one run under extreme blur, rotation and darkness once invented a code that was not on the label (test 18). Always check the transcription in the "Ingredients I read" box and correct it before confirming: the analysis uses exactly the text you confirm, so confirming wrong text means the analysis uses it.
- A related wording gap was found in Step C (Finding F1, Low): the analysis labelled user-confirmed items as directly visible in the photo, presenting confirmed text as photo evidence. The analyse-confirmed instruction was fixed to forbid legibility tags and to refer to items only as text the user confirmed. One live re-test with deliberately wrong confirmed text passed after the fix: no legibility tags, only the confirmed text used. Test 18 stays PARTIAL because the transcription invention above remains.
- Finding F1 and its fix/re-test are recorded in the bullet above. Photo verification (2026-11-02, synthetic labels only): six synthetic labels passed the two-step transcribe-confirm-analyse flow live via `gemini-3.5-flash-lite` (12 calls, 0 429s) — clear English, no-dangerous-items, blurred/dark/rotated, Urdu script, a peanut-allergy question, and small-print E-numbers. No transcription invented an E-number or allergen; every analysis flagged every allergen/concerning item in the confirmed text and invented none; no legibility tags appeared in any analysis; the verify sentence was present in every reply. Real packet photos and a real phone/camera are still unverified, and test 18 stays PARTIAL.
- OpenAI and Claude are untested live in this build: their proxy code is unit-tested and code-reviewed only. No live key for either was used.
- No offline model is bundled or downloaded. Offline chat does not work in this build.
- HEIC photos are rejected with a clear message. Convert them to JPEG or PNG first.
- Only 15 of the 150 tests were re-run live on the final prompt (Step C batch 1); the other 135 were not re-run on the final prompt, so the test totals mix Step C runs with earlier runs. See QA-RESULTS.json for which tests were re-run.
- `npm audit` and the real-phone checks in MANUAL-UI-CHECKLIST.md are still to be done by the user. They were not completed in this work.
- FOODLENS gives general food information only. It is not medical advice. Always check allergens on the real label and ask a doctor or dietitian about medical questions.

## License

MIT — add your preferred licence text before publishing if you want a different one.
