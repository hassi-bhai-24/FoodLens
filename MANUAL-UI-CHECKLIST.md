# Manual UI Checklist — what Playwright could NOT cover (Phase 1, Batch 7)

Playwright DID run in the sandbox (Chromium headless shell, 390px viewport): 22/22 checks passed — home/notice, Settings key link, guard reply without a key, T1 pass-through, B19 draft restore, B15 image-size guard, the stubbed two-step confirm flow with the photo check, "Answered by" model display, verify note, stubbed 429 vs 502 messages, B17 rename, B20 delete-all, B21 malformed import. See QA-PROGRESS.md Batch 7.

The items below need a real phone, a real provider key, or a live camera — they were NOT verified in Phase 1. Work through them in order, on a real phone (390px-wide viewport) with a Gemini key saved in Settings, unless a step says otherwise.

## 1. B18 — Edit & resend (needs a key)
1. Send "Is banana healthy?" and wait for the reply.
2. Tap "Edit & resend" under your message, change it to "Is mango healthy?", send.
3. Expected: the chat contains only the mango question and a fresh reply; the banana reply is gone (history truncated at the edited message).

## 2. B22 — Search caveat (needs a key; no Tavily/Brave key configured)
1. In Settings, turn Web search ON.
2. Ask a question needing current information, e.g. "Has there been a recent recall of this biscuit brand?" (name a real brand).
3. Expected: no crash; the answer must not claim a web search happened if none did, and must say when it cannot verify current information. Note exactly what it says.

## 3. B23 — Image byte cap at the route (needs a key)
1. In one chat, send several large photos (each under 10 MB) totalling over 20 MB in the same conversation, then send another photo question.
2. Expected: a clear error that photos are too large in total (under 20 MB total) — not a provider error and not a crash. (The single-photo >10 MB guard, B15, was verified in Playwright.)

## 4. Live two-step photo flow (needs a key; real label photos)
1. Photograph a real, clearly readable packet label. Send it with no question.
   Expected: a transcription only, each item tagged [Directly visible] or [Unclear], ending "Please verify against the real label." — no health verdict yet.
2. The "Ingredients I read" box appears prefilled. Tap Confirm without editing.
   Expected: an analysis of ONLY the confirmed text, ending "Please verify against the real label.", with "Answered by <model>" under the reply.
3. Photograph a blurry/dark label (test 18 conditions). Send it.
   Expected: unclear items tagged [Unclear], no invented E-numbers, a request for a clearer photo or typed ingredients. If any E-number appears that is not legible, record the exact reply — this is the still-failing B28 case.
4. Edit the transcription to a wrong E-number, then Confirm.
   Expected: the analysis must not state the wrong E-number as fact from the photo; it analyses the confirmed text you supplied. (The deterministic check cannot catch this by design — you are the check.)

## 5. Camera barcode scanning (real phone, camera permission)
1. Open Barcode, tap "Scan with camera", point at a real EAN-13 packet barcode.
2. Expected: the code is read and looked up (or a clear message if BarcodeDetector is unsupported in that browser — manual entry must still work).
3. Tap "Discuss in chat".
   Expected: the composer shows only "Is this healthy, and what should I watch for?" plus a "Discussing scanned product" chip; the product name/ingredients are NOT pasted into the message text. The answer must be based on the looked-up data, with the crowdsourced-data warning.

## 6. HEIC photo (iPhone, default camera format)
1. Take/attach a HEIC photo to a chat and send it.
2. Expected: a clear message that HEIC is not supported yet, asking for JPEG/PNG — not a silent failure or a crash.

## 7. Mobile sidebar overlay — B31 (Medium, fixed in Step A; verify on a real phone, no key needed)
1. On a 390px-wide phone, tap ☰ to open the sidebar, then tap Settings.
2. Check: the sidebar has a visible ✕ close button, tapping the backdrop closes it, and Esc closes it; the ☰ toggle stays visible above the sidebar while it is open and tapping it closes the sidebar (the sidebar starts below the header); and the Settings dialog scrolls fully so Save/Done and Close are always reachable.
3. In sandbox Playwright testing before the fix, the open sidebar covered the ☰ toggle and the lower part of the Settings dialog, and closing required selecting a chat (or a forced click). The Step A fix (visible ✕, backdrop, Esc, dialog above the sidebar with its own scroll, sidebar closed when Settings opens) was verified in the sandbox at 360/390/430px and in landscape — confirm the same behaviour on a real phone and report it. This is logged as B31 (Medium, fixed in Step A).

## 8. Quota message, live (Phase 2, only when quota is actually exhausted)
1. With a free-tier key that has hit its daily limit, send a food question.
2. Expected: a plain message that the free daily limit has been used / to try again later — NOT a generic "something went wrong" and NOT a retry loop. Record the exact message.

## 9. "Answered by" with a fallback model (Phase 2)
1. With the default model unavailable (404) so the fallback chain engages, send a question.
2. Expected: "Answered by <fallback model>" under the reply shows the model that actually answered, not the requested one.

## 10. Real-phone basics (no key needed for 10a–10b)
1. Rotate the phone / resize: the permanent notice "General food information, not medical advice. Always check allergens on the real label." stays visible; the composer and confirm box stay usable at 390px.
2. Read-aloud, copy, thumbs feedback, stop-generation: tap each once on any reply and confirm each works without an error.

## 11. npm audit (run where registry access works — Step B, 2026-11-02)

`npm audit` did NOT pass in the sandbox. It was tried and blocked by registry policy, twice in one command, both times with the same error:

```
npm warn audit 403 Forbidden - POST https://registry.npmjs.org/-/npm/v1/security/audits/quick - policy_denied
{
  detail: 'POST /-/npm/v1/security/audits/quick not permitted by policy',
  error: 'policy_denied',
  policy: 'zz_managed_internal_spaces_package_registries',
  rule: 'POST /-/npm/v1/security/audits/quick'
}
npm error audit endpoint returned an error
```

No audit output exists, no `npm audit fix` was run, and no dependency was changed. Do not treat the audit as passed. Run it on a machine with registry access, using exactly these commands (copy them verbatim):

```bash
cd ~/workspace/foodlens-github
npm audit
```

Read the output: it lists each vulnerability with its severity (low, moderate, high, critical), the affected package, and whether a fix exists. Record the counts by severity and the package names back in QA-PROGRESS.md. Then preview fixes without applying them:

```bash
npm audit fix --dry-run
```

Only if the dry run shows safe, non-breaking fixes (and no major-version changes you have not reviewed), apply them with:

```bash
npm audit fix
```

After applying any fix, re-run the checks and record the results:

```bash
node scripts/unit-tests.mjs
npm run typecheck
npm run build
```

If `npm audit fix` wants a major-version upgrade, or if any check fails afterwards, stop, undo the change, and record what happened instead of pushing the fix. If `npm audit` itself is blocked again, record the exact error message (as above) and do not retry it in a loop.
