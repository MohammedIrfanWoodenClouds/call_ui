import type { Voice } from "../types";
import {
  STREAM_TURN_DETECTION,
  streamTurnDetectionForNumberCollection,
} from "./streamSession";
import { withSwaramEmotion, type Emotion } from "./emotionTags";
import { INPUT_TRANSCRIPTION_CONFIG } from "./speechIntelligence";

export interface SwaramHandlers {
  onStatus?: (status: "connecting" | "ready" | "closed") => void;
  onTutorTurnStart?: () => void;
  onTutorTranscriptDelta?: (delta: string) => void;
  onTutorTurnEnd?: () => void;
  onAudioDelta?: (base64: string) => void;
  onLearnerSpeechStart?: () => void;
  onLearnerSpeechStop?: (event: Record<string, unknown>) => void;
  /** Partial input transcript while STT is still running (if the API emits it). */
  onLearnerTranscriptDelta?: (
    value: string,
    event: Record<string, unknown>
  ) => void;
  /** Final input transcript plus provider confidence metadata when available. */
  onLearnerTranscript?: (
    transcript: string,
    event: Record<string, unknown>
  ) => void;
  /** The model wants to call one of your tools. args is the parsed object. */
  onFunctionCall?: (name: string, callId: string, args: any) => void;
  onError?: (message: string) => void;
}

export interface VoiceTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const WS_BASE = "wss://api.swaram.live/v1/realtime";

/**
 * Thin wrapper over the swaram realtime WebSocket.
 *
 * Streaming duplex path (never buffers a full reply before handing it off):
 *   mic PCM append → server VAD → STT (async, UI only)
 *                ↘ LLM+TTS audio/transcript deltas → onAudioDelta / onTutorTranscriptDelta
 */
export class SwaramSession {
  private ws: WebSocket | null = null;
  private ready = false;
  /** Accumulates streaming tool-arg deltas until `.done`. */
  private toolArgBuf = new Map<string, string>();
  /** Last detected emotion — merged into Swaram payloads when the API supports it. */
  private emotion: Emotion | null = null;
  private numberCollectionActive = false;

  constructor(private handlers: SwaramHandlers) {}

  isReady(): boolean {
    return this.ready && this.ws?.readyState === WebSocket.OPEN;
  }

  /** Store emotion for the next TTS turn; passed to Swaram only if supported. */
  setEmotion(emotion: Emotion | null): void {
    this.emotion = emotion;
  }

