/**
 * Speech-only quality layer.
 *
 * This module deliberately has no CRM or enquiry persistence dependencies. It
 * gates noisy PCM before STT, scores acoustic/transcript confidence, and builds
 * short control notes for the realtime speech model.
 */

export type ConfidenceLevel = "High" | "Medium" | "Low";
export type BackgroundNoiseLevel = "Low" | "Medium" | "High";
export type CriticalSpeechField =
  | "name"
  | "phone"
  | "email"
  | "company"
  | "place"
  | "website";
export type SpeechGateMode = "normal" | "digits";
export type SpeechSensitivity = "normal" | "assistant_speaking";
export type NumberCollectionStage =
  | "inactive"
  | "collecting"
  | "awaiting_confirmation";

export interface NumberCollectionSnapshot {
  active: boolean;
  stage: NumberCollectionStage;
  candidate: string;
}

export type NumberCollectionTransition =
  | "entered"
  | "candidate_recognized"
  | "confirmed"
  | "rejected";

export const NUMBER_COLLECTION_MIN_DIGITS = 7;
export const NUMBER_COLLECTION_MAX_DIGITS = 15;

export interface PcmFrameAnalysis {
  durationMs: number;
  rms: number;
  peak: number;
  zcr: number;
  crestFactor: number;
  clippingRatio: number;
  snrDb: number;
  speechScore: number;
  voiceLike: boolean;
  overlapRisk: boolean;
}

export interface AcousticTurnMetrics {
  speechConfidence: ConfidenceLevel;
  backgroundNoiseLevel: BackgroundNoiseLevel;
  backgroundNoiseDbfs: number;
  micRms: number;
  noiseRms: number;
  vadTriggerReason: string;
  speechDurationMs: number;
  continuousSpeechMs: number;
  averageSnrDb: number;
  speakerDominance: number;
  voiceFrameRatio: number;
}

export interface RejectedSound {
  durationMs: number;
  reason: "not_continuous_speech";
}

export interface SpeechGateResult<T> {
  forward: T[];
  started: boolean;
  triggerReason?: string;
  rejected?: RejectedSound;
}

export interface AdaptiveSpeechGateOptions {
  sampleRate: number;
  /** Sustained voice-like audio required before any PCM is forwarded. */
  minContinuousSpeechMs?: number;
  /** Audio retained so delaying recognition does not cut off the first word. */
  preRollMs?: number;
  /** Tiny unvoiced gaps allowed while proving continuous speech. */
  candidateGapMs?: number;
  /** A phone-number pause shorter than this remains one STT turn. */
  digitPauseMs?: number;
  initialNoiseFloor?: number;
  /** Browser mic floor; raised while assistant is speaking. */
  minimumRms?: number;
}

interface BufferedFrame<T> {
  payload: T;
  analysis: PcmFrameAnalysis;
}

interface RunningStats {
  elapsedMs: number;
  voiceMs: number;
  trailingSilenceMs: number;
  continuousSpeechMs: number;
  voiceFrames: number;
  totalFrames: number;
  overlapFrames: number;
  snrSum: number;
  scoreSum: number;
  rmsSum: number;
}

const EPSILON = 1e-7;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizeTranscriptText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function comparisonKey(value: string): string {
  return normalizeTranscriptText(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

function textEditDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]!;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j]!;
      row[j] = Math.min(
        row[j]! + 1,
        row[j - 1]! + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      previous = saved;
    }
  }
  return row[b.length]!;
}

export function transcriptSimilarity(a: string, b: string): number {
  const left = comparisonKey(a);
  const right = comparisonKey(b);
  if (!left && !right) return 1;
  const longest = Math.max(left.length, right.length);
  if (!longest) return 1;
  return clamp01(1 - textEditDistance(left, right) / longest);
}

/**
 * Scores likely loudspeaker echo. A minimum input length prevents short,
 * legitimate replies such as "yes" from being discarded as echoed words.
 */
export function transcriptEchoSimilarity(
  incomingTranscript: string,
  assistantTranscript: string
): number {
  const incoming = comparisonKey(incomingTranscript);
  const assistant = comparisonKey(assistantTranscript);
  if (incoming.length < 8 || !assistant) return 0;
  const direct = transcriptSimilarity(incoming, assistant);
  const shorter = incoming.length <= assistant.length ? incoming : assistant;
  const longer = incoming.length <= assistant.length ? assistant : incoming;
  if (
    shorter.length >= 12 &&
    shorter.split(/\s+/u).length >= 2 &&
    longer.includes(shorter)
  ) {
    return 1;
  }
  return direct;
}

export interface PartialTranscriptObservation {
  partialTranscript: string;
  stable: boolean;
  similarity: number;
  consecutiveMatches: number;
  partialCount: number;
}

export interface TranscriptStabilityResult {
  partialTranscript: string;
  finalTranscript: string;
  stable: boolean;
  similarity: number;
  partialCount: number;
}

/**
 * Streaming hypotheses are display/log hints only. A partial becomes stable
 * after a pair of nearly-identical consecutive observations. The provider's
 * explicit final event is also compared with the latest accumulated partial.
 */
export class TranscriptStabilizer {
  private cumulative = "";
  private lastPartial = "";
  private stablePartial = "";
  private consecutiveMatches = 0;
  private partialCount = 0;

  ingestDelta(delta: string): PartialTranscriptObservation {
    this.cumulative += delta;
    return this.ingestSnapshotInternal(this.cumulative);
  }

  ingestPartial(partial: string): PartialTranscriptObservation {
    this.cumulative = partial;
    return this.ingestSnapshotInternal(partial);
  }

  finalize(finalTranscript: string): TranscriptStabilityResult {
    const finalText = normalizeTranscriptText(finalTranscript);
    const similarity = this.lastPartial
      ? transcriptSimilarity(this.lastPartial, finalText)
      : 1;
    const stable =
      this.partialCount === 0 ||
      similarity >= 0.88 ||
      (this.consecutiveMatches >= 1 && similarity >= 0.72);
    const result = {
      partialTranscript: this.stablePartial || this.lastPartial,
      finalTranscript: finalText,
      stable,
      similarity: round(similarity, 3),
      partialCount: this.partialCount,
    };
    this.reset();
    return result;
  }

