// Check QA-REPORT.md against its data files and QA-HISTORY.md.
// Run: node scripts/check-report.mjs
// Exits non-zero with a clear message if ANY of:
//  (1) ids in tests/questions.json, QA-RESULTS.json or the report table
//      are not exactly 1-150 unique;
//  (2) any report label differs from tests/questions.json, or any report
//      result field differs from QA-RESULTS.json;
//  (3) the totals in QA-REPORT.md do not match the counted verdicts;
//  (4) any bug severity/definition/fix/status in the generated bug table
//      differs from tests/bugs.json, any B1-B30 entry in tests/bugs.json
//      differs in severity/definition/fix from QA-HISTORY.md's bug tables,
//      or B31 differs from the QA-HISTORY.md addendum;
//  (5) the generated sections are not exactly what build-report would
//      produce (hand-edit inside the markers);
//  (6) a QA-RESULTS prompt note invents a 64-hex prompt hash for the live
//      pass, which did not record one.
// No API keys, no network, no live calls.
import { execFileSync, } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
function fail(msg) { errors.push(msg); }
function norm(s) { return String(s).replace(/\s+/g, " ").trim(); }
function loadJson(rel) { return JSON.parse(readFileSync(join(root, rel), "utf8")); }

const questions = loadJson("tests/questions.json");
const results = loadJson("QA-RESULTS.json");
const bugs = loadJson("tests/bugs.json");
const report = readFileSync(join(root, "QA-REPORT.md"), "utf8");
const history = readFileSync(join(root, "QA-HISTORY.md"), "utf8");

function checkIds(records, what) {
  const ids = records.map((r) => r.id);
  if (ids.length !== 150 && what !== "bugs") fail(`${what}: expected 150 records, got ${ids.length}`);
  const sorted = [...ids].sort((a, b) => a - b);
  for (let i = 1; i <= 150; i++) if (sorted[i - 1] !== i) { fail(`${what}: ids are not exactly 1-150 unique (first mismatch at position ${i}: ${sorted[i - 1]})`); break; }
}
checkIds(questions, "tests/questions.json");
checkIds(results, "QA-RESULTS.json");
const qById = new Map(questions.map((q) => [q.id, q]));
const rById = new Map(results.map((r) => [r.id, r]));
for (const q of questions) {
  if (!q.question || !q.label) fail(`tests/questions.json id ${q.id}: empty question or label`);
}
for (const r of results) {
  if (!["PASS", "PARTIAL", "NOT RUN"].includes(r.verdict)) fail(`QA-RESULTS.json id ${r.id}: invalid verdict ${JSON.stringify(r.verdict)}`);
  for (const f of ["lastRun", "model", "temperature", "promptNote", "runs"]) {
    if (typeof r[f] !== "string" || r[f].trim() === "") fail(`QA-RESULTS.json id ${r.id}: empty ${f}`);
  }
  if (/[0-9a-f]{64}/.test(r.promptNote)) fail(`QA-RESULTS.json id ${r.id}: promptNote invents a 64-hex prompt hash for the live pass, which did not record one: ${r.promptNote}`);
}
if (!report.includes("f84b46145da0f5c0a9b5fb015a19663cfb761a8ce81748dd9ffc41a901a30cea")) {
  fail("QA-REPORT.md: final Phase 1 prompt hash f84b4614… is missing from the prompt-hash prose section");
}

// --- Report results table (between RESULTS markers) ---
function sectionBetween(text, start, end) {
  const a = text.indexOf(start);
  const b = text.indexOf(end, a + start.length);
  if (a === -1 || b === -1) { fail(`QA-REPORT.md: markers missing: ${start} / ${end}`); return ""; }
  return text.slice(a + start.length, b);
}
const resultsSection = sectionBetween(report, "<!-- GENERATED:RESULTS-START -->", "<!-- GENERATED:RESULTS-END -->");
const reportRows = new Map();
for (const line of resultsSection.split("\n")) {
  const m = line.match(/^\|\s*(\d+)\s*\|/);
  if (!m) continue;
  const parts = line.split("|").map((p) => p.trim());
  if (parts.length !== 10) { fail(`QA-REPORT.md results row ${m[1]}: expected 8 columns, got ${parts.length - 2}`); continue; }
  const id = Number(parts[1]);
  if (reportRows.has(id)) fail(`QA-REPORT.md results table: duplicate id ${id}`);
  reportRows.set(id, { label: parts[2], verdict: parts[3], lastRun: parts[4], model: parts[5], temperature: parts[6], promptNote: parts[7], runs: parts[8] });
}
if (reportRows.size !== 150) fail(`QA-REPORT.md results table: expected 150 rows, got ${reportRows.size}`);
for (let id = 1; id <= 150; id++) {
  const row = reportRows.get(id);
  if (!row) { fail(`QA-REPORT.md results table: missing id ${id}`); continue; }
  const q = qById.get(id);
  const r = rById.get(id);
  if (row.label !== q.label) fail(`QA-REPORT.md row ${id}: label differs from tests/questions.json — report ${JSON.stringify(row.label)} vs data ${JSON.stringify(q.label)}`);
  for (const [field, key] of [["verdict", "verdict"], ["lastRun", "lastRun"], ["model", "model"], ["temperature", "temperature"], ["promptNote", "promptNote"], ["runs", "runs"]]) {
    if (row[field] !== r[key]) fail(`QA-REPORT.md row ${id}: ${field} differs from QA-RESULTS.json — report ${JSON.stringify(row[field])} vs data ${JSON.stringify(r[key])}`);
  }
}

