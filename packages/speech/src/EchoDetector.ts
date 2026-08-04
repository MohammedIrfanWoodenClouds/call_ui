/**
 * Loudspeaker / sidetone echo detection against recent assistant speech.
 */

import {
  transcriptEchoSimilarity,
  transcriptSimilarity,
} from "./core.js";

export { transcriptEchoSimilarity, transcriptSimilarity };

export interface AssistantSpeechSnippet {
  text: string;
  recordedAt: number;
}

export interface EchoDetectionInput {
  transcript: string;
  recentAssistant: AssistantSpeechSnippet[];
  /** Optional in-progress assistant utterance. */
  currentAssistantText?: string;
  windowMs?: number;
  threshold?: number;
  now?: number;
}

export interface EchoDetectionResult {
  isEcho: boolean;
  similarity: number;
  matchedAssistantText: string;
}

export class EchoDetector {
  detect(input: EchoDetectionInput): EchoDetectionResult {
    const now = input.now ?? Date.now();
    const windowMs = input.windowMs ?? 10_000;
    const threshold = input.threshold ?? 0.9;

    const candidates = input.recentAssistant.filter(
      (entry) => now - entry.recordedAt <= windowMs
    );
    const current = input.currentAssistantText?.trim();
    if (current) {
      candidates.push({ text: current, recordedAt: now });
    }

    let similarity = 0;
    let matchedAssistantText = "";
    for (const candidate of candidates) {
      const score = transcriptEchoSimilarity(input.transcript, candidate.text);
      if (score > similarity) {
        similarity = score;
        matchedAssistantText = candidate.text;
      }
    }

    return {
      isEcho: similarity > threshold,
      similarity,
      matchedAssistantText,
    };
  }
}