  reset(): void {
    this.cumulative = "";
    this.lastPartial = "";
    this.stablePartial = "";
    this.consecutiveMatches = 0;
    this.partialCount = 0;
  }

  private ingestSnapshotInternal(partial: string): PartialTranscriptObservation {
    const text = normalizeTranscriptText(partial);
    const similarity = this.lastPartial
      ? transcriptSimilarity(this.lastPartial, text)
      : 0;
    if (this.lastPartial && similarity >= 0.88) this.consecutiveMatches++;
    else this.consecutiveMatches = 0;
    this.partialCount++;
    const stable = this.consecutiveMatches >= 1;
    if (stable) this.stablePartial = text;
    this.lastPartial = text;
    return {
      partialTranscript: text,
      stable,
      similarity: round(similarity, 3),
      consecutiveMatches: this.consecutiveMatches,
      partialCount: this.partialCount,
    };
  }
}

export interface DomainVocabularyResult {
  transcript: string;
  correctionsApplied: string[];
}

const DOMAIN_PHRASES: ReadonlyArray<{
  pattern: RegExp;
  canonical: string;
}> = [
  {
    pattern:
      /\be[\s.-]*(?:commerce|commerse|come[\s.-]*r[\s.-]*c(?:e)?)\b/giu,
    canonical: "E-commerce",
  },
  {
    pattern: /\bweb[\s.-]*(?:application|app)\b/giu,
    canonical: "Web application",
  },
  { pattern: /\bweb[\s.-]*site\b/giu, canonical: "Website" },
  {
    pattern: /\bbilling[\s.-]*soft[\s.-]*ware\b/giu,
    canonical: "Billing software",
  },
  {
    pattern: /\bmobile[\s.-]*(?:application|app)\b/giu,
    canonical: "Mobile app",
  },
  {
    pattern: /\bw[\s.]*c[\s.]*technologies\b/giu,
    canonical: "WC Technologies",
  },
  { pattern: /\bw[\s.]*c[\s.]*a[\s.]*i\b/giu, canonical: "WC AI" },
  { pattern: /\be[\s.]*r[\s.]*p\b/giu, canonical: "ERP" },
  { pattern: /\bc[\s.]*r[\s.]*m\b/giu, canonical: "CRM" },
  { pattern: /\bp[\s.]*o[\s.]*s\b/giu, canonical: "POS" },
  { pattern: /\bg[\s.]*s[\s.]*t\b/giu, canonical: "GST" },
  { pattern: /\ba[\s.]*i\b/giu, canonical: "AI" },
  { pattern: /\binventory\b/giu, canonical: "Inventory" },
  { pattern: /\baccounting\b/giu, canonical: "Accounting" },
  { pattern: /\bautomation\b/giu, canonical: "Automation" },
];

/** Conservative canonicalization of business vocabulary, never contact fields. */
export function normalizeDomainVocabulary(
  rawTranscript: string
): DomainVocabularyResult {
  let transcript = normalizeTranscriptText(rawTranscript);
  const correctionsApplied: string[] = [];
  for (const { pattern, canonical } of DOMAIN_PHRASES) {
    transcript = transcript.replace(pattern, (heard) => {
      if (heard !== canonical) {
        correctionsApplied.push(`domain_phrase:${heard}->${canonical}`);
      }
      return canonical;
    });
  }
  return {
    transcript,
    correctionsApplied: [...new Set(correctionsApplied)],
  };
}

function dbfs(amplitude: number): number {
  return 20 * Math.log10(Math.max(EPSILON, amplitude));
}

function emptyStats(): RunningStats {
  return {
    elapsedMs: 0,
    voiceMs: 0,
    trailingSilenceMs: 0,
    continuousSpeechMs: 0,
    voiceFrames: 0,
    totalFrames: 0,
    overlapFrames: 0,
    snrSum: 0,
    scoreSum: 0,
    rmsSum: 0,
  };
}

/**
 * Lightweight adaptive VAD in front of the provider VAD.
 *
 * It is intentionally conservative: clicks/bumps/keyboard/cough-sized bursts
 * stay in the pre-roll buffer and are discarded unless voice-like frames remain
 * continuous. Once opened, the provider still owns final turn boundaries.
 */
export class AdaptiveSpeechGate<T> {
  private readonly sampleRate: number;
  private readonly minContinuousSpeechMs: number;
  private readonly preRollMs: number;
  private readonly candidateGapMs: number;
  private readonly digitPauseMs: number;
  private readonly minimumRms: number;

  private noiseFloor: number;
  private preRoll: BufferedFrame<T>[] = [];
  private preRollDurationMs = 0;
  private candidate: PcmFrameAnalysis[] = [];
  private candidateVoiceMs = 0;
  private candidateGap = 0;
  private active = false;
  private stats: RunningStats = emptyStats();
  private heldDigitSilence: BufferedFrame<T>[] = [];
  private heldDigitSilenceMs = 0;
  private digitEnding = false;
  private activeTriggerReason = "not_triggered";

  constructor(options: AdaptiveSpeechGateOptions) {
    this.sampleRate = options.sampleRate;
    this.minContinuousSpeechMs = options.minContinuousSpeechMs ?? 260;
    this.preRollMs = options.preRollMs ?? 280;
    this.candidateGapMs = options.candidateGapMs ?? 80;
    this.digitPauseMs = options.digitPauseMs ?? 1400;
    this.minimumRms = options.minimumRms ?? 0.006;
    this.noiseFloor = options.initialNoiseFloor ?? 0.0035;
  }

  isOpen(): boolean {
    return this.active;
  }

  currentNoiseFloor(): number {
    return this.noiseFloor;
  }

  currentNoiseDbfs(): number {
    return round(dbfs(this.noiseFloor), 1);
  }

  currentNoiseRms(): number {
    return round(this.noiseFloor, 6);
  }

