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

// ---- Image quality check for label photos (preview v7, Test 18 gap) ----
//
// Blurry-label handling used to start only AFTER the model transcribed:
// the transcription instruction forbids guessing and flagUnverifiedAnalysis
// backstops the analysis, but the user got no warning at attachment time
// that the photo they just took is too blurry or too dark to read
// reliably. This assessor closes that gap. It is a pure, deterministic
// function on raw RGBA pixels (no DOM, no async, no model), so it runs
// on the already-drawn canvas in lib/image.ts and is unit-tested on
// synthetic sharp and blurred label images.
//
// Metrics (documented, not hidden):
// - brightness: mean of ITU-R BT.601 luminance, normalised 0..1.
// - contrast:   luminance standard deviation, normalised 0..1.
// - sharpness:  variance of the 4-neighbour Laplacian of the luminance,
//               on the 0..255 grey scale. In-focus text has a high
//               variance (edges everywhere); out-of-focus or motion-
//               blurred text collapses towards 0. This is the standard
//               blur heuristic; it cannot "read" anything — it only
//               measures whether fine detail exists.
//
// Thresholds, calibrated in scripts/unit-tests.mjs on synthetic label
// images (sharp, box-blurred, darkened, flat):
// - blurry when variance < 120 (sharp synthetic labels measure > 400;
//   even a light blur drops them by an order of magnitude).
// - dark when mean luminance < 0.20 (a dim phone photo of a label).
// - flat when contrast < 0.10 (no readable text detail, sharp or not).
// Trade-off, stated plainly: a genuinely sharp photo of a textureless
// surface (an empty wall) will be called blurry — for a label photo
// that is the honest answer anyway, and the UI warning is advice,
// never a block: the user can still send the photo.

export interface ImageQuality {
  /** Variance of Laplacian on the 0..255 scale (higher = more fine detail). */
  variance: number;
  /** Mean luminance 0..1. */
  brightness: number;
  /** Luminance standard deviation 0..1. */
  contrast: number;
  blurry: boolean;
  dark: boolean;
  flat: boolean;
}

export const BLUR_VARIANCE_THRESHOLD = 120;
export const DARK_MEAN_THRESHOLD = 0.2;
export const FLAT_CONTRAST_THRESHOLD = 0.1;

export function assessImageQuality(pixels: ArrayLike<number>, width: number, height: number): ImageQuality {
  const n = width * height;
  if (n <= 0 || pixels.length < n * 4) {
    return { variance: 0, brightness: 0, contrast: 0, blurry: true, dark: true, flat: true };
  }
  // Grey-scale luminance, 0..255, one value per pixel.
  const gray = new Float64Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const r = pixels[i * 4];
    const g = pixels[i * 4 + 1];
    const b = pixels[i * 4 + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    gray[i] = y;
    sum += y;
  }
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = gray[i] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / n);
  // Variance of the 4-neighbour Laplacian over interior pixels.
  let lapSum = 0;
  let lapSqSum = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      lapSum += lap;
      lapSqSum += lap * lap;
      count++;
    }
  }
  const variance = count > 0 ? lapSqSum / count - (lapSum / count) * (lapSum / count) : 0;
  const brightness = mean / 255;
  const contrast = std / 255;
  return {
    variance,
    brightness,
    contrast,
    blurry: variance < BLUR_VARIANCE_THRESHOLD,
    dark: brightness < DARK_MEAN_THRESHOLD,
    flat: contrast < FLAT_CONTRAST_THRESHOLD,
  };
}
