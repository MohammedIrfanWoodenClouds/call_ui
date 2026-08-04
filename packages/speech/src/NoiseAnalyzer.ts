/**
 * Acoustic noise / SNR classification for a completed speech turn.
 * Frame-level analysis lives inside AdaptiveSpeechGate; this module exposes
 * the turn-level noise API used by logging and SpeechPipeline.
 */

import type {
  AcousticTurnMetrics,
  BackgroundNoiseLevel,
  ConfidenceLevel,
} from "./core.js";

export type { BackgroundNoiseLevel, AcousticTurnMetrics };

export class NoiseAnalyzer {
  /** Map absolute noise floor (dBFS) to a coarse level label. */
  static levelFromDbfs(
    backgroundNoiseDbfs: number,
    averageSnrDb = 12
  ): BackgroundNoiseLevel {
    if (backgroundNoiseDbfs <= -43 && averageSnrDb >= 13) return "Low";
    if (backgroundNoiseDbfs <= -31 && averageSnrDb >= 7) return "Medium";
    return "High";
  }

  static summarize(acoustics?: AcousticTurnMetrics): {
    backgroundNoiseLevel: BackgroundNoiseLevel;
    backgroundNoiseDbfs: number;
    noiseRms: number;
    speechConfidence: ConfidenceLevel;
  } {
    if (!acoustics) {
      return {
        backgroundNoiseLevel: "High",
        backgroundNoiseDbfs: -20,
        noiseRms: 0,
        speechConfidence: "Low",
      };
    }
    return {
      backgroundNoiseLevel: acoustics.backgroundNoiseLevel,
      backgroundNoiseDbfs: acoustics.backgroundNoiseDbfs,
      noiseRms: acoustics.noiseRms,
      speechConfidence: acoustics.speechConfidence,
    };
  }
}
