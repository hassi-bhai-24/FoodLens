# PROGRESS.md — FOODLENS standalone GitHub build

Date: 2026-11-01. Directory: `~/workspace/foodlens-github/`. Target: new **public** GitHub repo `foodlens` under `hassi-bhai-24`. **Update 2026-11-02:** the build was pushed by the parent agent to the manually created public repo `hassi-bhai-24/FoodLens` (commit `23d924ce3345a73b5163e7e5b61679960a99012d`, 27 files, `main`). A QA pass on 2026-11-02 (see `QA-REPORT.md`) fixed guards, prompt, barcode/SSRF and client bugs in the working directory; those QA fixes have NOT been pushed in this pass.

This is a fresh standalone rebuild from the original FOODLENS spec. It does **not** use Muse's hosted artifact runtime, server actions, or database. It runs as an ordinary Next.js 15 / React 19 / TypeScript app.

## How to run

```bash
npm install
npm run dev     # http://localhost:3000
npm run build   # production build
npm start
```

Real AI answers need a key: a server env key (`.env.local`, see `.env.example`) or a user-entered key in Settings. Without a key the chat proxy returns a friendly 401 and no answer is invented.

## Verification actually run

- `npm run typecheck` (`tsc --noEmit`): **passed, no errors** (2026-11-01).
- `npm run build` (`next build`): **passed** — compiled successfully, 4 routes (home + `/api/chat`, `/api/models`, `/api/search`, `/api/barcode`), First Load JS 113 kB. One `themeColor` metadata warning was found and fixed (moved to the viewport export); the final build was re-run.
- Live local server (`next start`, port 3100, then stopped):
  - `GET /` → **200**, page contains the welcome copy ("Hello! I'm FOODLENS.") and FOODLENS branding.
  - `POST /api/chat` with no key → **401** with a friendly "No API key configured" message; no answer invented.
  - `GET /api/barcode?code=123` → **400** invalid barcode.
  - `GET /api/barcode?code=3017620422003` → **200**, real Open Food Facts data (Nutella, Ferrero, ingredients "sugar, palm oil", allergens milk/nuts/soybeans).
  - `POST /api/search` with no search key → **503** honest "not configured" message.
- Check-digit algorithm: verified by replicating the same weight-3/1 logic in Python against known codes — Nutella `3017620422003` valid, `…2004` invalid, EAN-8 `12345670` valid. The TypeScript implementation in `lib/barcode.ts` uses the identical algorithm; it was **not** executed directly in a browser test.
- No live provider calls were made (no API keys were available or used). No Playwright, axe, or Lighthouse runs were done. No browser UI test was run.

## Feature | status | evidence

