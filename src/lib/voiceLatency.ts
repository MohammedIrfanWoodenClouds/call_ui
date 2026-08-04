/** Pipeline stages measured for each conversational turn. */
export const LATENCY_STAGES = [
  {
    key: "micToSpeechDetection",
    label: "Microphone → Speech Detection",
  },
  {
    key: "speechDetectionToStt",
    label: "Speech Detection → Speech To Text",
  },
  {
    key: "sttToLlm",
    label: "Speech To Text → LLM",
  },
  {
    key: "llmToTts",
    label: "LLM → Text To Speech",
  },
  {
    key: "ttsToPlayback",
    label: "Text To Speech → Playback",
  },
] as const;

export type LatencyStageKey = (typeof LATENCY_STAGES)[number]["key"];

export type TurnLatency = Partial<Record<LatencyStageKey, number>> & {
  turn: number;
  /** Sum of completed stage durations for this turn (ms). */
  total: number;
  /** User finished speaking → first audible audio (ms), when both marks exist. */
  e2eReply?: number;
};

export type StageStats = {
  stage: string;
  samples: number;
  average: number | null;
  minimum: number | null;
  maximum: number | null;
};

export type LatencySnapshot = {
  turns: TurnLatency[];
  stages: StageStats[];
  /** Avg / min / max of per-turn totals. */
  totalConversation: StageStats;
};

type OpenTurn = {
  turn: number;
  micEnergyAt?: number;
  speechStartedAt?: number;
  speechStoppedAt?: number;
  sttDoneAt?: number;
  llmStartedAt?: number;
  firstAudioDeltaAt?: number;
  playbackStartedAt?: number;
  awaitingMicEnergy: boolean;
  recorded: Partial<Record<LatencyStageKey, number>>;
};

function now(): number {
  return typeof performance !== "undefined" && performance.now
    ? performance.now()
    : Date.now();
}

function roundMs(ms: number): number {
  return Math.round(ms * 10) / 10;
}

function statsFor(label: string, values: number[]): StageStats {
  if (!values.length) {
    return { stage: label, samples: 0, average: null, minimum: null, maximum: null };
  }
  const sum = values.reduce((a, b) => a + b, 0);
  return {
    stage: label,
    samples: values.length,
    average: roundMs(sum / values.length),
    minimum: roundMs(Math.min(...values)),
    maximum: roundMs(Math.max(...values)),
  };
}

/**
 * Marks boundary events across Mic → VAD → STT → LLM → TTS → Playback
 * and aggregates avg / min / max per stage plus total conversation latency.
 */
export class VoiceLatencyTracker {
  private turns: TurnLatency[] = [];
  private open: OpenTurn | null = null;
  private turnCounter = 0;
  private listeners = new Set<(snap: LatencySnapshot) => void>();

  /** RMS above this counts as mic energy for Mic → Speech Detection. */
  energyThreshold = 0.012;

  reset(): void {
    this.turns = [];
    this.open = null;
    this.turnCounter = 0;
    this.emit();
  }

