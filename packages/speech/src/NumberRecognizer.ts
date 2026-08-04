export {
  normalizeSpokenDigits,
  asksForContactNumber,
  NumberCollectionMode,
  NUMBER_COLLECTION_MIN_DIGITS,
  NUMBER_COLLECTION_MAX_DIGITS,
  type NumberCollectionSnapshot,
  type NumberCollectionStage,
  type NumberCollectionTransition,
} from "./core.js";

import {
  normalizeSpokenDigits,
  NUMBER_COLLECTION_MAX_DIGITS,
  NUMBER_COLLECTION_MIN_DIGITS,
} from "./core.js";

export class NumberRecognizer {
  extractDigits(text: string): {
    digits: string;
    normalizedWords: boolean;
    plausiblePhone: boolean;
  } {
    const { digits, normalizedWords } = normalizeSpokenDigits(text);
    const plausiblePhone =
      digits.length >= NUMBER_COLLECTION_MIN_DIGITS &&
      digits.length <= NUMBER_COLLECTION_MAX_DIGITS;
    return { digits, normalizedWords, plausiblePhone };
  }
}