  process(
    samples: Int16Array,
    payload: T,
    mode: SpeechGateMode,
    sensitivity: SpeechSensitivity = "normal"
  ): SpeechGateResult<T> {
    const analysis = this.analyse(samples, sensitivity);
    const frame = { payload, analysis };

    if (this.active) {
      this.recordActive(analysis);
      return this.processOpenFrame(frame, mode);
    }

    this.rememberPreRoll(frame);
    this.adaptNoiseFloor(analysis);

    let rejected: RejectedSound | undefined;
    if (analysis.voiceLike) {
      this.candidate.push(analysis);
      this.candidateVoiceMs += analysis.durationMs;
      this.candidateGap = 0;
    } else if (this.candidateVoiceMs > 0) {
      this.candidateGap += analysis.durationMs;
      if (this.candidateGap > this.candidateGapMs) {
        if (this.candidateVoiceMs >= 80) {
          rejected = {
            durationMs: Math.round(this.candidateVoiceMs + this.candidateGap),
            reason: "not_continuous_speech",
          };
        }
        this.clearCandidate();
      }
    }

    const candidateDominance =
      this.candidate.length === 0
        ? 0
        : this.candidate.reduce((sum, item) => sum + item.speechScore, 0) /
          this.candidate.length;
    const requiredSpeechMs =
      sensitivity === "assistant_speaking"
        ? this.minContinuousSpeechMs + 60
        : this.minContinuousSpeechMs;
    if (
      this.candidateVoiceMs < requiredSpeechMs ||
      candidateDominance < 0.52
    ) {
      return { forward: [], started: false, rejected };
    }

    this.active = true;
    this.stats = emptyStats();
    for (const item of this.candidate) this.recordActive(item);
    this.stats.continuousSpeechMs = this.candidateVoiceMs;
    this.activeTriggerReason =
      `continuous_human_speech_${Math.round(this.candidateVoiceMs)}ms_` +
      `dominance_${round(candidateDominance, 2)}`;
    this.clearCandidate();

    const forward = this.preRoll.map((item) => item.payload);
    this.preRoll = [];
    this.preRollDurationMs = 0;
    return {
      forward,
      started: true,
      triggerReason: this.activeTriggerReason,
      rejected,
    };
  }

  /**
   * Close the local gate when the provider emits speech_stopped and produce the
   * acoustic half of the per-turn speech log.
   */
  finishTurn(): AcousticTurnMetrics {
    const stats = this.stats;
    const voiceFrames = Math.max(1, stats.voiceFrames);
    const spokenSpanMs = Math.max(
      stats.voiceMs,
      stats.elapsedMs - stats.trailingSilenceMs
    );
    const averageSnrDb = stats.snrSum / voiceFrames;
    const averageScore = stats.scoreSum / voiceFrames;
    const averageRms = stats.rmsSum / voiceFrames;
    const voiceFrameRatio =
      stats.totalFrames > 0 ? stats.voiceFrames / stats.totalFrames : 0;
    const overlapRatio =
      stats.voiceFrames > 0 ? stats.overlapFrames / stats.voiceFrames : 0;

    const snrDominance = clamp01((averageSnrDb - 3) / 17);
    const featureDominance = clamp01((averageScore - 0.42) / 0.4);
    const levelDominance = clamp01((averageRms - 0.004) / 0.05);
    const speakerDominance = clamp01(
      snrDominance * 0.45 +
        featureDominance * 0.35 +
        levelDominance * 0.2 -
        overlapRatio * 0.55
    );

    const noiseDb = dbfs(this.noiseFloor);
    let backgroundNoiseLevel: BackgroundNoiseLevel = "High";
    if (noiseDb <= -43 && averageSnrDb >= 13) backgroundNoiseLevel = "Low";
    else if (noiseDb <= -31 && averageSnrDb >= 7) backgroundNoiseLevel = "Medium";

    let speechConfidence: ConfidenceLevel = "Low";
    if (
      spokenSpanMs >= 480 &&
      averageSnrDb >= 12 &&
      speakerDominance >= 0.62 &&
      overlapRatio < 0.22
    ) {
      speechConfidence = "High";
    } else if (
      spokenSpanMs >= this.minContinuousSpeechMs &&
      averageSnrDb >= 6 &&
      speakerDominance >= 0.32 &&
      overlapRatio < 0.45
    ) {
      speechConfidence = "Medium";
    }

    const result: AcousticTurnMetrics = {
      speechConfidence,
      backgroundNoiseLevel,
      backgroundNoiseDbfs: round(noiseDb, 1),
      micRms: round(averageRms, 6),
      noiseRms: round(this.noiseFloor, 6),
      vadTriggerReason: this.activeTriggerReason,
      speechDurationMs: Math.round(spokenSpanMs),
      continuousSpeechMs: Math.round(stats.continuousSpeechMs),
      averageSnrDb: round(averageSnrDb, 1),
      speakerDominance: round(speakerDominance, 3),
      voiceFrameRatio: round(voiceFrameRatio, 3),
    };

    this.resetTurn();
    return result;
  }

  reset(): void {
    this.preRoll = [];
    this.preRollDurationMs = 0;
    this.clearCandidate();
    this.resetTurn();
  }

  private processOpenFrame(
    frame: BufferedFrame<T>,
    mode: SpeechGateMode
  ): SpeechGateResult<T> {
    if (mode !== "digits") {
      const held = this.heldDigitSilence.map((item) => item.payload);
      this.clearHeldDigitSilence();
      return { forward: [...held, frame.payload], started: false };
    }

    if (frame.analysis.voiceLike) {
      // Compress a long digit-to-digit pause before it reaches provider VAD.
      // A small tail is retained so separate digits do not sound concatenated.
      const bridgeMs = 140;
      let keptMs = 0;
      const bridge: T[] = [];
      for (let i = this.heldDigitSilence.length - 1; i >= 0; i--) {
        const item = this.heldDigitSilence[i]!;
        bridge.unshift(item.payload);
        keptMs += item.analysis.durationMs;
        if (keptMs >= bridgeMs) break;
      }
      this.clearHeldDigitSilence();
      this.digitEnding = false;
      return { forward: [...bridge, frame.payload], started: false };
    }

    if (this.digitEnding) {
      return { forward: [frame.payload], started: false };
    }

    this.heldDigitSilence.push(frame);
    this.heldDigitSilenceMs += frame.analysis.durationMs;
    if (this.heldDigitSilenceMs < this.digitPauseMs) {
      return { forward: [], started: false };
    }

    // This is the final pause: release silence so provider VAD can close the
    // turn. Until this point, pauses between spoken digits remain one turn.
    this.digitEnding = true;
    const forward: T[] = [];
    let releasedMs = 0;
    for (let i = this.heldDigitSilence.length - 1; i >= 0; i--) {
      const item = this.heldDigitSilence[i]!;
      forward.unshift(item.payload);
      releasedMs += item.analysis.durationMs;
      if (releasedMs >= 900) break;
    }
    this.clearHeldDigitSilence();
    return { forward, started: false };
  }

