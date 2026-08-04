import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, Voice } from "../types";
import { getSwaramToken } from "./api";
import { apiUrl } from "./apiBase";
import { SwaramSession, type VoiceTool } from "./swaramClient";
import { MicCapture } from "../audio/micCapture";
import { PcmPlayer } from "../audio/player";
import {
  VoiceLatencyTracker,
  type LatencySnapshot,
} from "./voiceLatency";
import { STREAM_MODEL } from "./streamSession";
import type { ConversationStateManager } from "./conversationState";
import { prepareEmotionForTts } from "./emotionTags";
import {
  AdaptiveSpeechGate,
  NumberCollectionMode,
  SpeechPipeline,
  TranscriptStabilizer,
  type AcousticTurnMetrics,
  type NumberCollectionTransition,
  type TranscriptAssessment,
} from "./speechIntelligence";
import {
  scheduleIntelligencePostCall,
  scheduleIntelligenceTurn,
} from "./intelligenceApi";

let _id = 0;
const nextId = () => `m${++_id}`;
const configuredMicRms = Number(
  import.meta.env.VITE_MIC_RMS_THRESHOLD ?? "0.006"
);
const MIC_RMS_THRESHOLD =
  Number.isFinite(configuredMicRms) && configuredMicRms > 0
    ? Math.min(0.1, configuredMicRms)
    : 0.006;
const PRODUCTION_AUDIO_LOG_TYPES = new Set([
  "mic.level",
  "vad.triggered",
  "speech.turn",
  "speech.rejected",
  "speech.echo.discarded",
  "speech.echo.response_cancelled",
  "speech.transcript.discarded",
]);

export interface StartOpts {
  instructions: string;
  voice: Voice;
  tools?: VoiceTool[];
  /** Have the agent speak first (greet) instead of waiting for the user. */
  greet?: boolean;
  /** When set, the full conversation is logged to the server tagged with this name. */
  demo?: string;
  /** Per-session dialogue tracker (topic, intent, anti-repeat, etc.). */
  conversation?: ConversationStateManager;
  /** Called when the model invokes a tool. Do the work, then call reply(result). */
  onFunctionCall?: (
    name: string,
    args: any,
    reply: (output: unknown) => void
  ) => void;
}

/**
 * Streaming voice session: mic → Swaram → TTS deltas → playback.
 * STT / LLM transcript / audio all advance on deltas — nothing waits for a
 * complete response before the next stage starts.
 */
