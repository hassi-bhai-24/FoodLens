// Generate prompts/foodlens.system.v1.md from the single canonical
// prompt source, lib/prompt.ts. Run: npm run sync-prompt
// The generated file contains exactly the prompt text (plus a trailing
// newline); unit tests assert the two match after trimming, so prompt
// drift is caught. Never edit the generated file by hand.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "lib", "prompt.ts"), "utf8");
const match = source.match(/export const FOODLENS_SYSTEM_PROMPT = `([\s\S]*?)`;\r?\n/);
if (!match) {
  console.error("sync-prompt: could not extract FOODLENS_SYSTEM_PROMPT from lib/prompt.ts");
  process.exit(1);
}
const prompt = match[1];
writeFileSync(join(root, "prompts", "foodlens.system.v1.md"), prompt.endsWith("\n") ? prompt : `${prompt}\n`);
console.log("sync-prompt: prompts/foodlens.system.v1.md written from lib/prompt.ts");