  private analyse(samples: Int16Array, sensitivity: SpeechSensitivity = "normal"): PcmFrameAnalysis {
    if (samples.length === 0) {
      return {
        durationMs: 0,
        rms: 0,
        peak: 0,
        zcr: 0,
        crestFactor: 0,
        clippingRatio: 0,
        snrDb: -100,
        speechScore: 0,
        voiceLike: false,
        overlapRisk: false,
      };
    }

    let sumSquares = 0;
    let peak = 0;
    let crossings = 0;
    let clipped = 0;
    let previousSign = 0;
    for (let i = 0; i < samples.length; i++) {
      const value = samples[i]! / 32768;
      const absolute = Math.abs(value);
      sumSquares += value * value;
      if (absolute > peak) peak = absolute;
      if (absolute >= 0.985) clipped++;

      // Ignore tiny zero crossings created by quantisation/noise.
      const sign = absolute < 0.0015 ? previousSign : value >= 0 ? 1 : -1;
      if (previousSign !== 0 && sign !== previousSign) crossings++;
      previousSign = sign;
    }

    const rms = Math.sqrt(sumSquares / samples.length);
    const zcr = crossings / Math.max(1, samples.length - 1);
    const crestFactor = peak / Math.max(EPSILON, rms);
    const clippingRatio = clipped / samples.length;
    const snrDb = 20 * Math.log10((rms + EPSILON) / (this.noiseFloor + EPSILON));
    const durationMs = (samples.length / this.sampleRate) * 1000;

    let speechScore = 0;
    if (snrDb >= 15) speechScore += 0.38;
    else if (snrDb >= 9) speechScore += 0.3;
    else if (snrDb >= 5) speechScore += 0.2;
    else if (snrDb >= 3) speechScore += 0.08;

    if (zcr >= 0.018 && zcr <= 0.24) speechScore += 0.24;
    else if (zcr >= 0.007 && zcr <= 0.34) speechScore += 0.13;

    if (crestFactor >= 1.25 && crestFactor <= 5.8) speechScore += 0.17;
    else if (crestFactor <= 8.2) speechScore += 0.07;

    const echoSuppression = sensitivity === "assistant_speaking";
    const effectiveMinimumRms =
      this.minimumRms * (echoSuppression ? 1.8 : 1);
    if (rms >= Math.max(effectiveMinimumRms, this.noiseFloor * 1.8)) {
      speechScore += 0.13;
    }
    if (clippingRatio < 0.01) speechScore += 0.06;

    const impulse = crestFactor > 9 || (peak > 0.82 && rms < 0.055);
    const broadNoise = zcr > 0.39;
    const lowRumble = zcr < 0.006;
    if (impulse) speechScore -= 0.5;
    if (broadNoise) speechScore -= 0.32;
    if (lowRumble) speechScore -= 0.24;
    speechScore = clamp01(speechScore);

    const voiceLike =
      durationMs > 0 &&
      rms >= effectiveMinimumRms &&
      snrDb >= (echoSuppression ? 10 : 4.5) &&
      speechScore >= (echoSuppression ? 0.62 : 0.48) &&
      !impulse &&
      !broadNoise &&
      !lowRumble;
    const overlapRisk =
      voiceLike &&
      (clippingRatio > 0.025 ||
        (zcr > 0.27 && crestFactor < 3.2) ||
        (rms > 0.16 && crestFactor > 5.5));

    return {
      durationMs,
      rms,
      peak,
      zcr,
      crestFactor,
      clippingRatio,
      snrDb,
      speechScore,
      voiceLike,
      overlapRisk,
    };
  }

  private rememberPreRoll(frame: BufferedFrame<T>): void {
    this.preRoll.push(frame);
    this.preRollDurationMs += frame.analysis.durationMs;
    while (
      this.preRoll.length > 1 &&
      this.preRollDurationMs > this.preRollMs
    ) {
      const removed = this.preRoll.shift()!;
      this.preRollDurationMs -= removed.analysis.durationMs;
    }
  }

  private adaptNoiseFloor(analysis: PcmFrameAnalysis): void {
    if (analysis.voiceLike || analysis.rms <= 0) return;
    const alpha = analysis.rms < this.noiseFloor * 3 ? 0.035 : 0.008;
    const target = Math.min(0.06, analysis.rms);
    this.noiseFloor = Math.max(
      0.0005,
      this.noiseFloor * (1 - alpha) + target * alpha
    );
  }

  private recordActive(analysis: PcmFrameAnalysis): void {
    this.stats.elapsedMs += analysis.durationMs;
    this.stats.totalFrames++;
    if (analysis.voiceLike) {
      this.stats.voiceMs += analysis.durationMs;
      this.stats.trailingSilenceMs = 0;
      this.stats.voiceFrames++;
      this.stats.snrSum += analysis.snrDb;
      this.stats.scoreSum += analysis.speechScore;
      this.stats.rmsSum += analysis.rms;
      if (analysis.overlapRisk) this.stats.overlapFrames++;
    } else {
      this.stats.trailingSilenceMs += analysis.durationMs;
      this.adaptNoiseFloor(analysis);
    }
  }

  private clearCandidate(): void {
    this.candidate = [];
    this.candidateVoiceMs = 0;
    this.candidateGap = 0;
  }

