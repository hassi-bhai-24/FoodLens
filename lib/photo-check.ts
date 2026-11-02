// Deterministic output check for photo analyses (Batch 2, B28).
// Pure function, no I/O, no model calls. Used client-side on an
// analysis produced only from user-confirmed text.
//
// Rule: for a photo reply, any E-number (E + 3-4 digits) or allergen
// word appearing in the analysis that is NOT in the user-confirmed
// text is replaced with "[Unverified — not in confirmed text]".
// Terms that ARE in the confirmed text are left untouched.
//
// Documented allergen list (EU 14 allergens + common tree-nut names,
// in plain words so the check is auditable):
export const ALLERGEN_TERMS: string[] = [
  "peanut",
  "peanuts",
  "almond",
  "almonds",
  "hazelnut",
  "hazelnuts",
  "walnut",
  "walnuts",
  "cashew",
  "cashews",
  "pistachio",
  "pistachios",
  "pecan",
  "pecans",
  "brazil nut",
  "brazil nuts",
  "macadamia",
  "tree nut",
  "tree nuts",
  "milk",
  "egg",
  "eggs",
  "wheat",
  "gluten",
  "soy",
  "soya",
  "sesame",
  "fish",
  "shellfish",
  "crustacean",
  "crustaceans",
  "shrimp",
  "prawn",
  "prawns",
  "crab",
  "lobster",
  "mustard",
  "celery",
  "lupin",
  "sulphite",
  "sulphites",
  "sulfite",
  "sulfites",
];

// Limits (documented, not hidden):
// - The check cannot catch a hallucinated item that happens to share a
//   word with the confirmed text (e.g. the model invents "peanut oil"
//   and the confirmed text contains "peanut"). The user confirming the
//   transcription is the primary control; this check is a backstop.
// - It cannot verify quantities, spelling of non-allergen ingredients,
//   or whether the transcription itself was misread — only whether a
//   flagged token also appears in the confirmed text.
// - Matching is word-boundary based and case-insensitive; it does not
//   understand synonyms (e.g. "arachis" is not matched to "peanut").
// - KNOWN LIMITATION (Step B, documented, behaviour unchanged): singular
//   and plural forms are treated as distinct whole words and are NOT
//   normalised. A plural in the confirmed text does not confirm the
//   singular in the analysis, and vice versa (confirmed "peanuts" does
//   not keep analysis "peanut"; confirmed "peanut" does not keep
//   analysis "peanuts"). This over-flags rather than under-flags: the
//   worst case is an extra "[Unverified — not in confirmed text]" marker
//   on a term the user did confirm in another grammatical form. The
//   user confirming the transcription is the primary control.

const UNVERIFIED = "[Unverified — not in confirmed text]";

export function extractENumbers(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(/\bE(\d{3,4})\b/gi)) {
    seen.add(`E${m[1]}`);
  }
  return [...seen];
}

function termRegex(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "gi");
}

export function containsTerm(haystack: string, term: string): boolean {
  return termRegex(term).test(haystack);
}

/** Flag (replace) E-numbers / allergen words in `analysis` that are absent from `confirmedText`. */
export function flagUnverifiedAnalysis(analysis: string, confirmedText: string): string {
  let out = analysis;
  const confirmedENumbers = new Set(extractENumbers(confirmedText));
  out = out.replace(/\bE\d{3,4}\b/gi, (match) => {
    const normalised = match.toUpperCase();
    return confirmedENumbers.has(normalised) ? match : UNVERIFIED;
  });
  // Longest terms first so "tree nuts" is checked before "nut" fragments
  // (there are no bare "nut" terms, but multi-word terms must win).
  const terms = [...ALLERGEN_TERMS].sort((a, b) => b.length - a.length);
  for (const term of terms) {
    if (containsTerm(confirmedText, term)) continue;
    out = out.replace(termRegex(term), UNVERIFIED);
  }
  return out;
}
