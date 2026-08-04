/**
 * Applies safe transcript corrections (domain phrases + spoken digits)
 * without mutating contact-field spellings when protectCritical is set.
 */

import { normalizeDomainVocabulary, normalizeSpokenDigits } from "./core.js";

export interface PhraseCorrectionResult {
  text: string;
  correctionsApplied: string[];
  normalizedDigits: string;
  digitsNormalizedFromWords: boolean;
}

export class PhraseCorrector {
  correct(
    rawTranscript: string,
    options: {
      protectCriticalSpelling?: boolean;
      preferDigits?: boolean;
    } = {}
  ): PhraseCorrectionResult {
    const raw = rawTranscript.trim().replace(/\s+/g, " ");
    const domain = options.protectCriticalSpelling
      ? { transcript: raw, correctionsApplied: [] as string[] }
      : normalizeDomainVocabulary(raw);
    const digits = normalizeSpokenDigits(domain.transcript);
    const correctionsApplied = [...domain.correctionsApplied];
    if (digits.normalizedWords) {
      correctionsApplied.push("spoken_digits_normalized");
    }
    const text =
      options.preferDigits && digits.digits
        ? digits.digits
        : domain.transcript;
    return {
      text,
      correctionsApplied: [...new Set(correctionsApplied)],
      normalizedDigits: digits.digits,
      digitsNormalizedFromWords: digits.normalizedWords,
    };
  }
}