  private clearHeldDigitSilence(): void {
    this.heldDigitSilence = [];
    this.heldDigitSilenceMs = 0;
  }

  private resetTurn(): void {
    this.active = false;
    this.stats = emptyStats();
    this.clearHeldDigitSilence();
    this.digitEnding = false;
    this.activeTriggerReason = "not_triggered";
  }
}

export function pcm16FromBase64(base64: string): Int16Array {
  const buffer = Buffer.from(base64, "base64");
  const length = Math.floor(buffer.byteLength / 2);
  const samples = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = buffer.readInt16LE(i * 2);
  }
  return samples;
}

export interface TranscriptAssessmentInput {
  transcript: string;
  event?: Record<string, unknown>;
  acoustics?: AcousticTurnMetrics;
  phase?: string;
  confirmationState?: string;
  numberCollection?: NumberCollectionSnapshot;
  nameCandidates?: string[];
  partialTranscript?: string;
  partialStable?: boolean;
  partialStabilityScore?: number;
  falseTriggerCount?: number;
  vadTriggerReason?: string;
}

export interface TranscriptAssessment {
  rawTranscript: string;
  transcript: string;
  partialTranscript: string;
  finalTranscript: string;
  transcriptStable: boolean;
  transcriptStabilityScore: number;
  transcriptConfidence: ConfidenceLevel;
  transcriptConfidenceScore: number;
  providerConfidence?: number;
  speechConfidence: ConfidenceLevel;
  backgroundNoiseLevel: BackgroundNoiseLevel;
  backgroundNoiseDbfs: number;
  micRms: number;
  noiseRms: number;
  speechDurationMs: number;
  averageSnrDb: number;
  speakerDominance: number;
  vadTriggerReason: string;
  falseTriggerCount: number;
  correctionsApplied: string[];
  correctionCandidates: string[];
  criticalFields: CriticalSpeechField[];
  numberCollectionActive: boolean;
  numberCollectionStage: NumberCollectionStage;
  normalizedDigits: string;
  shouldRetry: boolean;
  reasons: string[];
}

const DIGIT_WORDS = new Map<string, string>([
  ["zero", "0"],
  ["oh", "0"],
  ["o", "0"],
  ["one", "1"],
  ["two", "2"],
  ["three", "3"],
  ["four", "4"],
  ["five", "5"],
  ["six", "6"],
  ["seven", "7"],
  ["eight", "8"],
  ["nine", "9"],
  ["പൂജ്യം", "0"],
  ["സീറോ", "0"],
  ["ഒന്ന്", "1"],
  ["രണ്ട്", "2"],
  ["മൂന്ന്", "3"],
  ["നാല്", "4"],
  ["അഞ്ച്", "5"],
  ["ആറ്", "6"],
  ["ഏഴ്", "7"],
  ["എട്ട്", "8"],
  ["ഒമ്പത്", "9"],
]);

const DIGIT_REPEAT_WORDS = new Map<string, number>([
  ["double", 2],
  ["triple", 3],
  ["ഡബിൾ", 2],
  ["ഡബിള്", 2],
  ["ട്രിപ്പിൾ", 3],
  ["ട്രിപ്പിള്", 3],
]);

const MALAYALAM_NUMERALS = new Map<string, string>([
  ["൦", "0"],
  ["൧", "1"],
  ["൨", "2"],
  ["൩", "3"],
  ["൪", "4"],
  ["൫", "5"],
  ["൬", "6"],
  ["൭", "7"],
  ["൮", "8"],
  ["൯", "9"],
]);

const SIMPLE_CONFIRMATION_TOKENS = new Set([
  "yes",
  "correct",
  "ok",
  "okay",
  "no",
  "wrong",
  "അതെ",
  "ശരി",
  "ഓക്കേ",
  "ശരിയാണ്",
  "അല്ല",
  "തെറ്റ്",
]);

export function normalizeSpokenDigits(text: string): {
  digits: string;
  normalizedWords: boolean;
} {
  const out: string[] = [];
  let normalizedWords = false;
  const tokens = text
    .toLowerCase()
    .replace(/[.,;:()[\]{}\-_/\\]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    const repeat = DIGIT_REPEAT_WORDS.get(token);
    if (repeat !== undefined) {
      const next = tokens[index + 1];
      const mappedNext =
        next === undefined
          ? undefined
          : DIGIT_WORDS.get(next) ??
            (next.length === 1 && next >= "0" && next <= "9"
              ? next
              : MALAYALAM_NUMERALS.get(next));
      if (mappedNext !== undefined) {
        out.push(...Array.from({ length: repeat }, () => mappedNext));
        normalizedWords = true;
        index++;
      }
      continue;
    }

    const mapped = DIGIT_WORDS.get(token);
    if (mapped !== undefined) {
      out.push(mapped);
      normalizedWords = true;
      continue;
    }
    for (const character of token) {
      if (character >= "0" && character <= "9") out.push(character);
      else {
        const malayalam = MALAYALAM_NUMERALS.get(character);
        if (malayalam !== undefined) {
          out.push(malayalam);
          normalizedWords = true;
        }
      }
    }
  }
  return { digits: out.join(""), normalizedWords };
}

const NUMBER_REQUEST_TERM =
  /\bphone(?:\s+number)?\b|\bmobile(?:\s+(?:phone\s+)?number)?\b(?!\s+(?:apps?|applications?)\b)|\bcontact\s+number\b|\bwhats\s*app(?:\s+number)?\b|(?:ഫോൺ|കോൺടാക്റ്റ്|കോണ്ടാക്റ്റ്|വാട്സ്ആപ്പ്|വാട്ട്സ്ആപ്പ്)(?:\s*നമ്പർ)?|മൊബൈൽ(?:\s*നമ്പർ)?(?!\s*(?:ആപ്പ്|ആപ്ലിക്കേഷൻ))|നമ്പർ/iu;