  connect(opts: {
    token: string;
    model: string;
    instructions: string;
    voice: Voice;
    tools?: VoiceTool[];
    /** Optional initial emotion metadata (ignored until Swaram supports it). */
    emotion?: Emotion;
  }): void {
    this.ready = false;
    if (opts.emotion) this.emotion = opts.emotion;
    this.handlers.onStatus?.("connecting");
    const url = `${WS_BASE}?model=${encodeURIComponent(opts.model)}`;
    const ws = new WebSocket(url, [
      "realtime",
      "openai-insecure-api-key." + opts.token,
    ]);
    this.ws = ws;

    ws.onopen = () => {
      const session: Record<string, unknown> = withSwaramEmotion(
        {
          instructions: opts.instructions,
          voice: opts.voice,
          input_audio_transcription: { ...INPUT_TRANSCRIPTION_CONFIG },
          turn_detection: { ...STREAM_TURN_DETECTION },
        },
        this.emotion
      );
      if (opts.tools && opts.tools.length) {
        session.tools = opts.tools;
        session.tool_choice = "auto"; // "required" loops — confirmed against the live API
      }
      this.send({ type: "session.update", session });
    };

    ws.onmessage = (ev) => {
      let m: any;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (m.type) {
        case "session.updated":
          this.ready = true;
          this.handlers.onStatus?.("ready");
          break;
        case "input_audio_buffer.speech_started":
          this.handlers.onLearnerSpeechStart?.();
          break;
        case "input_audio_buffer.speech_stopped":
          this.handlers.onLearnerSpeechStop?.(m);
          break;
        case "conversation.item.input_audio_transcription.delta":
          if (m.delta || m.partial || m.transcript) {
            this.handlers.onLearnerTranscriptDelta?.(
              m.transcript ?? m.partial ?? m.delta,
              m
            );
          }
          break;
        case "conversation.item.input_audio_transcription.completed":
          this.handlers.onLearnerTranscript?.(m.transcript ?? "", m);
          break;
        case "conversation.item.input_audio_transcription.failed":
          this.handlers.onLearnerTranscript?.("", {
            ...m,
            confidence: 0,
          });
          break;
        case "response.created":
          this.handlers.onTutorTurnStart?.();
          break;
        case "response.output_audio.delta":
          // Forward each PCM chunk immediately — never wait for response.done.
          if (m.delta) this.handlers.onAudioDelta?.(m.delta);
          break;
        case "response.output_audio_transcript.delta":
          if (m.delta) this.handlers.onTutorTranscriptDelta?.(m.delta);
          break;
        case "response.function_call_arguments.delta": {
          const id = String(m.call_id ?? m.item_id ?? "");
          if (!id || !m.delta) break;
          this.toolArgBuf.set(id, (this.toolArgBuf.get(id) ?? "") + m.delta);
          break;
        }
        case "response.function_call_arguments.done": {
          const id = String(m.call_id ?? "");
          const raw =
            m.arguments ??
            (id ? this.toolArgBuf.get(id) : undefined) ??
            "{}";
          if (id) this.toolArgBuf.delete(id);
          let args: any = {};
          try {
            args = JSON.parse(raw);
          } catch {
            /* leave as {} */
          }
          this.handlers.onFunctionCall?.(m.name, m.call_id, args);
          break;
        }
        case "response.done":
          this.handlers.onTutorTurnEnd?.();
          break;
        case "error":
          this.handlers.onError?.(
            m.error?.message || "An error occurred in the voice session."
          );
          break;
      }
    };

    ws.onerror = () => {
      this.handlers.onError?.("Voice connection error.");
    };
    ws.onclose = () => {
      this.ready = false;
      this.handlers.onStatus?.("closed");
    };
  }

  /** Stream a base64 PCM16 @ 24 kHz chunk of the learner's mic. */
  sendAudio(base64: string): void {
    this.send({ type: "input_audio_buffer.append", audio: base64 });
  }

  /**
   * Return a tool's result and immediately request the next spoken reply.
   * Do not wait for server auto-continue — kick LLM+TTS in the same tick.
   */
  sendToolResult(callId: string, output: unknown): void {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: typeof output === "string" ? output : JSON.stringify(output),
      },
    });
    this.requestResponse();
  }

  /** Ask the model to produce a reply now (used to make it greet first). */
  requestResponse(): void {
    const response = withSwaramEmotion({}, this.emotion);
    if (Object.keys(response).length) {
      this.send({ type: "response.create", response });
    } else {
      this.send({ type: "response.create" });
    }
  }

  /** Explicitly stop the current reply (barge-in). */
  cancel(): void {
    this.send({ type: "response.cancel" });
  }

  /** Inject a mid-call note (e.g. anti-repeat nudge) without speaking it. */
  sendUserNote(text: string): void {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text }],
      },
    });
  }

  /** Update provider endpointing without replacing the rest of the session. */
  setNumberCollectionMode(active: boolean): void {
    if (this.numberCollectionActive === active) return;
    this.numberCollectionActive = active;
    this.send({
      type: "session.update",
      session: {
        turn_detection: streamTurnDetectionForNumberCollection(active),
      },
    });
  }

  private send(obj: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  close(): void {
    this.toolArgBuf.clear();
    this.numberCollectionActive = false;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
    this.ready = false;
  }
}
