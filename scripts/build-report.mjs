// Generate the generated sections of QA-REPORT.md from data files.
// Run: node scripts/build-report.mjs [report-path]
// Data: tests/questions.json (original questions + short labels),
// QA-RESULTS.json (one record per test), tests/bugs.json (B1-B31).
// The report keeps generated-section markers; prose outside the markers
// is preserved byte-for-byte. Running the script twice is idempotent:
// it replaces only the text between each pair of markers.
// No API keys, no network, no live calls.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportPath = process.argv[2] ? resolve(process.argv[2]) : join(root, "QA-REPORT.md");

function loadJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}
const questions = loadJson("tests/questions.json");
const results = loadJson("QA-RESULTS.json");
const bugs = loadJson("tests/bugs.json");

function assertCell(value, what) {
  if (typeof value !== "string" || value.includes("|") || value.includes("\n") || value.trim() === "") {
    throw new Error(`build-report: ${what} must be a non-empty single-line string without "|": ${JSON.stringify(value)}`);
  }
  return value;
}
const byId = new Map(questions.map((q) => [q.id, q]));
const resultById = new Map(results.map((r) => [r.id, r]));
const ids = [...Array(150)].map((_, i) => i + 1);
for (const id of ids) {
  if (!byId.has(id) || !resultById.has(id)) throw new Error(`build-report: missing data for test ${id}`);
  if (!["PASS", "PARTIAL", "NOT RUN"].includes(resultById.get(id).verdict)) {
    throw new Error(`build-report: invalid verdict for test ${id}`);
  }
}
const counts = { PASS: 0, PARTIAL: 0, "NOT RUN": 0 };
for (const r of results) counts[r.verdict]++;
const partialIds = results.filter((r) => r.verdict === "PARTIAL").map((r) => r.id);
const notRunIds = results.filter((r) => r.verdict === "NOT RUN").map((r) => r.id);

const totals = [
  "## Totals (corrected)",
  "",
  `**${counts.PASS} PASS / ${counts.PARTIAL} PARTIAL / ${counts["NOT RUN"]} NOT RUN** out of 150 tests.`,
  "",
  `- ${counts.PARTIAL} PARTIAL: ${partialIds.join(", ")}.`,
  `- ${counts["NOT RUN"]} NOT RUN: ${notRunIds.join(", ")}.`,
  // Historical template prose: the 136/146 move is a recorded fact about
  // the QA FIXES 2 re-test, not something derivable from the counts.
  "- Tests 136 and 146 moved from PARTIAL to PASS in the QA FIXES 2 re-test (2026-11-02); test 18 remained failing after that re-test and is still failing. The earlier totals in QA-HISTORY.md (138 PASS / 8 PARTIAL / 4 NOT RUN from the live re-run) are superseded by the corrected totals above.",
].join("\n");

const resultLines = [
  "## Results — all 150 tests",
  "",
  "| No. | Question (short) | Verdict | Last run | Model | Temp. | Prompt version/hash | Runs |",
  "|---:|---|---|---|---|---|---|---|",
  ...ids.map((id) => {
    const q = byId.get(id);
    const r = resultById.get(id);
    return `| ${id} | ${assertCell(q.label, `label ${id}`)} | ${r.verdict} | ${assertCell(r.lastRun, `lastRun ${id}`)} | ${assertCell(r.model, `model ${id}`)} | ${assertCell(r.temperature, `temperature ${id}`)} | ${assertCell(r.promptNote, `promptNote ${id}`)} | ${assertCell(r.runs, `runs ${id}`)} |`;
  }),
].join("\n");

const bugIds = bugs.map((b) => b.id);
if (bugIds.length !== 31) throw new Error(`build-report: expected 31 bugs, got ${bugIds.length}`);
const bugLines = [
  "| Bug | Severity | Fix | Status |",
  "|---|---|---|---|",
  ...bugs.map((b) => {
    assertCell(b.severity, `bug ${b.id} severity`);
    assertCell(b.status, `bug ${b.id} status`);
    return `| ${b.id} | ${b.severity} | ${assertCell(b.definition, `bug ${b.id} definition`)} Fix: ${assertCell(b.fix, `bug ${b.id} fix`)} | ${b.status} |`;
  }),
].join("\n");

function replaceGenerated(text, startMarker, endMarker, generated) {
  const startIdx = text.indexOf(startMarker);
  const endIdx = text.indexOf(endMarker, startIdx + startMarker.length);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error(`build-report: markers not found: ${startMarker} / ${endMarker}`);
  }
  const afterStart = startIdx + startMarker.length;
  return text.slice(0, afterStart) + "\n" + generated + "\n" + text.slice(endIdx);
}

let text = readFileSync(reportPath, "utf8");
text = replaceGenerated(text, "<!-- GENERATED:TOTALS-START -->", "<!-- GENERATED:TOTALS-END -->", totals);
text = replaceGenerated(text, "<!-- GENERATED:RESULTS-START -->", "<!-- GENERATED:RESULTS-END -->", resultLines);
text = replaceGenerated(text, "<!-- GENERATED:BUGS-START -->", "<!-- GENERATED:BUGS-END -->", bugLines);
writeFileSync(reportPath, text);
console.log(`build-report: wrote ${reportPath} (${counts.PASS} PASS / ${counts.PARTIAL} PARTIAL / ${counts["NOT RUN"]} NOT RUN, ${ids.length} rows, ${bugs.length} bugs)`);