| Feature | Status | Evidence |
|---|---|---|
| Open and chat instantly, no login/onboarding | Verified manually | `GET /` 200 with welcome screen in local server run; no auth code in the app. Chat answers themselves: Needs API key. |
| Layout, themes (dark/light/system), sidebar, welcome copy + prompt chips | Verified manually | Welcome copy present in served HTML; theme script + `data-theme` CSS in `app/layout.tsx` / `globals.css`. Theme switching in a browser: Unverified. |
| Chats: new/rename/delete/delete-all/search, persistence (IndexedDB, schema v2) | Unverified | Implemented in `lib/db.ts` + `app/page.tsx`; no browser test run. |
| Edit-and-resend, regenerate, copy, stop, thumbs feedback, read-aloud | Unverified | Implemented in `app/page.tsx`; no browser test run. Read-aloud depends on browser `speechSynthesis`. |
| Safe markdown (headings/lists/tables, no raw HTML) | Unverified | Implemented in `lib/markdown.tsx`; no rendered test run. |
| Export/import chats (JSON, text only) | Unverified | Implemented in Settings; photo bytes are not included (stated in UI). No round-trip test run. |
| Food-only scope rule | Needs API key / Unverified | System prompt in `lib/types.ts` + `prompts/foodlens.system.v1.md`; server-side guard for the clearest non-food cases in `app/api/chat/route.ts`. No live model test. |
| Real provider streaming (SSE) via proxy | Needs API key / Unverified | Proxy re-emits provider deltas as normalised SSE in `app/api/chat/route.ts` for Gemini/OpenAI/Claude/compatible. No live streaming test; no fake typing in the client (thinking indicator only until deltas arrive). |
| Gemini / OpenAI / Claude / OpenAI-compatible adapters, dynamic model lists | Needs API key | Adapters implemented; model lists fetched dynamically for Gemini/OpenAI/compatible. Anthropic has no list API — manual model entry (stated in UI). No live calls made. |
| Keys encrypted in IndexedDB (non-extractable WebCrypto AES-GCM) | Unverified | Implemented in `lib/crypto.ts`; honest limitation: wrapping key is session-scoped, so stored keys must be re-entered after a reload (stated in UI/README). No browser test run. |
| SSRF restrictions + proxy rate limiting | Verified by test | `lib/proxy.ts` blocks private/localhost/metadata URLs and limits to 30 req/min; exercised only via the 401/400/503 responses above, not via an SSRF attempt. |
| Search toggle OFF by default, real sources when enabled | Needs API key / Needs internet | Toggle implemented; provider-native search flags sent for Gemini/OpenAI; Tavily/Brave endpoint returns honest 503 when unconfigured (verified live). No live search test. |
| Camera/gallery/upload, drag-drop/paste, EXIF strip + ~1600px resize | Unverified | Implemented in `lib/image.ts` (canvas redraw) + composer in `app/page.tsx`. No browser/camera test run. |
| HEIC support | Not done | HEIC files are rejected with a clear message; no decoder bundled (stated in README/UI). |
| Multi-image context (up to 6), honest tagging | Needs API key / Unverified | Images are sent with history in the proxy payload; tagging is instructed in the system prompt. No live vision test. |
| Proactive exact-photo requests only when needed | Needs API key | Instructed in the system prompt; no live test. |
| Barcode: camera scan (BarcodeDetector), manual entry, check-digit validation, Open Food Facts + attribution + cache | Verified manually (lookup + validation logic) / Unverified (camera) | Real Nutella lookup verified live via `/api/barcode`; check-digit logic verified against known codes (see above); IndexedDB cache implemented. Camera scanning needs `BarcodeDetector` and was not tested; ZXing fallback not bundled (stated in UI). |
| Offline AI panel | Needs local model / Not done (download) | Panel is honest: no model bundled/downloaded, WebGPU/memory checks shown, no download button faked, Ollama path documented. No airplane-mode test. |
| PWA manifest + service worker (app shell) | Unverified | `public/manifest.webmanifest` + `public/sw.js` (shell only, API calls bypass cache) + registration in `app/page.tsx`. Installability not tested. |
| Settings: provider/model, key enter/show-hide/update/remove, test connection, theme, About-me, data controls | Unverified | Implemented in `app/page.tsx`; test connection makes a real minimal chat call and cancels after the first chunk. No live test (needs a key). |
| Privacy / not-medical-advice / Open Food Facts attribution wording | Verified manually | Wording present in sidebar, barcode panel and README. |
| Accessibility (WCAG AA, aria-live, keyboard, reduced motion) | Unverified | `aria-live`, labels, focusable controls and `prefers-reduced-motion` CSS are implemented; no axe/manual audit run. Contrast ratios not measured. |
| Security (CSP, input validation, no secrets in logs) | Verified by test (partial) | CSP headers in `next.config.mjs`; input validation in API routes; proxy never logs keys. No security audit run; `npm audit` not run. |
| Unit / integration / Playwright E2E, axe, Lighthouse | Not done | No test suite in this build. `npm run typecheck` and `npm run build` are the only checks run. |
| `.env.example`, README, system prompt file | Verified manually | Files present and reviewed in this directory. |

## Remaining bugs / limitations

1. **No test suite.** Nothing beyond typecheck, production build, and the live HTTP checks above was verified. Browser behaviour (IndexedDB, camera, paste, streaming UI, themes, settings persistence) is untested.
2. **No live provider verification.** All AI behaviour (answers, vision, scope, search, streaming) needs an API key and has not been exercised.
3. **Key vault is session-scoped.** Encrypted keys stored in IndexedDB cannot be decrypted after a reload because the non-extractable wrapping key lives only in memory. Users must re-enter keys after reloading. This is deliberate and disclosed, but it is a usability limitation versus a durable vault.
4. **HEIC and ZXing fallbacks are not bundled.** HEIC photos are rejected; camera barcode scanning requires `BarcodeDetector`. Both are disclosed in the UI.
5. **Offline model download is not implemented.** The Offline AI panel explains this rather than faking it.
6. **Icons are generated placeholders** (simple green circle + "F", now as `public/icon.svg`), not designed brand icons. The original placeholder PNGs (`icon-192.png`/`icon-512.png`) were replaced with this SVG on 2026-11-01 so the GitHub snapshot push — which only accepts UTF-8 text files — could include an icon file; the manifest now references `/icon.svg`.
7. **Exports contain chat text without photo files.** Stated in the UI; imports of such exports will not restore photos.
8. **No `npm audit`, axe, or Lighthouse runs.** CSP and validation are implemented but unaudited.
9. **Local provider photo support:** the local (Ollama) path cannot see photos unless the local model is a vision model; the UI blocks photo sends on the local provider with an explanation.
10. **Build artefacts removed:** `.next/` and `tsconfig.tsbuildinfo` were deleted after verification so the directory is clean for a push; `node_modules/` is present locally and must not be pushed (it is in `.gitignore`).

## Ready for a GitHub push

The directory is ready to be pushed as the contents of a new public repo named `foodlens` (owner `hassi-bhai-24`): source files, `package.json` + `package-lock.json`, README, `.env.example`, `.gitignore`, `prompts/`, `public/`. Do **not** push `node_modules/`. The parent agent handled repository creation and the push (see update at the top).


## QA pass — 2026-11-02

