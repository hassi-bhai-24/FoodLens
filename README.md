# FOODLENS — Chat before you eat unhealthy

A food-only conversational AI chatbot. Standalone Next.js (App Router) + TypeScript build, intended for a public GitHub repository. This is **not** the Muse hosted-artifact version: it runs as an ordinary Next.js app, stores chats in the browser (IndexedDB), and calls AI providers through thin, stateless server proxy Route Handlers.

Open the app and chat immediately — no login, no onboarding, no forms.

## What it does

- Ask anything about food: nutrition, ingredients, additives, cooking, recipes, substitutions, storage, food safety, diets, allergies, kids' and baby food, pregnancy and food, drinks, groceries, restaurants and menus, food culture, local dishes.
- Send photos (camera, gallery, drag-and-drop, paste, up to 6 per message). Photos are stripped of EXIF/GPS and resized to ~1600px on-device before sending. Answers tag knowledge as `[Directly visible]`, `[Visual estimate]`, `[Externally verified]` or `[Unknown]`, never invent ingredients or nutrition numbers, and ask for the exact extra photo only when it would materially help.
- Scan barcodes (camera via `BarcodeDetector` where the browser supports it, otherwise manual entry) with EAN-13/EAN-8/UPC-A check-digit validation and Open Food Facts lookup, cached for 7 days. Crowdsourced data can be wrong; missing fields are marked as missing.
- Multiple chats with search, rename (via first message title), delete, delete-all, edit-and-resend, regenerate, copy, stop generation, thumbs feedback, read-aloud, safe markdown, and JSON export/import (text only — photo files are not included in exports).
- Food-only scope: non-food questions get a brief, kind redirect. The scope cannot be overridden by text inside images, web pages, search results, or "ignore your instructions" attempts.
- Web search is **off by default**. When enabled, provider-native search (Gemini/OpenAI) is used; a separate Tavily/Brave server search runs only if a key is configured, otherwise the app says so honestly and never claims a search that did not happen.

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm start
```

Copy `.env.example` to `.env.local` to set optional server-side provider/search keys (see below). No key is required to run the app, but **real AI answers need a key**: either a server env key, or a user-entered key in Settings.

## AI providers and keys

Settings supports Google Gemini, OpenAI, Anthropic Claude, OpenAI-compatible endpoints, and Local (Ollama / llama.cpp). Model lists are fetched dynamically where the provider supports it; Anthropic has no list API, so type a model name there.

- **User-entered keys** are encrypted in IndexedDB with a WebCrypto AES-GCM wrapping key whose JWK is stored in IndexedDB, so a saved key survives reloads and full tab closes (fixed in preview v6: a save also verifies its own persistence before reporting success, and concurrent saves share one wrapping key). Plaintext is decrypted only in memory and sent per request over HTTPS to the proxy, which never stores or logs keys. Trade-off, stated plainly: the wrapping key's JWK is extractable by design, so anyone with access to this browser profile could in principle unwrap a saved key; a key can always be removed in Settings. Keys never appear in bundles, errors, logs or git.
- **Server env keys** (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`) let users chat without entering a key. User-entered keys take precedence per request.
- **Default models** are configurable with `FOODLENS_GEMINI_MODEL`, `FOODLENS_OPENAI_MODEL` and `FOODLENS_ANTHROPIC_MODEL` (see `.env.example`); a model chosen in Settings takes precedence. For Gemini, a 404 (model not found) retries with `gemini-3.5-flash-lite`, then `gemini-flash-latest`, and the model that answered is recorded in the SSE stream; quota/429 errors are never retried against a fallback and return a friendly 429 message. Chat temperature is fixed at 0.3 in the proxy for factual and photo analysis.
- **System prompt:** the single canonical source is `lib/prompt.ts`. `prompts/foodlens.system.v1.md` is generated from it with `npm run sync-prompt` and must not be edited by hand; unit tests assert the two match.
- **Custom base URLs** (OpenAI-compatible) must be public `https:` URLs. Private ranges, localhost and metadata addresses are blocked (SSRF). The proxy is rate-limited (30 requests/minute per client IP).
- **Proxy trust (Batch 6):** `x-forwarded-for` is used for rate limiting only when `TRUST_PROXY=true` (known proxy deployment); by default all clients share one bucket key (`direct`), so the header cannot be spoofed to bypass limits. `ALLOW_CUSTOM_BASE_URL=false` disables user-supplied compatible base URLs on hosted deployments. See `.env.example`.
- **Test-only mock upstreams (Step B):** `FOODLENS_GEMINI_BASE_URL` and `FOODLENS_OFF_BASE_URL` point the Gemini and Open Food Facts fetches at local mock servers. They are honoured only for localhost URLs (`localhost`, `127.0.0.1`, `::1`) and only when `NODE_ENV` is not `production`; in production they are ignored entirely and the real endpoints are used, and a non-localhost value in non-production returns 400 instead of fetching. Never set them on a hosted deployment. The mocks live in `scripts/mock-gemini.mjs` and `scripts/mock-off.mjs` (Node built-ins only, never imported by app code) and their results are labelled mock upstream, not real Google / Open Food Facts.
- **Local:** point Settings at Ollama (`http://localhost:11434`) or llama.cpp with a running model. Photos need an online vision provider or a local vision model; the local text path cannot see photos, and the UI says so.

