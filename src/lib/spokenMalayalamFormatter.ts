/**
 * Spoken Malayalam Formatter — preprocessing layer before Swaram TTS.
 *
 * Converts written / robotic Malayalam into naturally spoken Kerala
 * receptionist Malayalam. Never send raw abbreviations, punctuation names,
 * or long paragraphs to TTS.
 *
 * Pipeline:
 *   LLM Response → formatForSpeech() → pronunciationFormatter → Swaram TTS
 *
 * Used by Browser, Plivo, and future outbound call paths.
 */

export type SpokenFormatterConfig = {
  /** Max spoken words per sentence (default 10). */
  maxWordsPerSentence?: number;
  /** Expand Latin / compact abbreviations (default true). */
  expandAbbreviations?: boolean;
  /** Insert ... / , pauses (default true). */
  insertPauses?: boolean;
  /** Split sentences over maxWordsPerSentence (default true). */
  splitLongSentences?: boolean;
  /** Rewrite robotic greetings / intros (default true). */
  normalizeGreeting?: boolean;
  /** Convert ASCII digits to Malayalam digit words (default true). */
  normalizeNumbers?: boolean;
  /** Replace & / @ # and strip spoken punctuation (default true). */
  normalizeSymbols?: boolean;
};

export const DEFAULT_SPOKEN_FORMATTER_CONFIG: Required<SpokenFormatterConfig> = {
  maxWordsPerSentence: 10,
  expandAbbreviations: true,
  insertPauses: true,
  splitLongSentences: true,
  normalizeGreeting: true,
  normalizeNumbers: true,
  normalizeSymbols: true,
};

/** Merge partial config over defaults. */
export function resolveSpokenFormatterConfig(
  config: SpokenFormatterConfig = {}
): Required<SpokenFormatterConfig> {
  return { ...DEFAULT_SPOKEN_FORMATTER_CONFIG, ...config };
}

const ML_DIGIT_WORDS = [
  "പൂജ്യം",
  "ഒന്ന്",
  "രണ്ട്",
  "മൂന്ന്",
  "നാല്",
  "അഞ്ച്",
  "ആറ്",
  "ഏഴ്",
  "എട്ട്",
  "ഒമ്പത്",
] as const;

/** Longer keys first so WC.AI wins over AI, WhatsApp over App, etc. */
const ABBREVIATION_ENTRIES: readonly [RegExp, string][] = [
  [/\bWC\s*\.\s*AI\b/gi, "ഡബ്ല്യൂ സി എ ഐ"],
  [/\bWC\s+AI\b/gi, "ഡബ്ല്യൂ സി എ ഐ"],
  [/\bWCAI\b/gi, "ഡബ്ല്യൂ സി എ ഐ"],
  [/\bHRMS\b/gi, "എച്ച് ആർ എം എസ്"],
  [/\bWhatsApp\b/gi, "വാട്ട്സ്ആപ്പ്"],
  [/\bE-?\s*commerce\b/gi, "ഇ കൊമേഴ്‌സ്"],
  [/\bEcommerce\b/gi, "ഇ കൊമേഴ്‌സ്"],
  [/\bWebsite\b/gi, "വെബ്‌സൈറ്റ്"],
  [/\bMobile\b/gi, "മൊബൈൽ"],
  [/\bEmail\b/gi, "ഇമെയിൽ"],
  [/\bERP\b/gi, "ഇ ആർ പി"],
  [/\bCRM\b/gi, "സി ആർ എം"],
  [/\bPOS\b/gi, "പി ഒ എസ്"],
  [/\bAPI\b/gi, "എ പി ഐ"],
  [/\bGST\b/gi, "ജി എസ് ടി"],
  [/\bOTP\b/gi, "ഒ ടി പി"],
  [/\bURL\b/gi, "യു ആർ എൽ"],
  [/\bPIN\b/gi, "പി ഐ എൻ"],
  [/\bSMS\b/gi, "എസ് എം എസ്"],
  [/\bPDF\b/gi, "പി ഡി എഫ്"],
  [/\bAI\b/gi, "എ ഐ"],
];