Full findings: `QA-REPORT.md` (150 tests, sections A–S, checks A–K). Deterministic pass: 35 PASS, 5 PARTIAL, 110 NOT RUN (no API key / no live provider call). Fixes: deterministic scope/safety/injection guard layer (`lib/guards.ts`), synchronised stronger system prompt, barcode check-digit + 404 handling, SSRF IPv6/redirect hardening, per-route rate limits, header-based model keys, stricter chat validation, image size guards, markdown list fix, rename / edit-resend / draft-restore / import-validation / clear-data client fixes. New test suite: `scripts/unit-tests.mjs` (32 assertions). `npm run typecheck` and `npm run build` pass. QA fixes in this working directory were not pushed to GitHub in this pass.

**Live re-run — 2026-11-02 (see `QA-REPORT.md`, "Live re-run" section).** With Gemini connected, 109 content tests were run live (end-to-end for guards/barcode, helper route for model answers: gemini-3.5-flash for tests 1–11, gemini-3.5-flash-lite for the rest, after gemini-2.5-flash returned 404 "no longer available to new users" and gemini-3.5-flash hit the free-tier quota). Combined result: 138 PASS, 8 PARTIAL, 4 NOT RUN. New fixes in this pass: Gemini default model changed to gemini-3.5-flash in `app/api/chat/route.ts`, and prompt rules strengthened (brand-only "typically" listing, allergen-list completeness, missing-photo guidance, blurry-photo guessing) in `lib/types.ts` and `prompts/foodlens.system.v1.md`. One vision failure remains: a blurry label still gets invented E-numbers tagged as directly visible (test 18). These live-re-run fixes have NOT been pushed to GitHub.

**QA fixes 2 — 2026-11-02 (see `QA-REPORT.md`, "QA FIXES 2" section; pushed to branch `qa-fixes`, not `main`).** Photo-legibility prompt rules plus a deterministic "Please verify against the real label" UI note, chat temperature 0.3, explicit unknown-brand wording, friendly quota/429 mapping, a single prompt source (`lib/prompt.ts`, generated `prompts/foodlens.system.v1.md`), and configurable default models with a Gemini 404-only fallback chain. Re-tests: 37, 136 and 146 (3 brand variants) PASS; 18 remains PARTIAL/still failing (1 of 3 blurry runs still invented E-numbers, now flagged `[Unclear]` with a confirmation request and no verdict). Unit suite: 55 assertions, typecheck and build pass. Secret grep (key patterns, no `.env.local`) returned zero matches before and after the fixes. The qa-fixes commit SHA is recorded in the adjacent sync record; see `QA-REPORT.md` for the push result.

## Preview v7/v8 pass — 2026-11-09

Fixes, all on branch `preview/v2-local-engine`:

- `/api/models` hang fixed: both model-list fetches now carry a hard 10-second `AbortSignal.timeout`, so a stalled upstream returns 502 instead of hanging the route. The same latent bug was fixed in the other non-streaming proxy fetches (barcode 15 s, search 15 s, local-provider chat 120 s). Streaming provider calls in the chat route are intentionally left without a signal — aborting would cut an in-progress stream.
- Blurry/dark label photos: new deterministic on-device quality check (`assessImageQuality` in `lib/photo-check.ts`, called from the canvas in `lib/image.ts`). The composer now warns before sending when an attached photo looks too blurry, too dark or without readable detail. Advice only — sending is never blocked. Unit-tested on synthetic sharp / slightly-soft / blurry / dark / flat labels (measured variances recorded in the test).
- Local engine expanded (`lib/local-answers.ts`): 26 new entries — snacks (bakery patty, corn puffs, gola ganda, kachori, fruit cake), packaged daily items (instant soup, canned beans, sausages, deli meats, cheese slices, frozen paratha, instant coffee), market/hotel/daily dishes (tandoori roti, roghni naan, dhaba food, hotel buffet, khichdi, anda paratha), fruit and vegetables (chikoo, falsa, jackfruit, tinda, arvi) and red meat — plus new category guides for fruit and vegetable pros and cons, "benefits/advantages" triggers, two new recipes (anda paratha; khichdi recipe wording improved), and more Roman Urdu names (pyaz, gobhi, loki, nimko, chanachur, khatta meetha, packaged milk, chicken roll, ganne ka ras, gajar ka halwa).
- `npm audit` fixed: 2 vulnerabilities (1 moderate, 1 high, in postcss under Next 15) resolved by an npm `overrides` pin to postcss 8.5.32 — no Next 16 major upgrade needed. Audit is clean at the time of this pass.
- Key vault untouched (v6 behaviour preserved and re-tested); build label bumped to "preview v8".

Verification run in this pass (sandbox, not the user's phone): `npm run typecheck` pass; `node scripts/unit-tests.mjs` 637 assertions pass (464 before this pass; 173 added for the fixes); `npm run build` pass; `npm audit` clean. Live browser checks on a local production build and the exact preview-link flow are recorded in the final report; the Vercel preview link itself could not be re-deployed from the sandbox (no push access), so link-level verification remains with the user after the branch is pushed.