export function useVoiceSession() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("idle");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [learnerSpeaking, setLearnerSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [latency, setLatency] = useState<LatencySnapshot>(() =>
    new VoiceLatencyTracker().snapshot()
  );

  const sessionRef = useRef<SwaramSession | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const agentMsgRef = useRef<string | null>(null);
  const learnerMsgRef = useRef<string | null>(null);
  const agentSpeakingRef = useRef(false);
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const greetRef = useRef(false); // one-shot: make the agent speak first
  const sessionIdRef = useRef<string>("");
  const demoRef = useRef<string | null>(null);
  const agentTurnTextRef = useRef("");
  const startingRef = useRef(false); // block double Start while connecting
  const latencyRef = useRef(new VoiceLatencyTracker());
  const latencyUnsubRef = useRef<(() => void) | null>(null);
  const firstAudioOfReplyRef = useRef(true);
  const conversationRef = useRef<ConversationStateManager | null>(null);
  const speechGateRef = useRef(
    new AdaptiveSpeechGate<string>({
      sampleRate: 24000,
      minimumRms: MIC_RMS_THRESHOLD,
    })
  );
  const numberCollectionRef = useRef(new NumberCollectionMode());
  const pendingAcousticsRef = useRef<AcousticTurnMetrics[]>([]);
  const acousticsByItemRef = useRef(new Map<string, AcousticTurnMetrics>());
  const lowConfidenceTurnRef = useRef(false);
  const transcriptStabilizerRef = useRef(new TranscriptStabilizer());
  const speechPipelineRef = useRef(new SpeechPipeline());
  const falseTriggerCountRef = useRef(0);
  const lastVadTriggerReasonRef = useRef("not_triggered");
  const lastMicLevelLogAtRef = useRef(0);
  const lowRmsFrameCountRef = useRef(0);
  const echoDetectionCountRef = useRef(0);
  const discardedTranscriptCountRef = useRef(0);
  const recentAssistantSpeechRef = useRef<
    Array<{ text: string; recordedAt: number }>
  >([]);
  const suppressEchoResponseRef = useRef(false);
  const discardNextResponseUntilRef = useRef(0);
  /** Pause telemetry posts after API/proxy failures so the console is not flooded. */
  const logBackoffUntilRef = useRef(0);

  /** Speech telemetry is always logged; other conversation logs remain demo-only. */
  const logEvent = useCallback((type: string, data: Record<string, unknown>) => {
    const isSpeechTelemetry = PRODUCTION_AUDIO_LOG_TYPES.has(type);
    if (!demoRef.current && !isSpeechTelemetry) return;
    if (Date.now() < logBackoffUntilRef.current) return;
    fetch(apiUrl("/api/log"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        demo: demoRef.current ?? "production-audio",
        ts: new Date().toISOString(),
        type,
        ...data,
      }),
    })
      .then((response) => {
        if (!response.ok) logBackoffUntilRef.current = Date.now() + 5_000;
      })
      .catch(() => {
        logBackoffUntilRef.current = Date.now() + 5_000;
      });
  }, []);

  const handleNumberCollectionTransition = useCallback(
    (transition: NumberCollectionTransition | undefined) => {
      if (!transition) return;
      if (transition === "entered" || transition === "confirmed") {
        sessionRef.current?.setNumberCollectionMode(transition === "entered");
      }
      const snapshot = numberCollectionRef.current.snapshot();
      logEvent("number_collection.mode", {
        transition,
        active: snapshot.active,
        stage: snapshot.stage,
        digitCount: snapshot.candidate.length,
      });
    },
    [logEvent]
  );

  const clearDrainTimer = useCallback(() => {
    if (drainTimerRef.current) {
      clearTimeout(drainTimerRef.current);
      drainTimerRef.current = null;
    }
  }, []);

  const rememberAssistantSpeech = useCallback((text: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    const now = Date.now();
    const recent = recentAssistantSpeechRef.current.filter(
      (entry) => now - entry.recordedAt <= 10_000
    );
    const last = recent[recent.length - 1];
    if (last?.text === normalized) last.recordedAt = now;
    else recent.push({ text: normalized, recordedAt: now });
    recentAssistantSpeechRef.current = recent;
  }, []);

  const appendAgentDelta = useCallback((delta: string) => {
    agentTurnTextRef.current += delta;
    setMessages((prev) => {
      const id = agentMsgRef.current;
      if (id && prev.some((m) => m.id === id)) {
        return prev.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m));
      }
      const nid = nextId();
      agentMsgRef.current = nid;
      return [...prev, { id: nid, role: "tutor", text: delta, streaming: true }];
    });
  }, []);

  /** Open a streaming learner bubble as soon as speech is detected (before STT finishes). */
  const beginLearnerStream = useCallback(() => {
    setMessages((prev) => {
      // Drop a prior empty streaming bubble if STT never arrived.
      const cleaned = prev.filter(
        (m) => !(m.id === learnerMsgRef.current && m.streaming && !m.text.trim())
      );
      const nid = nextId();
      learnerMsgRef.current = nid;
      return [...cleaned, { id: nid, role: "learner", text: "", streaming: true }];
    });
  }, []);

  /** Only expose a partial after two nearly-identical observations. */
  const showStableLearnerPartial = useCallback((partial: string) => {
    setMessages((prev) => {
      const id = learnerMsgRef.current;
      if (id && prev.some((m) => m.id === id)) {
        return prev.map((m) =>
          m.id === id ? { ...m, text: partial, streaming: true } : m
        );
      }
      const nid = nextId();
      learnerMsgRef.current = nid;
      return [
        ...prev,
        { id: nid, role: "learner", text: partial, streaming: true },
      ];
    });
  }, []);

  const finalizeLearnerTranscript = useCallback(
    (t: string, assessment: TranscriptAssessment) => {
      const text = t.trim();
      logEvent("speech.turn", {
        transcript: text,
        partialTranscript: assessment.partialTranscript,
        finalTranscript: assessment.finalTranscript,
        rawTranscript: assessment.rawTranscript,
        transcriptStable: assessment.transcriptStable,
        transcriptStabilityScore: assessment.transcriptStabilityScore,
        speechConfidence: assessment.speechConfidence,
        backgroundNoiseLevel: assessment.backgroundNoiseLevel,
        backgroundNoiseDbfs: assessment.backgroundNoiseDbfs,
        micRms: assessment.micRms,
        noiseRms: assessment.noiseRms,
        vadTriggerReason: assessment.vadTriggerReason,
        falseTriggerCount: assessment.falseTriggerCount,
        echoDetectionCount: echoDetectionCountRef.current,
        discardedTranscriptCount: discardedTranscriptCountRef.current,
        speechDurationMs: assessment.speechDurationMs,
        transcriptConfidence: assessment.transcriptConfidence,
        transcriptConfidenceScore: assessment.transcriptConfidenceScore,
        providerConfidence: assessment.providerConfidence,
        speakerDominance: assessment.speakerDominance,
        correctionsApplied: assessment.correctionsApplied,
        correctionCandidates: assessment.correctionCandidates,
        criticalFields: assessment.criticalFields,
        shouldRetry: assessment.shouldRetry,
        reasons: assessment.reasons,
      });
      if (text) {
        logEvent("user.said", {
          text,
          transcriptConfidence: assessment.transcriptConfidence,
        });
      }
      setMessages((prev) => {
        const id = learnerMsgRef.current;
        if (id && prev.some((m) => m.id === id)) {
          if (!text) {
            // Remove empty placeholder when STT had nothing.
            return prev.filter((m) => m.id !== id);
          }
          return prev.map((m) =>
            m.id === id
              ? {
                  ...m,
                  text,
                  streaming: false,
                  confidence: assessment.transcriptConfidence,
                }
              : m
          );
        }
        if (!text) return prev;
        return [
          ...prev,
          {
            id: nextId(),
            role: "learner",
            text,
            confidence: assessment.transcriptConfidence,
          },
        ];
      });
      learnerMsgRef.current = null;
    },
    [logEvent]
  );

  const buildIntelligencePayload = useCallback(
    (extra?: {
      lastCallerText?: string;
      lastAssistantText?: string;
      transcriptConfidence?: "High" | "Medium" | "Low";
    }) => {
      const snap = conversationRef.current?.snapshot();
      return {
        sessionId: sessionIdRef.current || "browser",
        phase: snap?.phase,
        customerIntent: snap?.customerIntent,
        pendingTasks: snap?.pendingTasks,
        confirmationState: snap?.confirmation,
        enquiry: snap?.enquiry,
        recentAssistantUtterances: snap?.recentAgentUtterances,
        lastCallerText: extra?.lastCallerText,
        lastAssistantText:
          extra?.lastAssistantText ??
          (agentTurnTextRef.current.trim() || undefined),
        transcriptConfidence: extra?.transcriptConfidence,
        interruptionCount: snap?.interruptionCount,
      };
    },
    []
  );

  const teardown = useCallback(async () => {
    clearDrainTimer();
    latencyUnsubRef.current?.();
    latencyUnsubRef.current = null;
    await micRef.current?.stop();
    micRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    speechGateRef.current.reset();
    numberCollectionRef.current.reset();
    pendingAcousticsRef.current = [];
    acousticsByItemRef.current.clear();
    lowConfidenceTurnRef.current = false;
    transcriptStabilizerRef.current.reset();
    falseTriggerCountRef.current = 0;
    lastVadTriggerReasonRef.current = "not_triggered";
    lastMicLevelLogAtRef.current = 0;
    lowRmsFrameCountRef.current = 0;
    echoDetectionCountRef.current = 0;
    discardedTranscriptCountRef.current = 0;
    recentAssistantSpeechRef.current = [];
    suppressEchoResponseRef.current = false;
    discardNextResponseUntilRef.current = 0;
    await playerRef.current?.close();
    playerRef.current = null;
    setAgentSpeaking(false);
    agentSpeakingRef.current = false;
    setLearnerSpeaking(false);
    setActive(false);
  }, [clearDrainTimer]);

  const end = useCallback(async () => {
    latencyRef.current.printSummary();
    logEvent("latency.summary", {
      rows: latencyRef.current.tableRows(),
      turns: latencyRef.current.snapshot().turns,
    });
    logEvent("session.end", {});
    // Fire-and-forget post-call Groq pack — does not delay hangup UX.
    scheduleIntelligencePostCall(buildIntelligencePayload());
    await teardown();
  }, [teardown, logEvent, buildIntelligencePayload]);

  const start = useCallback(
    async (opts: StartOpts) => {
      // Only one session at a time — overlapping WS + players = two voices.
      if (startingRef.current) return;
      startingRef.current = true;
      await teardown();

      setError(null);
      setMessages([]);
      setStatus("connecting");
      greetRef.current = !!opts.greet;
      demoRef.current = opts.demo ?? null;
      conversationRef.current = opts.conversation ?? null;
      opts.conversation?.reset();
      sessionIdRef.current =
        globalThis.crypto?.randomUUID?.() ?? String(Date.now());
      agentTurnTextRef.current = "";
      agentMsgRef.current = null;
      learnerMsgRef.current = null;
      firstAudioOfReplyRef.current = true;
      speechGateRef.current.reset();
      numberCollectionRef.current.reset();
      pendingAcousticsRef.current = [];
      acousticsByItemRef.current.clear();
      lowConfidenceTurnRef.current = false;
      transcriptStabilizerRef.current.reset();
      falseTriggerCountRef.current = 0;
      lastVadTriggerReasonRef.current = "not_triggered";
      lastMicLevelLogAtRef.current = 0;
      lowRmsFrameCountRef.current = 0;
      echoDetectionCountRef.current = 0;
      discardedTranscriptCountRef.current = 0;
      recentAssistantSpeechRef.current = [];
      suppressEchoResponseRef.current = false;
      discardNextResponseUntilRef.current = 0;
      logBackoffUntilRef.current = 0;
      latencyUnsubRef.current?.();
      latencyRef.current = new VoiceLatencyTracker();
      latencyUnsubRef.current = latencyRef.current.subscribe(setLatency);
      logEvent("session.start", {
        voice: opts.voice,
        micRmsThreshold: MIC_RMS_THRESHOLD,
        assistantSpeechMicRmsThreshold: MIC_RMS_THRESHOLD * 1.8,
        assistantSpeechMinSnrDb: 10,
        echoSimilarityThreshold: 0.9,
        echoComparisonWindowMs: 10_000,
      });
      try {
        // Overlap AudioContext resume with token mint — independent I/O.
        const player = new PcmPlayer();
        playerRef.current = player;
        const [{ token }] = await Promise.all([
          getSwaramToken({ session: { model: STREAM_MODEL } }),
          player.resume(),
        ]);

        // Buffer uplink until the realtime session is ready (same idea as phone bridge).
        const pendingUplink: string[] = [];
        // Preserve the speech gate's pre-roll if the caller starts during connect.
        const MAX_PENDING = 80;

        const session = new SwaramSession({
          onStatus: (s) => {
            setStatus(s);
            if (s === "ready") {
              for (const a of pendingUplink) sessionRef.current?.sendAudio(a);
              pendingUplink.length = 0;
              if (greetRef.current) {
                greetRef.current = false;
                conversationRef.current?.markGreetingStarted();
                sessionRef.current?.requestResponse();
              }
            }
          },
          onTutorTurnStart: () => {
            clearDrainTimer();
            if (discardNextResponseUntilRef.current >= Date.now()) {
              discardNextResponseUntilRef.current = 0;
              suppressEchoResponseRef.current = true;
              sessionRef.current?.cancel();
              logEvent("speech.echo.response_cancelled", {
                echoDetectionCount: echoDetectionCountRef.current,
                discardedTranscriptCount: discardedTranscriptCountRef.current,
              });
              return;
            }
            suppressEchoResponseRef.current = false;
            setAgentSpeaking(true);
            agentSpeakingRef.current = true;
            agentMsgRef.current = null;
            agentTurnTextRef.current = "";
            firstAudioOfReplyRef.current = true;
            // LLM+TTS start as soon as VAD ends — independent of STT completion.
            latencyRef.current.onLlmStarted();
          },
          onTutorTranscriptDelta: (delta) => {
            if (suppressEchoResponseRef.current) return;
            appendAgentDelta(delta);
            conversationRef.current?.notePartialAgent(agentTurnTextRef.current);
            handleNumberCollectionTransition(
              numberCollectionRef.current.observeAssistantUtterance(
                agentTurnTextRef.current
              )
            );
          },
          onTutorTurnEnd: () => {
            if (suppressEchoResponseRef.current) {
              suppressEchoResponseRef.current = false;
              discardNextResponseUntilRef.current = 0;
              agentTurnTextRef.current = "";
              agentMsgRef.current = null;
              setAgentSpeaking(false);
              agentSpeakingRef.current = false;
              firstAudioOfReplyRef.current = true;
              return;
            }
            const turn = agentTurnTextRef.current.trim();
            if (turn) {
              const prepared = prepareEmotionForTts(turn);
              const repeat = conversationRef.current?.recordAgentUtterance(
                prepared.speakableText
              );
              handleNumberCollectionTransition(
                numberCollectionRef.current.observeAssistantUtterance(
                  prepared.speakableText
                )
              );
              logEvent("agent.said", {
                text: prepared.speakableText,
                emotion: prepared.emotion,
                phase: conversationRef.current?.getPhase(),
                isRepeat: repeat?.isRepeat ?? false,
              });
              rememberAssistantSpeech(prepared.speakableText);
              if (repeat?.isRepeat && sessionRef.current) {
                sessionRef.current.sendUserNote(
                  "[system] Your last reply was too similar to an earlier one. " +
                    "Next spoken turn MUST use a different opener and wording. " +
                    (conversationRef.current?.toPromptSection() ?? "")
                );
              }
            }
            agentTurnTextRef.current = "";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgRef.current ? { ...m, streaming: false } : m
              )
            );
            agentMsgRef.current = null;
            clearDrainTimer();
            // Keep UI "speaking" until queued audio drains (small fudge for clock skew).
            const wait = (playerRef.current?.remainingMs() ?? 0) + 40;
            drainTimerRef.current = setTimeout(() => {
              setAgentSpeaking(false);
              agentSpeakingRef.current = false;
              drainTimerRef.current = null;
            }, wait);
          },
          onAudioDelta: (b64) => {
            if (suppressEchoResponseRef.current) return;
            // Play each TTS chunk immediately — do not buffer the full reply.
            const isFirst = firstAudioOfReplyRef.current;
            if (isFirst) {
              firstAudioOfReplyRef.current = false;
              latencyRef.current.onTtsFirstDelta();
            }
            const delayMs = playerRef.current?.enqueue(b64) ?? 0;
            if (isFirst) latencyRef.current.onPlaybackScheduled(delayMs);
          },
          onLearnerSpeechStart: () => {
            // Full-duplex barge-in: stop local playback and cancel the model reply.
            clearDrainTimer();
            transcriptStabilizerRef.current.reset();
            setLearnerSpeaking(true);
            playerRef.current?.flush();
            if (agentSpeakingRef.current) {
              rememberAssistantSpeech(agentTurnTextRef.current);
              conversationRef.current?.recordInterruption(agentTurnTextRef.current);
              latencyRef.current.cancelInFlightReply();
              sessionRef.current?.cancel();
            }
            setAgentSpeaking(false);
            agentSpeakingRef.current = false;
            firstAudioOfReplyRef.current = true;
            latencyRef.current.onSpeechStarted();
            beginLearnerStream();
          },
          onLearnerSpeechStop: (event) => {
            setLearnerSpeaking(false);
            latencyRef.current.onSpeechStopped();
            const acoustics = speechGateRef.current.finishTurn();
            const itemId = String(event.item_id ?? "");
            if (itemId) acousticsByItemRef.current.set(itemId, acoustics);
            else pendingAcousticsRef.current.push(acoustics);
          },
          onLearnerTranscriptDelta: (value, event) => {
            const isFullSnapshot =
              typeof event.transcript === "string" ||
              typeof event.partial === "string";
            const observation = isFullSnapshot
              ? transcriptStabilizerRef.current.ingestPartial(value)
              : transcriptStabilizerRef.current.ingestDelta(value);
            const noiseDbfs = speechGateRef.current.currentNoiseDbfs();
            logEvent("speech.partial", {
              partialTranscript: observation.partialTranscript,
              stable: observation.stable,
              similarity: observation.similarity,
              consecutiveMatches: observation.consecutiveMatches,
              noiseLevel:
                noiseDbfs <= -43
                  ? "Low"
                  : noiseDbfs <= -31
                    ? "Medium"
                    : "High",
              noiseDbfs,
              vadTriggerReason: lastVadTriggerReasonRef.current,
              falseTriggerCount: falseTriggerCountRef.current,
            });
            if (observation.stable) {
              showStableLearnerPartial(observation.partialTranscript);
            }
          },
          onLearnerTranscript: (t, event) => {
            latencyRef.current.onSttCompleted();
            const snapshot = conversationRef.current?.snapshot();
            const stability = transcriptStabilizerRef.current.finalize(t);
            const itemId = String(event.item_id ?? "");
            const acoustics =
              acousticsByItemRef.current.get(itemId) ??
              pendingAcousticsRef.current.shift();
            recentAssistantSpeechRef.current =
              recentAssistantSpeechRef.current.filter(
                (entry) => Date.now() - entry.recordedAt <= 10_000
              );
            const turn = speechPipelineRef.current.finalizeTurn({
              rawTranscript: stability.finalTranscript,
              event,
              acoustics,
              phase: snapshot?.phase,
              confirmationState: snapshot?.confirmation,
              numberCollection: numberCollectionRef.current.snapshot(),
              stability,
              falseTriggerCount: falseTriggerCountRef.current,
              vadTriggerReason: lastVadTriggerReasonRef.current,
              recentAssistant: recentAssistantSpeechRef.current,
              currentAssistantText: agentTurnTextRef.current,
            });
            if (turn.echo?.isEcho) {
              acousticsByItemRef.current.delete(itemId);
              echoDetectionCountRef.current++;
              discardedTranscriptCountRef.current++;
              falseTriggerCountRef.current++;
              lowConfidenceTurnRef.current = true;
              const responseAlreadyActive = agentSpeakingRef.current;
              suppressEchoResponseRef.current = responseAlreadyActive;
              discardNextResponseUntilRef.current = responseAlreadyActive
                ? 0
                : Date.now() + 3_000;
              if (responseAlreadyActive) sessionRef.current?.cancel();
              playerRef.current?.flush();
              latencyRef.current.cancelInFlightReply();
              setAgentSpeaking(false);
              agentSpeakingRef.current = false;
              const learnerMessageId = learnerMsgRef.current;
              setMessages((prev) =>
                learnerMessageId
                  ? prev.filter((message) => message.id !== learnerMessageId)
                  : prev
              );
              learnerMsgRef.current = null;
              logEvent("speech.echo.discarded", {
                discardedTranscript: turn.rawText,
                matchedAssistantText: turn.echo.matchedAssistantText,
                similarity: Math.round(turn.echo.similarity * 1_000) / 1_000,
                comparisonWindowMs: 10_000,
                micRms: acoustics?.micRms ?? 0,
                noiseRms:
                  acoustics?.noiseRms ??
                  speechGateRef.current.currentNoiseRms(),
                echoDetectionCount: echoDetectionCountRef.current,
                falseTriggerCount: falseTriggerCountRef.current,
                discardedTranscriptCount: discardedTranscriptCountRef.current,
                reason: "recent_assistant_transcript_similarity_above_90_percent",
              });
              return;
            }
            const assessment = turn.assessment;
            acousticsByItemRef.current.delete(itemId);
            lowConfidenceTurnRef.current = turn.shouldRetry;
            if (turn.shouldRetry) {
              discardedTranscriptCountRef.current++;
              logEvent("speech.transcript.discarded", {
                discardedTranscript: turn.rawText,
                reason: "low_transcript_confidence",
                transcriptConfidence: assessment.transcriptConfidence,
                transcriptConfidenceScore:
                  assessment.transcriptConfidenceScore,
                micRms: assessment.micRms,
                noiseRms: assessment.noiseRms,
                falseTriggerCount: falseTriggerCountRef.current,
                discardedTranscriptCount: discardedTranscriptCountRef.current,
              });
            }

            // ConversationState receives stabilized text only — never raw STT.
            if (!turn.discard && turn.text.trim()) {
              conversationRef.current?.recordCallerUtterance(turn.text);
              handleNumberCollectionTransition(
                numberCollectionRef.current.observeCallerUtterance(turn.text)
              );
              // Async Groq intelligence — never awaited on the speech path.
              scheduleIntelligenceTurn(
                buildIntelligencePayload({
                  lastCallerText: turn.text,
                  transcriptConfidence: assessment.transcriptConfidence,
                })
              );
            }
            if (turn.controlNote) {
              sessionRef.current?.sendUserNote(turn.controlNote);
            }
            finalizeLearnerTranscript(
              turn.text || turn.rawText,
              assessment
            );
          },
          onFunctionCall: (name, callId, args) => {
            if (
              numberCollectionRef.current.blocksPhonePersistence(name, args)
            ) {
              logEvent("tool.blocked.number_confirmation", { name });
              sessionRef.current?.sendToolResult(callId, {
                ok: false,
                number_confirmation_required: true,
                error:
                  "Do not save the number yet. Read back the normalized digits and wait for the caller's explicit confirmation.",
              });
              return;
            }
            if (lowConfidenceTurnRef.current) {
              logEvent("tool.blocked.low_confidence", { name });
              sessionRef.current?.sendToolResult(callId, {
                ok: false,
                speech_retry_required: true,
                error:
                  "The caller transcript was Low confidence. No data was trusted or saved. Ask the caller to repeat slowly.",
              });
              return;
            }
            logEvent("tool.call", { name, args });
            opts.onFunctionCall?.(name, args, (output) => {
              logEvent("tool.result", { name, output });
              if (name === "book_appointment" && (output as any)?.ok) {
                logEvent("booking.made", { booking: (output as any).booking });
              }
              // Reply as soon as the tool finishes so TTS can resume streaming.
              sessionRef.current?.sendToolResult(callId, output);
            });
          },
          onError: (msg) => {
            logEvent("error", { message: msg });
            setError(msg);
          },
        });
        sessionRef.current = session;
        session.connect({
          token,
          model: STREAM_MODEL,
          instructions: opts.instructions,
          voice: opts.voice,
          tools: opts.tools,
        });

        // Start mic while the WebSocket handshake / session.update runs (parallel).
        const mic = new MicCapture();
        micRef.current = mic;
        await mic.start((b64, rms, samples) => {
          latencyRef.current.onMicChunk(rms);
          if (rms < MIC_RMS_THRESHOLD) lowRmsFrameCountRef.current++;
          const now = Date.now();
          if (now - lastMicLevelLogAtRef.current >= 1000) {
            lastMicLevelLogAtRef.current = now;
            logEvent("mic.level", {
              micRms: Math.round(rms * 1_000_000) / 1_000_000,
              noiseRms: speechGateRef.current.currentNoiseRms(),
              micRmsThreshold: MIC_RMS_THRESHOLD,
              belowThreshold: rms < MIC_RMS_THRESHOLD,
              lowRmsFrameCount: lowRmsFrameCountRef.current,
              assistantSpeaking: agentSpeakingRef.current,
              echoDetectionCount: echoDetectionCountRef.current,
              falseTriggerCount: falseTriggerCountRef.current,
            });
          }
          const mode = numberCollectionRef.current.isCollectingDigits()
            ? "digits"
            : "normal";
          const gated = speechGateRef.current.process(
            samples,
            b64,
            mode,
            agentSpeakingRef.current ? "assistant_speaking" : "normal"
          );
          if (gated.rejected) {
            falseTriggerCountRef.current++;
            logEvent("speech.rejected", {
              speechConfidence: "Low",
              backgroundNoiseLevel: "High",
              speechDurationMs: gated.rejected.durationMs,
              transcriptConfidence: "Low",
              partialTranscript: "",
              finalTranscript: "",
              micRms: Math.round(rms * 1_000_000) / 1_000_000,
              noiseRms: speechGateRef.current.currentNoiseRms(),
              vadTriggerReason: gated.rejected.reason,
              falseTriggerCount: falseTriggerCountRef.current,
              discardedTranscriptCount: discardedTranscriptCountRef.current,
              correctionsApplied: [],
              reason: gated.rejected.reason,
            });
          }
          if (gated.started) {
            lastVadTriggerReasonRef.current =
              gated.triggerReason ?? "continuous_human_speech";
            logEvent("vad.triggered", {
              vadTriggerReason: lastVadTriggerReasonRef.current,
              micRms: Math.round(rms * 1_000_000) / 1_000_000,
              noiseRms: speechGateRef.current.currentNoiseRms(),
              noiseDbfs: speechGateRef.current.currentNoiseDbfs(),
              micRmsThreshold: MIC_RMS_THRESHOLD,
              assistantSpeaking: agentSpeakingRef.current,
              falseTriggerCount: falseTriggerCountRef.current,
            });
          }
          for (const audio of gated.forward) {
            if (sessionRef.current?.isReady()) {
              sessionRef.current.sendAudio(audio);
            } else {
              pendingUplink.push(audio);
              if (pendingUplink.length > MAX_PENDING) pendingUplink.shift();
            }
          }
        });

        setMuted(false);
        setActive(true);
      } catch (e: any) {
        setError(e.message || "Could not start the session.");
        setStatus("idle");
        await teardown();
      } finally {
        startingRef.current = false;
      }
    },
    [
      appendAgentDelta,
      showStableLearnerPartial,
      beginLearnerStream,
      finalizeLearnerTranscript,
      rememberAssistantSpeech,
      handleNumberCollectionTransition,
      buildIntelligencePayload,
      clearDrainTimer,
      logEvent,
      teardown,
    ]
  );

  useEffect(
    () => () => {
      if (drainTimerRef.current) clearTimeout(drainTimerRef.current);
      micRef.current?.stop();
      sessionRef.current?.close();
      playerRef.current?.close();
    },
    []
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const nm = !m;
      micRef.current?.setMuted(nm);
      return nm;
    });
  }, []);

  const interrupt = useCallback(() => {
    if (!agentSpeakingRef.current) return;
    conversationRef.current?.recordInterruption(agentTurnTextRef.current);
    clearDrainTimer();
    playerRef.current?.flush();
    latencyRef.current.cancelInFlightReply();
    sessionRef.current?.cancel();
    setAgentSpeaking(false);
    agentSpeakingRef.current = false;
    firstAudioOfReplyRef.current = true;
  }, [clearDrainTimer]);

  return {
    messages,
    status,
    agentSpeaking,
    learnerSpeaking,
    muted,
    error,
    active,
    latency,
    start,
    end,
    interrupt,
    toggleMute,
  };
}