/** Compact Malayalam / Manglish forms already in prompts → spaced spoken forms. */
const MALAYALAM_COMPACT: readonly [RegExp, string][] = [
  [/ഡബ്ല്യൂസി\s*ഡോട്ട്\s*ഏഐ/g, "ഡബ്ല്യൂ സി എ ഐ"],
  [/ഡബ്ല്യൂസി\s*ഏഐ/g, "ഡബ്ല്യൂ സി എ ഐ"],
  [/ഡബ്ല്യൂ\s*സി\s*ഡോട്ട്\s*എ\s*ഐ/g, "ഡബ്ല്യൂ സി എ ഐ"],
  [/ഇ-?\s*കൊമേഴ്‌?സ്/g, "ഇ കൊമേഴ്‌സ്"],
  [/ഇആർപി/g, "ഇ ആർ പി"],
  [/സിആർഎം/g, "സി ആർ എം"],
  [/പിഒഎസ്/g, "പി ഒ എസ്"],
  [/എപിഐ/g, "എ പി ഐ"],
  [/എച്ച്ആർഎംഎസ്/g, "എച്ച് ആർ എം എസ്"],
  [/ജിഎസ്ടി/g, "ജി എസ് ടി"],
  [/ഒടിപി/g, "ഒ ടി പി"],
];

const GREETING_WORDS = [
  "ഹലോ",
  "നമസ്കാരം",
  "സുപ്രഭാതം",
  "സുഭാഷം",
  "വണക്കം",
] as const;

const ACK_WORDS = [
  "ശരി",
  "ഓക്കേ",
  "ഓകെ",
  "ആഹാ",
  "ഹും",
  "ഹുംഹും",
  "മനസ്സിലായി",
  "നന്ദി",
  "താങ്ക്സ്",
] as const;

const THINKING_WORDS = [
  "നോക്കട്ടെ",
  "ആലോചിക്കട്ടെ",
  "ഒരു സെക്കൻഡ്",
  "ഒരു നിമിഷം",
  "പറയട്ടെ",
] as const;

const CONFIRM_WORDS = [
  "ശരിയാണോ",
  "ശരിയാണോ?",
  "ഓക്കേ ആണോ",
  "എല്ലാം ശരിയാണോ",
] as const;

function normalizeSpaces(s: string): string {
  return s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Expand English / compact abbreviations into spoken Malayalam letter forms.
 * Never leave raw WC.AI / ERP / API etc. for Swaram.
 */
export function expandAbbreviations(text: string): string {
  let t = text;

  // Expand or drop parenthetical glosses first: (WC.AI), (ERP), (ഇആർപി)
  t = t.replace(/\(([^)]+)\)/g, (_m, inner: string) => {
    let expanded = inner;
    for (const [re, spoken] of MALAYALAM_COMPACT) {
      expanded = expanded.replace(re, spoken);
    }
    for (const [re, spoken] of ABBREVIATION_ENTRIES) {
      expanded = expanded.replace(re, spoken);
    }
    // Pure abbreviation gloss — drop; body text already carries meaning
    if (/^[A-Za-z0-9.\s\-]+$/.test(inner.trim())) return "";
    if (expanded !== inner && /^[\u0D00-\u0D7F\s]+$/.test(expanded.trim())) {
      return "";
    }
    return expanded.trim() ? `(${expanded.trim()})` : "";
  });

  for (const [re, spoken] of MALAYALAM_COMPACT) {
    t = t.replace(re, spoken);
  }
  for (const [re, spoken] of ABBREVIATION_ENTRIES) {
    t = t.replace(re, spoken);
  }
  // Parenthetical duplicate after expansion: "ഇ ആർ പി (ഇ ആർ പി)" → "ഇ ആർ പി"
  t = t.replace(
    /([\u0D00-\u0D7F](?:[\u0D00-\u0D7F\s]*[\u0D00-\u0D7F])?)\s*\(\s*\1\s*\)/g,
    "$1"
  );
  t = t.replace(/\(\s*\)/g, "");
  return normalizeSpaces(t);
}

