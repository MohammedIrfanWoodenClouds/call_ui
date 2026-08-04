/**
 * Pronunciation Formatter — second stage before Swaram TTS.
 *
 * Spoken Malayalam Formatter expands meaning; this stage shapes how Swaram
 * should pronounce the resulting text (spacing, Malayalam orthography cleanup,
 * leftover Latin letter-spacing).
 *
 * Pipeline:
 *   LLM → formatForSpeech() → formatPronunciation() → Swaram TTS
 */

export type PronunciationFormatterConfig = {
  /** Collapse awkward double spaces / stray marks (default true). */
  cleanupOrthography?: boolean;
  /** Letter-space leftover Latin acronyms of 2–6 caps (default true). */
  letterSpaceLatinAcronyms?: boolean;
  /** Normalize Malayalam chillu / ZWJ variants lightly (default true). */
  normalizeMalayalamJoins?: boolean;
};

export const DEFAULT_PRONUNCIATION_CONFIG: Required<PronunciationFormatterConfig> =
  {
    cleanupOrthography: true,
    letterSpaceLatinAcronyms: true,
    normalizeMalayalamJoins: true,
  };

export function resolvePronunciationConfig(
  config: PronunciationFormatterConfig = {}
): Required<PronunciationFormatterConfig> {
  return { ...DEFAULT_PRONUNCIATION_CONFIG, ...config };
}

/** Malayalam letter names for leftover single Latin capitals. */
const LATIN_LETTER_ML: Record<string, string> = {
  A: "എ",
  B: "ബി",
  C: "സി",
  D: "ഡി",
  E: "ഇ",
  F: "എഫ്",
  G: "ജി",
  H: "എച്ച്",
  I: "ഐ",
  J: "ജെ",
  K: "കെ",
  L: "എൽ",
  M: "എം",
  N: "എൻ",
  O: "ഒ",
  P: "പി",
  Q: "ക്യൂ",
  R: "ആർ",
  S: "എസ്",
  T: "ടി",
  U: "യു",
  V: "വി",
  W: "ഡബ്ല്യൂ",
  X: "എക്സ്",
  Y: "വൈ",
  Z: "സെഡ്",
};

function normalizeSpaces(s: string): string {
  return s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Letter-space a leftover Latin acronym: "ERP" → "ഇ ആർ പി" via letter map,
 * or fall back to spaced Latin if unmapped (should be rare after spoken stage).
 */
export function letterSpaceAcronym(acronym: string): string {
  return acronym
    .toUpperCase()
    .split("")
    .map((ch) => LATIN_LETTER_ML[ch] ?? ch)
    .join(" ");
}

/**
 * Format text for clear Swaram pronunciation after spoken formatting.
 */
export function formatPronunciation(
  text: string,
  config: PronunciationFormatterConfig = {}
): string {
  const cfg = resolvePronunciationConfig(config);
  let t = (text ?? "").trim();
  if (!t) return "";

  if (cfg.normalizeMalayalamJoins) {
    // Prefer visible virama+ZWJ forms already in corpus; strip orphan ZWSP
    t = t.replace(/\u200B/g, "");
    // Soft hyphen should never reach TTS
    t = t.replace(/\u00AD/g, "");
  }

  if (cfg.letterSpaceLatinAcronyms) {
    // 2–6 capital Latin letters not already handled (safety net)
    t = t.replace(/\b[A-Z]{2,6}\b/g, (m) => letterSpaceAcronym(m));
  }

  if (cfg.cleanupOrthography) {
    // Ensure ellipsis is exactly three dots (TTS pause cue)
    t = t.replace(/\.{4,}/g, "...");
    t = t.replace(/…/g, "...");
    // No trailing junk punctuation clusters
    t = t.replace(/[,.]{2,}(?!\.)/g, (m) => (m.includes("..") ? "..." : ","));
    // Space before ellipsis if glued to Malayalam/Latin word oddly: "ഹലോ..." ok
    t = t.replace(/\s+\.\.\./g, "...");
    t = normalizeSpaces(t);
  }

  return t;
}