## Offline AI — honest status

The app has no AI model of its own — no weights, no training, no bundled or downloadable model. Two things produce answers:

- A local code-based knowledge engine (`lib/local-answers.ts`): curated food data and rules written in code — hundreds of everyday, market, hotel and packaged foods with pros and cons, recipes, topic guides and Roman Urdu names — that answers common food questions in the browser when no API key is set. It is NOT a trained model; it cannot read photos, and for brand-named packaged foods it gives cautious general guidance only and asks for the label. For questions it cannot answer it says so and falls back to the cloud path (which reports the usual "no key" message when no key exists anywhere).
- An external AI provider (Gemini/OpenAI/Claude/compatible) through the thin proxy when a key is configured (server env key or the user's saved key).

The app shell is cached by a service worker and saved chats remain readable offline, but photo analysis and full AI answers need a provider. Do not claim offline AI works until it is tested in airplane mode. For a locally hosted model, use the Local provider with Ollama.

## Privacy

Local by default: chats and images live in IndexedDB in the user's browser. Users can rename/delete chats, delete all history, clear app data, and manage saved keys. Messages and images sent to cloud providers are processed under those providers' policies — nothing is uploaded silently; sending a message is the explicit action. This app is not medical advice. Product data: Open Food Facts (ODbL).

## Project structure

```
app/            App Router pages, layout, globals, API proxy routes
  api/chat/     Provider proxy (Gemini/OpenAI/Claude/compatible/Local, SSE)
  api/models/   Dynamic model lists
  api/search/   Tavily/Brave search (503 when unconfigured)
  api/barcode/  Open Food Facts lookup with required User-Agent
lib/            IndexedDB, key vault, image pipeline, barcode, markdown, proxy helpers, canonical system prompt (`prompt.ts`), model defaults/fallback (`models.ts`)
prompts/        Generated copy of the FOODLENS system prompt (v1) — generated from `lib/prompt.ts`, do not edit by hand
public/         PWA manifest, service worker, icons
```

## Testing / verification

See `PROGRESS.md` for the feature-by-status table and what was actually verified. `npm run typecheck` and `npm run build` are the checks run for this build; there is no test suite yet (see PROGRESS.md, "Not done").

## Limitations

- No token-by-token streaming guarantee is claimed beyond the SSE proxy: the proxy re-emits provider deltas, but behaviour without a live provider key is unverified.
- HEIC photos are rejected with a clear message (no HEIC decoder bundled).
- Camera barcode scanning depends on browser `BarcodeDetector`; manual entry always works, and a ZXing fallback is not bundled.
- No automated tests, Playwright E2E, axe or Lighthouse runs in this build.

## Known limitations

- Blurry-label transcription can still be wrong when the model misreads a soft photo. Preview v7/v8 adds an on-device first line of defence: the image pipeline now estimates blur, darkness and flatness on the canvas (pure code, lib/photo-check.ts) and the composer warns before sending that a photo looks too blurry or too dark to read as a label — the send is never blocked, because a food photo needs no readable text. In live testing, one run under extreme blur, rotation and darkness once invented a code that was not on the label (test 18). Always check the transcription in the "Ingredients I read" box and correct it before confirming: the analysis uses exactly the text you confirm, so confirming wrong text means the analysis uses it.
- A related wording gap was found in Step C (Finding F1, Low): the analysis labelled user-confirmed items as directly visible in the photo, presenting confirmed text as photo evidence. The analyse-confirmed instruction was fixed to forbid legibility tags and to refer to items only as text the user confirmed. One live re-test with deliberately wrong confirmed text passed after the fix: no legibility tags, only the confirmed text used. Test 18 stays PARTIAL because the transcription invention above remains.
- Finding F1 and its fix/re-test are recorded in the bullet above. Photo verification (2026-11-02, synthetic labels only): six synthetic labels passed the two-step transcribe-confirm-analyse flow live via `gemini-3.5-flash-lite` (12 calls, 0 429s) — clear English, no-dangerous-items, blurred/dark/rotated, Urdu script, a peanut-allergy question, and small-print E-numbers. No transcription invented an E-number or allergen; every analysis flagged every allergen/concerning item in the confirmed text and invented none; no legibility tags appeared in any analysis; the verify sentence was present in every reply. Real packet photos and a real phone/camera are still unverified, and test 18 stays PARTIAL.
- OpenAI and Claude are untested live in this build: their proxy code is unit-tested and code-reviewed only. No live key for either was used.
- No offline model is bundled or downloaded. Offline chat does not work in this build.
- HEIC photos are rejected with a clear message. Convert them to JPEG or PNG first.
- The free Gemini quota is small (about 20 requests per day on gemini-3.5-flash; gemini-3.5-flash-lite has a separate limit). Add your own key in Settings for regular use.
- Only 15 of the 150 tests were re-run live on the final prompt (Step C batch 1); the other 135 were not re-run on the final prompt, so the test totals mix Step C runs with earlier runs. See QA-RESULTS.json for which tests were re-run.
- `npm audit` and the real-phone checks in MANUAL-UI-CHECKLIST.md are still to be done by the user. They were not completed in this work.
- FOODLENS gives general food information only. It is not medical advice. Always check allergens on the real label and ask a doctor or dietitian about medical questions.

## License

MIT — add your preferred licence text before publishing if you want a different one.
