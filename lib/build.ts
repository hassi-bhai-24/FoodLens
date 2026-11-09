// Build label shown in Settings so a bug report can say exactly which
// build is running. Bump on every preview-branch fix.
// preview v7: /api/models hang fixed (fetch timeouts in all four proxy
// routes), on-device blurry/dark photo warning added, npm audit fixed
// (postcss override), local engine expanded (v7 batch).
// preview v8: docs updated (key vault, local engine, blur defence),
// final verification pass. This is the label the user should see.
export const BUILD_LABEL = "preview v8";
