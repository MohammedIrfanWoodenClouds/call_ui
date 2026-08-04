/**
 * Provider + acoustic transcript confidence scoring.
 */

export {
  providerTranscriptConfidence,
  assessTranscript,
  type ConfidenceLevel,
  type TranscriptAssessment,
  type TranscriptAssessmentInput,
} from "./core.js";

import type { ConfidenceLevel } from "./core.js";

export class SpeechConfidence {
  static levelForScore(score: number): ConfidenceLevel {
    if (score >= 0.78) return "High";
    if (score >= 0.52) return "Medium";
    return "Low";
  }
}