  subscribe(fn: (snap: LatencySnapshot) => void): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }

  private ensureTurn(): OpenTurn {
    if (!this.open) {
      this.turnCounter += 1;
      this.open = {
        turn: this.turnCounter,
        awaitingMicEnergy: true,
        recorded: {},
      };
    }
    return this.open;
  }

  /** Mic PCM chunk with RMS — starts Mic → Speech Detection when energy appears. */
  onMicChunk(rms: number): void {
    const t = this.ensureTurn();
    if (!t.awaitingMicEnergy || t.micEnergyAt != null) return;
    if (rms < this.energyThreshold) return;
    t.micEnergyAt = now();
  }

  onSpeechStarted(): void {
    const t = this.ensureTurn();
    const at = now();
    t.speechStartedAt = at;
    t.awaitingMicEnergy = false;
    if (t.micEnergyAt != null && t.recorded.micToSpeechDetection == null) {
      t.recorded.micToSpeechDetection = roundMs(at - t.micEnergyAt);
    }
  }

  onSpeechStopped(): void {
    const t = this.ensureTurn();
    t.speechStoppedAt = now();
  }

  onSttCompleted(): void {
    const t = this.ensureTurn();
    const at = now();
    t.sttDoneAt = at;
    if (t.speechStoppedAt != null && t.recorded.speechDetectionToStt == null) {
      t.recorded.speechDetectionToStt = roundMs(at - t.speechStoppedAt);
    }
    if (t.llmStartedAt != null && t.recorded.sttToLlm == null) {
      // LLM often starts before STT finishes on realtime APIs → 0 when overlapped.
      t.recorded.sttToLlm = roundMs(Math.max(0, t.llmStartedAt - at));
    }
  }

  onLlmStarted(): void {
    const t = this.ensureTurn();
    const at = now();
    t.llmStartedAt = at;
    if (t.sttDoneAt != null && t.recorded.sttToLlm == null) {
      t.recorded.sttToLlm = roundMs(at - t.sttDoneAt);
    }
  }

  /** First TTS audio delta of the reply. */
  onTtsFirstDelta(): void {
    const t = this.ensureTurn();
    if (t.firstAudioDeltaAt != null) return;
    const at = now();
    t.firstAudioDeltaAt = at;
    if (t.llmStartedAt != null && t.recorded.llmToTts == null) {
      t.recorded.llmToTts = roundMs(at - t.llmStartedAt);
    }
  }

  /**
   * First chunk scheduled for audible playback.
   * @param scheduleDelayMs ms until AudioBufferSourceNode starts (audio clock).
   */
  onPlaybackScheduled(scheduleDelayMs = 0): void {
    const t = this.ensureTurn();
    if (t.playbackStartedAt != null || t.firstAudioDeltaAt == null) return;
    const at = now();
    t.playbackStartedAt = at + Math.max(0, scheduleDelayMs);
    if (t.recorded.ttsToPlayback == null) {
      t.recorded.ttsToPlayback = roundMs(
        Math.max(0, scheduleDelayMs) + (at - t.firstAudioDeltaAt)
      );
    }
    this.finalizeTurn();
  }

  /** Drop an in-flight agent reply that never reached playback (barge-in). */
  cancelInFlightReply(): void {
    const t = this.open;
    if (!t) return;
    if (t.llmStartedAt != null && t.playbackStartedAt == null) {
      this.open = null;
    }
  }

  /** Force-close a turn that never reached playback (barge-in / cancel). */
  abandonTurn(): void {
    this.open = null;
  }

  private finalizeTurn(): void {
    const t = this.open;
    if (!t) return;

    const stages = LATENCY_STAGES.map((s) => t.recorded[s.key]).filter(
      (v): v is number => typeof v === "number"
    );
    const total = roundMs(stages.reduce((a, b) => a + b, 0));

    let e2eReply: number | undefined;
    if (t.speechStoppedAt != null && t.playbackStartedAt != null) {
      e2eReply = roundMs(t.playbackStartedAt - t.speechStoppedAt);
    }

    const turn: TurnLatency = {
      turn: t.turn,
      ...t.recorded,
      total,
      e2eReply,
    };
    this.turns.push(turn);
    this.open = null;

    // Next user utterance starts a new Mic → Speech Detection window.
    this.ensureTurn().awaitingMicEnergy = true;

    this.printTurn(turn);
    this.printSummary();
    this.emit();
  }

  snapshot(): LatencySnapshot {
    const stages = LATENCY_STAGES.map((s) =>
      statsFor(
        s.label,
        this.turns
          .map((t) => t[s.key])
          .filter((v): v is number => typeof v === "number")
      )
    );
    const totals = this.turns.map((t) => t.total);
    return {
      turns: [...this.turns],
      stages,
      totalConversation: statsFor("Total conversation latency", totals),
    };
  }

  /** Rows suitable for UI / console.table (ms). */
  tableRows(): Array<Record<string, string | number>> {
    const snap = this.snapshot();
    const rows = snap.stages.map((s) => ({
      Stage: s.stage,
      Samples: s.samples,
      "Average (ms)": s.average ?? "—",
      "Minimum (ms)": s.minimum ?? "—",
      "Maximum (ms)": s.maximum ?? "—",
    }));
    const t = snap.totalConversation;
    rows.push({
      Stage: t.stage,
      Samples: t.samples,
      "Average (ms)": t.average ?? "—",
      "Minimum (ms)": t.minimum ?? "—",
      "Maximum (ms)": t.maximum ?? "—",
    });
    return rows;
  }

  private printTurn(turn: TurnLatency): void {
    if (!latencyDebugEnabled()) return;
    // eslint-disable-next-line no-console
    console.log(`[voice-latency] turn ${turn.turn}`, turn);
  }

  printSummary(): void {
    if (!latencyDebugEnabled()) return;
    const rows = this.tableRows();
    // eslint-disable-next-line no-console
    console.table(rows);
  }
}

function latencyDebugEnabled(): boolean {
  try {
    return localStorage.getItem("wc_voice_latency_debug") === "1";
  } catch {
    return false;
  }
}
