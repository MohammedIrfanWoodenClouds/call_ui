/**
 * Shared pre-TTS pipeline for Browser, Plivo, and future outbound calls.
 *
 *   LLM Response
 *        ↓
 *   Spoken Malayalam Formatter  (formatForSpeech)
 *        ↓
 *   Pronunciation Formatter     (formatPronunciation)
 *        ↓
 *   Swaram TTS
 *
 * Emotion tagging (prepareEmotionForTts) runs around this for metadata.
 */

import {
  formatForSpeech,
  type SpokenFormatterConfig,
} from "./spokenMalayalamFormatter";
import {
  formatPronunciation,
  type PronunciationFormatterConfig,
} from "./pronunciationFormatter";

export type PrepareForSwaramTtsConfig = {
  spoken?: SpokenFormatterConfig;
  pronunciation?: PronunciationFormatterConfig;
  /** When false, skip both formatters (passthrough). Default true. */
  enabled?: boolean;
};

/**
 * Run the full speakable-text pipeline before Swaram TTS.
 */
export function prepareForSwaramTts(
  text: string,
  config: PrepareForSwaramTtsConfig = {}
): string {
  if (config.enabled === false) return (text ?? "").trim();
  const spoken = formatForSpeech(text, config.spoken);
  return formatPronunciation(spoken, config.pronunciation);
}
