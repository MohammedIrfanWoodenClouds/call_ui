/**
 * Single entry for completed STT turns.
 *
 * ConversationState must only consume StabilizedSpeechTurn.text — never raw
 * Whisper output. Raw text remains available for logs/telemetry.
 */

import {
  assessTranscript,
  speechControlNote,
  type AcousticTurnMetrics,
  type ConfidenceLevel,
  type NumberCollectionSnapshot,
  type TranscriptAssessment,
  type TranscriptStabilityResult,
} from "./core.js";
import {
  EchoDetector,
  type AssistantSpeechSnippet,
  type EchoDetectionResult,
} from "./EchoDetector.js";
import { EntityRecognizer, type EntityBundle } from "./EntityRecognizer.js";
import { assessHeardName } from "./NameRecognizer.js";
import { PhraseCorrector } from "./PhraseCorrector.js";
import { NoiseAnalyzer } from "./NoiseAnalyzer.js";

export interface StabilizedSpeechTurn {
  /** Only text ConversationState may record. */
  text: string;
  /** Original STT string for logs / telemetry. */
  rawText: string;
  confidence: ConfidenceLevel;
  discard: boolean;
  shouldRetry: boolean;
  entities: EntityBundle;
  acoustics?: AcousticTurnMetrics;
  controlNote?: string;
  assessment: TranscriptAssessment;
  echo?: EchoDetectionResult;
  noise: ReturnType<typeof NoiseAnalyzer.summarize>;
}

export interface SpeechPipelineInput {
  rawTranscript: string;
  event?: Record<string, unknown>;
  acoustics?: AcousticTurnMetrics;
  phase?: string;
  confirmationState?: string;
  numberCollection?: NumberCollectionSnapshot;
  stability?: TranscriptStabilityResult;
  falseTriggerCount?: number;
  vadTriggerReason?: string;
  /** Recent assistant utterances for echo detection (phone + browser). */
  recentAssistant?: AssistantSpeechSnippet[];
  currentAssistantText?: string;
  echoThreshold?: number;
}

export class SpeechPipeline {
  private readonly echo = new EchoDetector();
  private readonly entities = new EntityRecognizer();
  private readonly phrases = new PhraseCorrector();

  finalizeTurn(input: SpeechPipelineInput): StabilizedSpeechTurn {
    const rawText = (input.rawTranscript ?? "").trim().replace(/\s+/g, " ");
    const stability = input.stability;
    const stabilizedFinal = stability?.finalTranscript ?? rawText;

    const echo = this.echo.detect({
      transcript: stabilizedFinal,
      recentAssistant: input.recentAssistant ?? [],
      currentAssistantText: input.currentAssistantText,
      threshold: input.echoThreshold ?? 0.9,
    });

    if (echo.isEcho) {
      const emptyAssessment = assessTranscript({
        transcript: "",
        event: { ...(input.event ?? {}), confidence: 0 },
        acoustics: input.acoustics,
        phase: input.phase,
        confirmationState: input.confirmationState,
        numberCollection: input.numberCollection,
        partialTranscript: stability?.partialTranscript,
        partialStable: stability?.stable,
        partialStabilityScore: stability?.similarity,
        falseTriggerCount: (input.falseTriggerCount ?? 0) + 1,
        vadTriggerReason: input.vadTriggerReason,
      });
      return {
        text: "",
        rawText: stabilizedFinal || rawText,
        confidence: "Low",
        discard: true,
        shouldRetry: true,
        entities: this.entities.recognize("", { phase: input.phase }),
        acoustics: input.acoustics,
        controlNote: undefined,
        assessment: {
          ...emptyAssessment,
          rawTranscript: stabilizedFinal || rawText,
          reasons: [
            ...emptyAssessment.reasons,
            "echo_discarded_recent_assistant_similarity",
          ],
        },
        echo,
        noise: NoiseAnalyzer.summarize(input.acoustics),
      };
    }

    const nameCandidates =
      input.phase === "name"
        ? assessHeardName(stabilizedFinal)?.candidates
        : undefined;

    const assessment = assessTranscript({
      transcript: stabilizedFinal,
      event: input.event,
      acoustics: input.acoustics,
      phase: input.phase,
      confirmationState: input.confirmationState,
      numberCollection: input.numberCollection,
      nameCandidates,
      partialTranscript: stability?.partialTranscript,
      partialStable: stability?.stable,
      partialStabilityScore: stability?.similarity,
      falseTriggerCount: input.falseTriggerCount,
      vadTriggerReason: input.vadTriggerReason,
    });

    // Ensure ConversationState never sees the pre-assessment raw string when
    // phrase/domain/digit correction produced a different transcript.
    const protectCritical =
      input.phase === "name" ||
      input.phase === "mobile" ||
      input.phase === "company" ||
      /@|\b(?:gmail|email|e-mail|https?:\/\/|www\.)\b/i.test(stabilizedFinal);
    const phrase = this.phrases.correct(stabilizedFinal, {
      protectCriticalSpelling: protectCritical,
      preferDigits: input.numberCollection?.stage === "collecting",
    });

    const text = assessment.transcript || phrase.text;
    const discard =
      assessment.shouldRetry || !text.trim() || text.trim().length === 0;

    const entities = this.entities.recognize(text, {
      phase: input.phase,
      nameCandidates: assessment.correctionCandidates,
    });

    return {
      text: discard ? "" : text,
      rawText: assessment.rawTranscript || stabilizedFinal || rawText,
      confidence: assessment.transcriptConfidence,
      discard,
      shouldRetry: assessment.shouldRetry,
      entities,
      acoustics: input.acoustics,
      controlNote: speechControlNote(assessment),
      assessment,
      echo,
      noise: NoiseAnalyzer.summarize(input.acoustics),
    };
  }
}

/** Shared singleton for channels that do not need per-call pipeline state. */
export const defaultSpeechPipeline = new SpeechPipeline();