// --- Totals ---
const counts = { PASS: 0, PARTIAL: 0, "NOT RUN": 0 };
for (const r of results) counts[r.verdict]++;
const totalsSection = sectionBetween(report, "<!-- GENERATED:TOTALS-START -->", "<!-- GENERATED:TOTALS-END -->");
const totalsMatch = totalsSection.match(/\*\*(\d+) PASS \/ (\d+) PARTIAL \/ (\d+) NOT RUN\*\*/);
if (!totalsMatch) fail("QA-REPORT.md totals: bold totals line not found in generated totals section");
else {
  const [, p, pa, nr] = totalsMatch.map(Number);
  if (p !== counts.PASS || pa !== counts.PARTIAL || nr !== counts["NOT RUN"]) {
    fail(`QA-REPORT.md totals: totals line ${p}/${pa}/${nr} does not match counted verdicts ${counts.PASS}/${counts.PARTIAL}/${counts["NOT RUN"]}`);
  }
}
function idListLine(section, kind, expected) {
  const m = section.match(new RegExp(`^- \\d+ ${kind}: ([0-9, ]+)\\.`, "m"));
  if (!m) { fail(`QA-REPORT.md totals: ${kind} id list line not found`); return; }
  const listed = m[1].split(",").map((s) => Number(s.trim()));
  if (JSON.stringify(listed) !== JSON.stringify(expected)) fail(`QA-REPORT.md totals: ${kind} list ${JSON.stringify(listed)} does not match rows ${JSON.stringify(expected)}`);
}
idListLine(totalsSection, "PARTIAL", results.filter((r) => r.verdict === "PARTIAL").map((r) => r.id));
idListLine(totalsSection, "NOT RUN", results.filter((r) => r.verdict === "NOT RUN").map((r) => r.id));

// --- Bugs: generated table vs tests/bugs.json ---
if (bugs.length !== 31) fail(`tests/bugs.json: expected 31 bugs, got ${bugs.length}`);
const bugById = new Map(bugs.map((b) => [b.id, b]));
for (let i = 1; i <= 31; i++) {
  if (!bugById.has(`B${i}`)) fail(`tests/bugs.json: missing B${i}`);
}
const bugsSection = sectionBetween(report, "<!-- GENERATED:BUGS-START -->", "<!-- GENERATED:BUGS-END -->");
const reportBugs = new Map();
for (const line of bugsSection.split("\n")) {
  const m = line.match(/^\|\s*(B\d+)\s*\|/);
  if (!m) continue;
  const parts = line.split("|").map((p) => p.trim());
  if (parts.length !== 6) { fail(`QA-REPORT.md bug row ${m[1]}: expected 4 columns, got ${parts.length - 2}`); continue; }
  reportBugs.set(parts[1], { severity: parts[2], fixCell: parts[3], status: parts[4] });
}
if (reportBugs.size !== 31) fail(`QA-REPORT.md bug table: expected 31 rows, got ${reportBugs.size}`);
for (const b of bugs) {
  const row = reportBugs.get(b.id);
  if (!row) { fail(`QA-REPORT.md bug table: missing ${b.id}`); continue; }
  if (row.severity !== b.severity) fail(`QA-REPORT.md bug ${b.id}: severity ${JSON.stringify(row.severity)} differs from tests/bugs.json ${JSON.stringify(b.severity)}`);
  if (row.fixCell !== `${b.definition} Fix: ${b.fix}`) fail(`QA-REPORT.md bug ${b.id}: definition/fix cell differs from tests/bugs.json`);
  if (row.status !== b.status) fail(`QA-REPORT.md bug ${b.id}: status differs from tests/bugs.json`);
}

