/**
 * Emotion tags for voice replies (mirrors call_api/src/emotionTags.ts).
 * Detect from generated transcript, strip for display, optional Swaram metadata.
 *
 * Speakable body runs through prepareForSwaramTts (Spoken → Pronunciation).
 */

import { prepareForSwaramTts } from "./prepareForSwaramTts";

export const EMOTIONS = [
  "Happy",
  "Friendly",
  "Empathy",
  "Thinking",
  "Excited",
  "Calm",
  "Apology",
  "Confirmation",
  "Greeting",
  "Closing",
] as const;

export type Emotion = (typeof EMOTIONS)[number];

const EMOTION_TAG_RE = new RegExp(
  `^\\s*\\[(${EMOTIONS.join("|")})\\]\\s*`,
  "i"
);

const PARTIAL_EMOTION_TAG_RE = /^\s*\[[A-Za-z]*$/;

/** Swaram realtime has no documented emotion session field today. */
export const SWARAM_SUPPORTS_EMOTION_METADATA = false;

const EMOTION_SET = new Set<string>(EMOTIONS.map((e) => e.toLowerCase()));

export function isEmotion(value: string): value is Emotion {
  return EMOTION_SET.has(value.toLowerCase());
}

export function normalizeEmotion(value: string): Emotion | null {
  const hit = EMOTIONS.find((e) => e.toLowerCase() === value.toLowerCase());
  return hit ?? null;
}

export function formatEmotionTag(emotion: Emotion): string {
  return `[${emotion}]`;
}

export function parseEmotionTag(text: string): {
  emotion: Emotion | null;
  body: string;
} {
  const m = text.match(EMOTION_TAG_RE);
  if (!m) return { emotion: null, body: text };
  return {
    emotion: normalizeEmotion(m[1]!),
    body: text.slice(m[0].length),
  };
}

export function stripEmotionTag(text: string): string {
  return text.replace(EMOTION_TAG_RE, "");
}

export function stripEmotionTagForDisplay(text: string): string {
  const body = stripEmotionTag(text);
  if (PARTIAL_EMOTION_TAG_RE.test(body)) return "";
  return body;
}

export function applyEmotionTag(text: string, emotion: Emotion): string {
  const trimmed = text.trim();
  if (!trimmed) return `${formatEmotionTag(emotion)} `;
  const { emotion: existing, body } = parseEmotionTag(trimmed);
  if (existing === emotion) return `${formatEmotionTag(emotion)} ${body}`.trimEnd();
  if (existing) return `${formatEmotionTag(emotion)} ${body}`.trimEnd();
  return `${formatEmotionTag(emotion)} ${trimmed}`;
}

type Cue = { emotion: Emotion; pattern: RegExp; weight: number };

const CUES: readonly Cue[] = [
  {
    emotion: "Greeting",
    pattern:
      /(?:സുപ്രഭാതം|നമസ്കാരം|ഹലോ|സ്വാഗതം|\bhello\b|\bhi\b|\bwelcome\b)/i,
    weight: 10,
  },
  {
    emotion: "Closing",
    pattern:
      /(?:ശുഭദിനം|നല്ല\s*ദിവസം|ബൈ|വിട|ഉടൻ\s*വിളിക്ക|ടീമിൽ\s*നിന്ന്|\bbye\b|\bgoodbye\b|thank you for calling)/i,
    weight: 10,
  },
  {
    emotion: "Apology",
    pattern:
      /(?:ക്ഷമിക്കണം|ക്ഷമിക്കൂ|സോറി|തെറ്റി|\bsorry\b|\bapolog(?:y|ise|ize)\b)/i,
    weight: 9,
  },
  {
    emotion: "Confirmation",
    pattern:
      /(?:ശരിയാണോ|ഓക്കേ\s*ആണോ|ശരിയാണോ\?|കേട്ടത്|ഇത്\s*ശരി|\bcorrect\b|\bis that right\b|\bconfirm\b)/i,
    weight: 8,
  },
  {
    emotion: "Thinking",
    pattern:
      /(?:ഒരു\s*നിമിഷം|നോക്കട്ടെ|ഒരു\s*സെക്കൻഡ്|ഒന്ന്\s*നോക്ക|എഴുതട്ടെ|\bone\s*(?:sec|moment|minute)\b|\blet me (?:check|see)\b)/i,
    weight: 8,
  },
  {
    emotion: "Empathy",
    pattern:
      /(?:മനസ്സിലായി|വിഷമിക്കേണ്ട|മനസിലായി|ശരി\s*ശരി|\bi understand\b|\bi hear you\b)/i,
    weight: 7,
  },
  {
    emotion: "Excited",
    pattern:
      /(?:അടിപൊളി|സൂപ്പർ|കൊള്ളാം|വൗ|\bawesome\b|\bgreat news\b|\bexcited\b)/i,
    weight: 7,
  },
  {
    emotion: "Happy",
    pattern:
      /(?:സന്തോഷം|നന്നായി|നല്ലത്|\bhappy\b|\bglad\b|\bwonderful\b)/i,
    weight: 6,
  },
  {
    emotion: "Calm",
    pattern:
      /(?:പതുക്കെ|ശാന്തമായി|ഒന്നൊന്നായി|ഡിജിറ്റ്|\bslowly\b|\bone by one\b)/i,
    weight: 6,
  },
  {
    emotion: "Friendly",
    pattern: /(?:ശരി|ഓക്കേ|താങ്ക്സ്|നന്ദി|\bok(?:ay)?\b|\bthanks\b)/i,
    weight: 3,
  },
];

export function detectEmotionFromResponse(
  text: string,
  fallback: Emotion = "Friendly"
): Emotion {
  const { emotion: tagged, body } = parseEmotionTag(text);
  if (tagged) return tagged;

  const sample = body || text;
  if (!sample.trim()) return fallback;

  let best: Emotion = fallback;
  let bestWeight = 0;
  for (const cue of CUES) {
    if (cue.pattern.test(sample) && cue.weight > bestWeight) {
      best = cue.emotion;
      bestWeight = cue.weight;
    }
  }
  return best;
}

export function prepareEmotionForTts(
  responseText: string,
  fallback: Emotion = "Friendly"
): {
  emotion: Emotion;
  taggedText: string;
  speakableText: string;
  swaramMetadata: Record<string, unknown>;
} {
  const emotion = detectEmotionFromResponse(responseText, fallback);
  const raw = stripEmotionTag(responseText).trim();
  const speakableText = prepareForSwaramTts(raw || responseText.trim());
  const taggedText = applyEmotionTag(speakableText || raw, emotion);
  return {
    emotion,
    taggedText,
    speakableText: speakableText || stripEmotionTag(taggedText).trim(),
    swaramMetadata: swaramEmotionMetadata(emotion),
  };
}

export function swaramEmotionMetadata(emotion: Emotion): Record<string, unknown> {
  if (!SWARAM_SUPPORTS_EMOTION_METADATA) return {};
  return { emotion: emotion.toLowerCase() };
}

export function withSwaramEmotion<T extends Record<string, unknown>>(
  payload: T,
  emotion: Emotion | null | undefined
): T {
  if (!emotion || !SWARAM_SUPPORTS_EMOTION_METADATA) return payload;
  return { ...payload, ...swaramEmotionMetadata(emotion) };
}