const NUMBER_REQUEST_CUE =
  /\b(?:tell|give|provide|share|enter|say|please|what(?:'s| is)|may i have|can i have|could i have)\b|(?:പറയൂ|പറയാമോ|പറയുമോ|തരാമോ|തരൂ|നൽകാമോ|നൽകൂ|ഷെയർ|എന്താണ്|എന്താ|അയക്കാമോ|വിളിക്കേണ്ട)/iu;
const NUMBER_ONLY_QUESTION =
  /^(?:(?:your|the)\s+)?(?:phone(?:\s+number)?|mobile(?:\s+number)?|contact\s+number|whats\s*app(?:\s+number)?|(?:ഫോൺ|മൊബൈൽ|കോൺടാക്റ്റ്|കോണ്ടാക്റ്റ്|വാട്സ്ആപ്പ്|വാട്ട്സ്ആപ്പ്)(?:\s*നമ്പർ)?|നമ്പർ)(?:\s+(?:please|ഒന്ന്))?[?？]?$/iu;
const POSITIVE_CONFIRMATION =
  /\b(?:yes|correct|ok|okay|right)\b|(?:അതെ|ശരി|ഓക്കേ|ശരിയാണ്|കറക്റ്റ്)/iu;
const NEGATIVE_CONFIRMATION =
  /\b(?:no|wrong|change|incorrect|not\s+(?:correct|right))\b|(?:അല്ല|തെറ്റ്|മാറ്റണം|ശരിയല്ല|ശരി\s+അല്ല)/iu;

/** True only when an assistant utterance asks the caller to provide a number. */
export function asksForContactNumber(text: string): boolean {
  const normalized = normalizeTranscriptText(text);
  if (!NUMBER_REQUEST_TERM.test(normalized)) return false;
  if (NUMBER_ONLY_QUESTION.test(normalized)) return true;

  const clauses = normalized.split(/[,.!?？…\n]+/u);
  return clauses.some((clause) => {
    const term = NUMBER_REQUEST_TERM.exec(clause);
    const cue = NUMBER_REQUEST_CUE.exec(clause);
    if (!term || !cue) return false;
    const termStart = term.index;
    const termEnd = termStart + term[0].length;
    const cueStart = cue.index;
    const cueEnd = cueStart + cue[0].length;
    const between =
      termStart <= cueStart
        ? clause.slice(termEnd, cueStart)
        : clause.slice(cueEnd, termStart);
    return between.split(/\s+/u).filter(Boolean).length <= 4;
  });
}

/**
 * Per-call speech state for collecting a contact number. It owns no enquiry or
 * CRM data; the candidate exists only until the caller confirms or rejects it.
 */
export class NumberCollectionMode {
  private stage: NumberCollectionStage = "inactive";
  private candidate = "";

  reset(): void {
    this.stage = "inactive";
    this.candidate = "";
  }

  snapshot(): NumberCollectionSnapshot {
    return {
      active: this.stage !== "inactive",
      stage: this.stage,
      candidate: this.candidate,
    };
  }

  isActive(): boolean {
    return this.stage !== "inactive";
  }

  isCollectingDigits(): boolean {
    return this.stage === "collecting";
  }

  observeAssistantUtterance(
    text: string
  ): NumberCollectionTransition | undefined {
    if (this.stage !== "inactive" || !asksForContactNumber(text)) {
      return undefined;
    }
    this.stage = "collecting";
    this.candidate = "";
    return "entered";
  }

  observeCallerUtterance(
    text: string
  ): NumberCollectionTransition | undefined {
    if (this.stage === "inactive") return undefined;

    if (this.stage === "collecting") {
      const { digits } = normalizeSpokenDigits(text);
      if (
        digits.length < NUMBER_COLLECTION_MIN_DIGITS ||
        digits.length > NUMBER_COLLECTION_MAX_DIGITS
      ) {
        return undefined;
      }
      this.candidate = digits;
      this.stage = "awaiting_confirmation";
      return "candidate_recognized";
    }

    if (NEGATIVE_CONFIRMATION.test(text)) {
      this.stage = "collecting";
      this.candidate = "";
      return "rejected";
    }
    if (POSITIVE_CONFIRMATION.test(text)) {
      this.reset();
      return "confirmed";
    }
    return undefined;
  }

  blocksPhonePersistence(
    toolName: string,
    args: unknown
  ): boolean {
    if (!this.isActive() || !["save_enquiry", "complete_enquiry"].includes(toolName)) {
      return false;
    }
    return (
      !!args &&
      typeof args === "object" &&
      Object.prototype.hasOwnProperty.call(args, "phone")
    );
  }
}

function numericConfidence(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > 1) return undefined;
  return value;
}

/** Read provider confidence when available; Swaram currently may omit it. */
export function providerTranscriptConfidence(
  event?: Record<string, unknown>
): number | undefined {
  if (!event) return undefined;
  const direct =
    numericConfidence(event.confidence) ??
    numericConfidence(event.transcript_confidence) ??
    numericConfidence(event.transcriptConfidence);
  if (direct !== undefined) return direct;

  const words = Array.isArray(event.words) ? event.words : [];
  const wordScores = words
    .map((word) =>
      word && typeof word === "object"
        ? numericConfidence((word as Record<string, unknown>).confidence)
        : undefined
    )
    .filter((value): value is number => value !== undefined);
  if (wordScores.length) {
    return wordScores.reduce((sum, value) => sum + value, 0) / wordScores.length;
  }

  const logprobs = Array.isArray(event.logprobs) ? event.logprobs : [];
  const values = logprobs
    .map((item) =>
      item && typeof item === "object"
        ? (item as Record<string, unknown>).logprob
        : undefined
    )
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length) {
    const meanLogprob = values.reduce((sum, value) => sum + value, 0) / values.length;
    return clamp01(Math.exp(meanLogprob));
  }

  return undefined;
}

