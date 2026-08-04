/**
 * @wc/speech — Speech Intelligence Layer (Phase 1)
 *
 * Conversation managers must consume StabilizedSpeechTurn.text only.
 */

export * from "./AdaptiveSpeechGate.js";
export * from "./NoiseAnalyzer.js";
export * from "./EchoDetector.js";
export * from "./TranscriptStabilizer.js";
export * from "./SpeechConfidence.js";
export * from "./DomainVocabulary.js";
export * from "./PhraseCorrector.js";
export * from "./NumberRecognizer.js";
export * from "./EmailRecognizer.js";
export * from "./CompanyRecognizer.js";
export * from "./EntityRecognizer.js";
export {
  COMMON_KERALA_NAMES,
  normalizeNameKey,
  namesEqual,
  exactKeralaName,
  findNearKeralaNames,
  isConfusableNameSwap,
  assessHeardName,
  keralaNamesPromptList,
  type NameAssessment,
} from "./NameRecognizer.js";
export { NameRecognizer } from "./NameRecognizerClass.js";
export {
  SpeechPipeline,
  defaultSpeechPipeline,
  type StabilizedSpeechTurn,
  type SpeechPipelineInput,
} from "./SpeechPipeline.js";

export {
  speechControlNote,
  MALAYALAM_SPEECH_RECOVERY,
  MALAYALAM_NUMBER_RECOVERY,
  INPUT_TRANSCRIPTION_CONFIG,
  type CriticalSpeechField,
} from "./core.js";