/**
 * Replace speakable symbols; strip punctuation that would be read aloud.
 * Keeps `...` and `,` for natural pauses; keeps sentence `.` `?` `!` as
 * prosody cues (TTS does not say "dot" / "question mark").
 */
export function normalizeSymbols(text: string): string {
  let t = text
    .replace(/&/g, " കൂടാതെ ")
    .replace(/@/g, " അറ്റ് ")
    .replace(/#/g, " നമ്പർ ")
    .replace(/\//g, " അല്ലെങ്കിൽ ");

  // Protect pause markers (ellipsis + em dash kept as spoken pauses)
  t = t.replace(/\.{3,}/g, "\u0001ELLIPSIS\u0001");
  t = t.replace(/—|–/g, "\u0001DASH\u0001");

  // Strip brackets / quotes / colon-semicolon (never say their names)
  t = t.replace(/[()[\]{}]/g, " ");
  t = t.replace(/["""'']/g, " ");
  t = t.replace(/[;:|\\*_~`^=<>]/g, " ");
  // Soft hyphen — strip; ASCII hyphen between letters → space (not "hyphen")
  t = t.replace(/\u00AD/g, "");
  t = t.replace(/(?<=[\u0D00-\u0D7Fa-zA-Z])-(?=[\u0D00-\u0D7Fa-zA-Z])/g, " ");
  // Mid-token dots only (e.g. leftover A.B) — not sentence-final periods
  t = t.replace(/(?<=[A-Za-z0-9])\.(?=[A-Za-z0-9])/g, " ");

  t = t.replace(/\u0001ELLIPSIS\u0001/g, "...");
  t = t.replace(/\u0001DASH\u0001/g, " — ");

  // Collapse comma runs; keep single commas as breath pauses
  t = t.replace(/,{2,}/g, ",");
  t = t.replace(/\s*,\s*/g, ", ");

  return normalizeSpaces(t);
}

/** Convert runs of ASCII digits into Malayalam digit words. */
export function normalizeNumbers(text: string): string {
  return text.replace(/\d+/g, (digits) =>
    digits
      .split("")
      .map((ch) => ML_DIGIT_WORDS[Number(ch)] ?? ch)
      .join(" ")
  );
}

/**
 * Rewrite robotic greetings / self-intros into spoken receptionist Malayalam.
 */
export function normalizeGreeting(text: string): string {
  let t = text;

  // "ഹലോ, നമസ്കാരം" → separate paused greetings
  t = t.replace(
    /(ഹലോ|ഹലോോ)\s*[,.]?\s*(നമസ്കാരം|സുപ്രഭാതം)/g,
    "$1...\n\n$2..."
  );

  // Standalone greeting words at line start → trailing pause
  for (const g of GREETING_WORDS) {
    const re = new RegExp(`(^|[\\n])(${escapeRegExp(g)})\\s*[,.]?\\s*(?=[\\n]|$)`, "g");
    t = t.replace(re, `$1$2...`);
  }

  // Self-intro: "ഞാൻ Xയിൽ നിന്ന് വിളിക്കുന്ന NAMEയാണ്"
  // → "Xയിൽ നിന്നാണ് വിളിക്കുന്നത്. ഞാൻ NAME."
  t = t.replace(
    /ഞാൻ\s+(.+?)യിൽ\s+നിന്ന്\s+വിളിക്കുന്ന\s+(.+?)യാണ്\.?/g,
    (_m, place: string, name: string) =>
      `${place.trim()}യിൽ നിന്നാണ് വിളിക്കുന്നത്.\n\nഞാൻ ${name.trim()}.`
  );

  // Soften "ഞാൻ NAME ആണ്" after place already rewritten — leave as is

  // Service menu: "നിങ്ങൾക്ക് A, B, അല്ലെങ്കിൽ C — ഏതിനെക്കുറിച്ച്..."
  t = t.replace(
    /നിങ്ങൾക്ക്\s+(.+?)\s*[—\-]\s*ഏതിനെക്കുറിച്ചാണ്\s+അറിയേണ്ടത്\??/g,
    (_m, options: string) => {
      const parts = options
        .split(/\s*,\s*|\s+അല്ലെങ്കിൽ\s+/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length < 2) return _m;
      const listed = parts.slice(0, -1).map((p) => `${p}...`).join("\n\n");
      const last = parts[parts.length - 1]!;
      if (/ഇ\s*ആർ\s*പി/.test(last)) {
        return `${listed}\n\nഅതോ ഇ ആർ പി സോഫ്റ്റ്‌വെയറിനെക്കുറിച്ചാണോ അറിയേണ്ടത്?`;
      }
      return `${listed}\n\nഅതോ ${last}ിനെക്കുറിച്ചാണോ അറിയേണ്ടത്?`;
    }
  );

  // Also handle without leading നിങ്ങൾക്ക്
  t = t.replace(
    /(വെബ്‌സൈറ്റ്)\s*,\s*(ഇ\s*കൊമേഴ്‌സ്)\s*,?\s*അല്ലെങ്കിൽ\s*(ഇ\s*ആർ\s*പി)[^.?\n]*ഏതിനെക്കുറിച്ച[^\n?]*/g,
    "$1...\n\n$2...\n\nഅതോ ഇ ആർ പി സോഫ്റ്റ്‌വെയറിനെക്കുറിച്ചാണോ അറിയേണ്ടത്?"
  );

  return normalizeSpaces(t);
}

/**
 * Insert natural pauses after greetings, thinking, acknowledgements, confirmations.
 * Use `...` for holds; `,` for short breaths. Never emit long paragraphs.
 */
export function insertPauses(text: string): string {
  let t = text;

  // Ensure greeting / ack / thinking tokens that open a clause get ...
  const pauseLeaders = [...GREETING_WORDS, ...ACK_WORDS, ...THINKING_WORDS];
  for (const word of pauseLeaders) {
    const re = new RegExp(
      `(^|[\\n.])\\s*(${escapeRegExp(word)})(?!\\.{2})(?=\\s+[\\u0D00-\\u0D7Fa-zA-Z])`,
      "g"
    );
    t = t.replace(re, `$1${word === "ശരി" || word === "ഓക്കേ" || word === "ഓകെ" || word === "നന്ദി" ? `${word},` : `${word}...`}`);
  }

  // Confirmation endings → soft pause before wait
  for (const c of CONFIRM_WORDS) {
    const bare = c.replace(/\?$/, "");
    const re = new RegExp(`(${escapeRegExp(bare)})\\??(?!\\.)`, "g");
    t = t.replace(re, "$1...");
  }

  // Paragraph breaks: turn single newlines between clauses into blank lines
  // when both sides are substantial
  t = t.replace(/([^\n])\n([^\n])/g, "$1\n\n$2");

  // Soften remaining hard stops into sentence breaks (spaces already ok)
  t = t.replace(/\.{4,}/g, "...");

  return normalizeSpaces(t);
}

/** Count spoken words (space-separated tokens, ignoring bare punctuation). */
export function countSpokenWords(sentence: string): number {
  return sentence
    .split(/\s+/)
    .map((w) => w.replace(/^[.,…!?—\-]+|[.,…!?—\-]+$/g, ""))
    .filter((w) => w.length > 0 && w !== "...")
    .length;
}

/**
 * Split sentences longer than maxWords into shorter spoken units.
 */
export function splitLongSentences(
  text: string,
  maxWords = DEFAULT_SPOKEN_FORMATTER_CONFIG.maxWordsPerSentence
): string {
  const blocks = text.split(/\n+/);
  const out: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Already short
    if (countSpokenWords(trimmed) <= maxWords) {
      out.push(trimmed);
      continue;
    }

    // Prefer existing comma / ellipsis / conjunction breaks
    const chunks = splitAtNaturalBreaks(trimmed, maxWords);
    out.push(...chunks);
  }

  return out.join("\n\n");
}

function splitAtNaturalBreaks(sentence: string, maxWords: number): string[] {
  // First try splitting on pause markers
  const byPause = sentence
    .split(/(?<=\.\.\.|[,—])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const pieces: string[] = [];
  for (const part of byPause) {
    if (countSpokenWords(part) <= maxWords) {
      pieces.push(part);
      continue;
    }
    pieces.push(...packWords(part, maxWords));
  }
  return pieces;
}

function packWords(text: string, maxWords: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(" "));
  }
  return chunks;
}

/**
 * Full spoken-Malayalam preprocessing (Rules 1–8).
 * Does not include pronunciationFormatter — call that next.
 *
 * Order matters: expand + greeting rewrite before symbol stripping so
 * structural markers (—, parentheses glosses) can still be parsed.
 */
export function formatForSpeech(
  text: string,
  config: SpokenFormatterConfig = {}
): string {
  const cfg = resolveSpokenFormatterConfig(config);
  let t = (text ?? "").trim();
  if (!t) return "";

  if (cfg.expandAbbreviations) t = expandAbbreviations(t);
  if (cfg.normalizeGreeting) t = normalizeGreeting(t);
  if (cfg.normalizeSymbols) t = normalizeSymbols(t);
  if (cfg.normalizeNumbers) t = normalizeNumbers(t);
  if (cfg.insertPauses) t = insertPauses(t);
  if (cfg.splitLongSentences) {
    t = splitLongSentences(t, cfg.maxWordsPerSentence);
  }

  t = t.replace(/\(\s*\)/g, "");
  return normalizeSpaces(t);
}

/**
 * Prompt block so the realtime model *generates* speakable Malayalam
 * matching this formatter (Swaram fuses LLM+TTS).
 */
export function spokenMalayalamFormatterPromptSection(): string {
  return [
    "## Spoken Malayalam Formatter (REQUIRED — every spoken turn)",
    "The caller only hears speech. Never read text literally.",
    "Write exactly as a Kerala office receptionist would speak on a phone call.",
    "",
    "### Never pronounce punctuation",
    "Do not say: dot, comma, hyphen, slash, colon, semicolon, quotes, brackets.",
    "Do not speak (), [], {}, ., , unless as a natural pause (use ... or ,).",
    "",
    "### Expand abbreviations (never send raw Latin acronyms)",
    "WC.AI / WC AI → ഡബ്ല്യൂ സി എ ഐ",
    "ERP → ഇ ആർ പി · CRM → സി ആർ എം · POS → പി ഒ എസ് · API → എ പി ഐ · AI → എ ഐ",
    "HRMS → എച്ച് ആർ എം എസ് · GST → ജി എസ് ടി · OTP → ഒ ടി പി · URL → യു ആർ എൽ",
    "PIN → പി ഐ എൻ · SMS → എസ് എം എസ് · PDF → പി ഡി എഫ്",
    "WhatsApp → വാട്ട്സ്ആപ്പ് · E-commerce → ഇ കൊമേഴ്‌സ് · Website → വെബ്‌സൈറ്റ്",
    "Mobile → മൊബൈൽ · Email → ഇമെയിൽ",
    "Never say 'ഡോട്ട്' for WC.AI — always letter-spaced ഡബ്ല്യൂ സി എ ഐ.",
    "",
    "### Spoken greetings (not robotic)",
    "Bad: ഹലോ, നമസ്കാരം. ഞാൻ ഡബ്ല്യൂസി ഡോട്ട് ഏഐയിൽ (WC.AI) നിന്ന് വിളിക്കുന്ന അഞ്ജനയാണ്.",
    "Good:",
    "ഹലോ...",
    "നമസ്കാരം...",
    "ഡബ്ല്യൂ സി എ ഐയിൽ നിന്നാണ് വിളിക്കുന്നത്.",
    "ഞാൻ അഞ്ജന.",
    "",
    "### Short sentences + pauses",
    "Maximum ~10 spoken words per sentence. Split automatically in your head.",
    "Use ... after greetings, thinking, acknowledgement, confirmation.",
    "Use , for short breathing pauses. Never produce long paragraphs.",
    "",
    "### Symbols",
    "& → കൂടാതെ · / → അല്ലെങ്കിൽ · @ → അറ്റ് · # → നമ്പർ",
  ].join("\n");
}