function criticalFieldsFor(
  transcript: string,
  phase?: string,
  confirmationState?: string
): CriticalSpeechField[] {
  const fields = new Set<CriticalSpeechField>();
  const normalizedReply = transcript
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
  const replyTokens = normalizedReply.split(/\s+/).filter(Boolean);
  const simpleConfirmation =
    confirmationState === "awaiting" &&
    replyTokens.length > 0 &&
    replyTokens.length <= 3 &&
    replyTokens.every((token) => SIMPLE_CONFIRMATION_TOKENS.has(token));
  if (!simpleConfirmation) {
    if (phase === "name") fields.add("name");
    if (phase === "mobile") fields.add("phone");
    if (phase === "company") fields.add("company");
    if (
      phase === "service" &&
      /\bwebsite\b|വെബ്(?:സൈറ്റ്)?/iu.test(transcript)
    ) {
      fields.add("website");
    }
  }

  if (
    /[\w.+-]+\s*@\s*[\w.-]+\.[a-z]{2,}/i.test(transcript) ||
    /\b(gmail|email|e-mail)\b|ഇമെയിൽ/i.test(transcript)
  ) {
    fields.add("email");
  }
  if (
    /\b(https?:\/\/|www\.|[a-z0-9-]+\.(?:com|in|org|net|co\.in))\b/i.test(
      transcript
    )
  ) {
    fields.add("website");
  }
  if (
    /\b(place|location|address|district|city|town|kochi|cochin|ernakulam|kozhikode|calicut|malappuram|kannur|thrissur|trivandrum|thiruvananthapuram|kollam|kottayam|palakkad|alappuzha|wayanad|idukki|kasaragod|pathanamthitta)\b|സ്ഥലം|ലൊക്കേഷൻ|ജില്ല|നഗരം|കൊച്ചി|എറണാകുളം|കോഴിക്കോട്|മലപ്പുറം|കണ്ണൂർ|തൃശ്ശൂർ|തിരുവനന്തപുരം|കൊല്ലം|കോട്ടയം|പാലക്കാട്|ആലപ്പുഴ|വയനാട്|ഇടുക്കി|കാസർഗോഡ്|പത്തനംതിട്ട/i.test(
      transcript
    )
  ) {
    fields.add("place");
  }
  return [...fields];
}

function levelForScore(score: number): ConfidenceLevel {
  if (score >= 0.78) return "High";
  if (score >= 0.52) return "Medium";
  return "Low";
}

/**
 * Score a completed transcript. Provider confidence wins when present; acoustic
 * and transcript-quality checks provide a deterministic fallback.
 */
export function assessTranscript(
  input: TranscriptAssessmentInput
): TranscriptAssessment {
  const rawTranscript = normalizeTranscriptText(input.transcript);
  const numberCollectionStage: NumberCollectionStage =
    input.numberCollection?.stage ??
    (input.phase === "mobile" && input.confirmationState !== "awaiting"
      ? "collecting"
      : "inactive");
  const expectingPhone = numberCollectionStage === "collecting";
  const protectCriticalSpelling =
    input.phase === "name" ||
    input.phase === "mobile" ||
    input.phase === "company" ||
    /@|\b(?:gmail|email|e-mail|https?:\/\/|www\.)\b/i.test(rawTranscript);
  const domainVocabulary = protectCriticalSpelling
    ? { transcript: rawTranscript, correctionsApplied: [] }
    : normalizeDomainVocabulary(rawTranscript);
  const digits = normalizeSpokenDigits(domainVocabulary.transcript);
  const transcript =
    expectingPhone && digits.digits
      ? digits.digits
      : domainVocabulary.transcript;
  const providerConfidence = providerTranscriptConfidence(input.event);
  const acoustics = input.acoustics;
  const reasons: string[] = [];
  const correctionsApplied: string[] = [
    ...domainVocabulary.correctionsApplied,
  ];
  const criticalFields = criticalFieldsFor(
    transcript,
    input.phase,
    numberCollectionStage === "awaiting_confirmation"
      ? "awaiting"
      : input.confirmationState
  );

  let score =
    providerConfidence ??
    (acoustics?.speechConfidence === "High"
      ? 0.84
      : acoustics?.speechConfidence === "Medium"
        ? 0.64
        : acoustics?.speechConfidence === "Low"
          ? 0.38
          : 0.58);

  if (!transcript) {
    score = 0.02;
    reasons.push("empty_transcript");
  } else {
    const meaningful = transcript.match(/[\p{L}\p{M}\p{N}]/gu)?.length ?? 0;
    const visible = transcript.replace(/\s/g, "").length;
    if (visible > 0 && meaningful / visible < 0.55) {
      score -= 0.2;
      reasons.push("low_text_signal");
    }
    if (/\[(?:inaudible|noise|music|cough)]|\b(?:inaudible|unknown)\b/i.test(transcript)) {
      score = Math.min(score, 0.38);
      reasons.push("transcriber_uncertainty_marker");
    }

    const words = transcript.toLowerCase().split(/\s+/).filter(Boolean);
    const uniqueRatio = words.length
      ? new Set(words).size / words.length
      : 0;
    if (words.length >= 5 && uniqueRatio < 0.35) {
      score -= 0.18;
      reasons.push("repetitive_transcript");
    }
  }

  if (acoustics?.speechConfidence === "Low") {
    score = Math.min(score, 0.46);
    reasons.push("low_acoustic_confidence");
  }
  if (acoustics?.backgroundNoiseLevel === "High") {
    score = Math.min(score, 0.48);
    reasons.push("high_background_noise");
  }
  if (acoustics && acoustics.speakerDominance < 0.32) {
    score = Math.min(score, 0.46);
    reasons.push("no_dominant_speaker");
  }
  if (
    acoustics &&
    acoustics.speechDurationMs < 220 &&
    input.confirmationState !== "awaiting" &&
    numberCollectionStage !== "awaiting_confirmation"
  ) {
    score = Math.min(score, 0.44);
    reasons.push("speech_too_short");
  }
  if (input.partialStable === false) {
    score = Math.min(score, 0.46);
    reasons.push("unstable_partial_transcript");
  }

  if (digits.normalizedWords) {
    correctionsApplied.push("spoken_digits_normalized");
  }
  if (expectingPhone) {
    if (
      digits.digits.length < NUMBER_COLLECTION_MIN_DIGITS ||
      digits.digits.length > NUMBER_COLLECTION_MAX_DIGITS
    ) {
      score = Math.min(score, 0.42);
      reasons.push(`phone_digit_count_${digits.digits.length}`);
    } else {
      score = Math.min(1, score + 0.06);
    }
  }

  score = clamp01(score);
  const transcriptConfidence = levelForScore(score);
  if (providerConfidence === undefined) {
    reasons.push("provider_confidence_unavailable_acoustic_fallback_used");
  }

  return {
    rawTranscript,
    transcript,
    partialTranscript: normalizeTranscriptText(input.partialTranscript ?? ""),
    finalTranscript: transcript,
    transcriptStable: input.partialStable ?? true,
    transcriptStabilityScore: round(input.partialStabilityScore ?? 1, 3),
    transcriptConfidence,
    transcriptConfidenceScore: round(score, 3),
    providerConfidence:
      providerConfidence === undefined ? undefined : round(providerConfidence, 3),
    speechConfidence: acoustics?.speechConfidence ?? "Low",
    backgroundNoiseLevel: acoustics?.backgroundNoiseLevel ?? "High",
    backgroundNoiseDbfs: acoustics?.backgroundNoiseDbfs ?? -20,
    micRms: acoustics?.micRms ?? 0,
    noiseRms: acoustics?.noiseRms ?? 0,
    speechDurationMs: acoustics?.speechDurationMs ?? 0,
    averageSnrDb: acoustics?.averageSnrDb ?? 0,
    speakerDominance: acoustics?.speakerDominance ?? 0,
    vadTriggerReason:
      input.vadTriggerReason ??
      acoustics?.vadTriggerReason ??
      "provider_vad_without_local_reason",
    falseTriggerCount: input.falseTriggerCount ?? 0,
    correctionsApplied,
    correctionCandidates: [...new Set(input.nameCandidates ?? [])].slice(0, 5),
    criticalFields,
    numberCollectionActive: numberCollectionStage !== "inactive",
    numberCollectionStage,
    normalizedDigits: digits.digits,
    shouldRetry: transcriptConfidence === "Low",
    reasons,
  };
}

