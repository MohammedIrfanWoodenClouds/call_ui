/**
 * Shared realtime session knobs for a fully streaming voice path:
 * mic chunks → server VAD → (STT // LLM+TTS deltas) → immediate playback.
 * Nothing in the client waits for a complete STT/LLM/TTS payload.
 */

/**
 * Provider VAD runs after the local adaptive speech gate. The longer silence
 * window avoids splitting Malayalam phrases and spoken phone digits.
 */
export const STREAM_TURN_DETECTION = {
  type: "server_vad" as const,
  threshold: 0.65,
  prefix_padding_ms: 300,
  silence_duration_ms: 750,
};

export const NUMBER_COLLECTION_SILENCE_DURATION_MS = 900;

export function streamTurnDetectionForNumberCollection(active: boolean) {
  return {
    ...STREAM_TURN_DETECTION,
    silence_duration_ms: active
      ? NUMBER_COLLECTION_SILENCE_DURATION_MS
      : STREAM_TURN_DETECTION.silence_duration_ms,
  };
}

export const STREAM_MODEL = "mal-realtime-simple";