// --- Bugs vs QA-HISTORY.md (B1-B30) and addendum (B31) ---
const historyBugs = new Map();
for (const line of history.split("\n")) {
  const m = line.match(/^\|\s*(B\d+)\s*\|/);
  if (!m) continue;
  const parts = line.split("|").map((p) => p.trim());
  if (parts.length !== 9) continue;
  historyBugs.set(parts[1], { definition: parts[2], severity: parts[3], fix: parts[6] });
}
if (historyBugs.size !== 30) fail(`QA-HISTORY.md: expected 30 bug rows (B1-B30), got ${historyBugs.size}`);
for (let i = 1; i <= 30; i++) {
  const id = `B${i}`;
  const h = historyBugs.get(id);
  const b = bugById.get(id);
  if (!h) { fail(`QA-HISTORY.md: missing ${id}`); continue; }
  if (!b) continue;
  if (b.severity !== h.severity) fail(`tests/bugs.json ${id}: severity ${JSON.stringify(b.severity)} differs from QA-HISTORY.md ${JSON.stringify(h.severity)}`);
  if (norm(b.definition) !== norm(h.definition)) fail(`tests/bugs.json ${id}: definition differs from QA-HISTORY.md`);
  if (norm(b.fix) !== norm(h.fix)) fail(`tests/bugs.json ${id}: fix differs from QA-HISTORY.md`);
}
const addendumIdx = history.indexOf("## ADDENDUM");
if (addendumIdx === -1) fail("QA-HISTORY.md: B31 addendum section (## ADDENDUM) is missing at the end of the file");
else {
  const addendum = history.slice(addendumIdx);
  const b31 = bugById.get("B31");
  const sev = addendum.match(/^B31 severity:\s*(.+)$/m);
  const def = addendum.match(/^B31 definition:\s*(.+)$/m);
  const fix = addendum.match(/^B31 fix:\s*(.+)$/m);
  if (!sev || norm(sev[1]) !== "Medium") fail("QA-HISTORY.md addendum: B31 severity line missing or not Medium");
  if (!def || norm(def[1]) !== norm(b31.definition)) fail("QA-HISTORY.md addendum: B31 definition differs from tests/bugs.json");
  if (!fix || norm(fix[1]) !== norm(b31.fix)) fail("QA-HISTORY.md addendum: B31 fix differs from tests/bugs.json");
  if (b31.severity !== "Medium") fail("tests/bugs.json B31: severity must be Medium");
  if (!addendum.includes("original text above unchanged")) fail("QA-HISTORY.md addendum: must state the original text above is unchanged");
}

// --- Questions vs QA-HISTORY.md deterministic tables ---
const detStart = history.indexOf("## (2) Results per section");
const detEnd = history.indexOf("## (3) All bugs");
const detSection = history.slice(detStart, detEnd);
const historyQuestions = new Map();
for (const line of detSection.split("\n")) {
  const m = line.match(/^\|\s*(\d+)\s*\|/);
  if (!m) continue;
  const parts = line.split("|").map((p) => p.trim());
  if (parts.length !== 6) continue;
  historyQuestions.set(Number(parts[1]), parts[2]);
}
if (historyQuestions.size !== 150) fail(`QA-HISTORY.md deterministic tables: expected 150 questions, got ${historyQuestions.size}`);
for (const q of questions) {
  if (historyQuestions.get(q.id) !== q.question) {
    fail(`tests/questions.json id ${q.id}: question differs from QA-HISTORY.md — data ${JSON.stringify(q.question)} vs history ${JSON.stringify(historyQuestions.get(q.id))}`);
  }
}

// --- Regeneration: build-report on a temp copy must reproduce the report ---
try {
  const tmp = mkdtempSync(join(tmpdir(), "check-report-"));
  const tmpReport = join(tmp, "QA-REPORT.md");
  writeFileSync(tmpReport, report);
  execFileSync(process.execPath, [join(root, "scripts", "build-report.mjs"), tmpReport], { cwd: root, stdio: "pipe" });
  const regenerated = readFileSync(tmpReport, "utf8");
  if (regenerated !== report) fail("QA-REPORT.md: generated sections do not match what build-report produces — the report was hand-edited inside the generated markers, or build-report is out of date. Re-run node scripts/build-report.mjs.");
  rmSync(tmp, { recursive: true, force: true });
} catch (e) {
  fail(`check-report: regeneration check failed to run build-report: ${e.message}`);
}

if (errors.length > 0) {
  console.error("check-report: FAIL");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log("check-report: OK — 150 questions, 150 results, 31 bugs, totals and history all consistent; generated sections match build-report output");