export const MALAYALAM_SPEECH_RECOVERY =
  "ക്ഷമിക്കണം... അവസാന ഭാഗം വ്യക്തമായി കേട്ടില്ല. ഒന്ന് കൂടി പതിയെ പറയാമോ?";
export const MALAYALAM_NUMBER_RECOVERY =
  "മുഴുവൻ നമ്പർ ഒന്ന് കൂടി പതിയെ പറയാമോ?";

/**
 * A short model-side control note. Low-confidence audio is explicitly discarded;
 * critical fields and fuzzy-name candidates remain confirmation-only.
 */
export function speechControlNote(
  assessment: TranscriptAssessment
): string | undefined {
  if (assessment.shouldRetry) {
    const invalidNumberLength =
      assessment.numberCollectionStage === "collecting" &&
      assessment.reasons.some((reason) => reason.startsWith("phone_digit_count_"));
    if (invalidNumberLength) {
      return [
        "[NUMBER COLLECTION MODE — authoritative]",
        `Only ${assessment.normalizedDigits.length} digit(s) were recognized; valid input must contain ${NUMBER_COLLECTION_MIN_DIGITS}-${NUMBER_COLLECTION_MAX_DIGITS} digits.`,
        "Discard this number. Do not save, advance, or call any tool.",
        `Ask again with exactly this Malayalam sentence: "${MALAYALAM_NUMBER_RECOVERY}"`,
      ].join("\n");
    }
    return [
      "[SPEECH INTELLIGENCE — authoritative]",
      "Transcript confidence: Low.",
      "Discard the caller transcript for this turn. Do not infer from it, do not advance the flow, and do not call any tool.",
      `Reply with one natural Malayalam recovery question only: "${MALAYALAM_SPEECH_RECOVERY}"`,
    ].join("\n");
  }

  if (
    assessment.numberCollectionStage === "collecting" &&
    assessment.normalizedDigits.length >= NUMBER_COLLECTION_MIN_DIGITS &&
    assessment.normalizedDigits.length <= NUMBER_COLLECTION_MAX_DIGITS
  ) {
    return [
      "[NUMBER COLLECTION MODE — authoritative]",
      `Normalized number: ${assessment.normalizedDigits}`,
      `Reply exactly: "ഞാൻ കേട്ടത് ${assessment.normalizedDigits} ശരിയാണോ?"`,
      "Do not save or call any tool in this turn. Wait for explicit confirmation.",
    ].join("\n");
  }

  if (
    assessment.criticalFields.length === 0 &&
    assessment.correctionCandidates.length === 0
  ) {
    return undefined;
  }

  const lines = [
    "[SPEECH INTELLIGENCE — authoritative]",
    `Transcript confidence: ${assessment.transcriptConfidence}.`,
  ];
  if (assessment.criticalFields.length) {
    lines.push(
      `Unconfirmed critical field(s): ${assessment.criticalFields.join(", ")}.`,
      "Read back exactly what you heard and wait for an explicit yes before saving or advancing."
    );
  }
  if (assessment.correctionCandidates.length) {
    lines.push(
      `Possible Indian-name spellings (hints only): ${assessment.correctionCandidates.join(", ")}.`,
      "Never silently replace the heard name. Ask the caller which spelling is correct."
    );
  }
  return lines.join("\n");
}

/** STT hints only; these do not alter the model's business instructions. */
export const INPUT_TRANSCRIPTION_CONFIG = {
  model: "whisper-1",
  language: "ml",
  prompt:
    "Kerala Malayalam and Manglish business call. Preserve Indian names and exact digit sequences. Number speech may include zero, oh, repeated digit words, or phrases such as double eight; transcribe every spoken digit in order. Treat these as fixed phrases: Website, Web application, E-commerce, ERP, CRM, POS, Billing software, Inventory, Accounting, GST, AI, Automation, Mobile app, WC AI, WC Technologies. Never split E-commerce into E / come / RC. Common names include Mohammed, Muhammed, Muhammad, Irfan, Shihab, Niyas, Noufal, Ashraf, Fathima, Amina, Abdul, Rahman, Shamil, Shafi, Jabir, and Junaid.",
} as const;
