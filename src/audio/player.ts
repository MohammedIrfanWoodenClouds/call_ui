function base64ToInt16(b64: string): Int16Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Int16Array(bytes.buffer);
}

/**
 * Streaming PCM playback: each TTS delta is scheduled as soon as it arrives.
 * Never waits for a complete utterance — first chunk starts at the audio clock "now".
 */
export class PcmPlayer {
  private ctx: AudioContext;
  private nextTime = 0;
  private sources = new Set<AudioBufferSourceNode>();

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 24000 });
  }

  /** Resume the context inside a user gesture (autoplay policy). */
  async resume(): Promise<void> {
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  /** Current AudioContext state (for diagnostics). */
  state(): string {
    return this.ctx.state;
  }

  /** Milliseconds of audio still queued/playing (so we can wait it out). */
  remainingMs(): number {
    return Math.max(0, (this.nextTime - this.ctx.currentTime) * 1000);
  }

  /**
   * Enqueue one streamed PCM chunk for immediate/back-to-back playback.
   * @returns ms until this chunk becomes audible (audio-clock schedule delay).
   */
  enqueue(b64: string): number {
    const pcm = base64ToInt16(b64);
    if (pcm.length === 0) return 0;
    const buffer = this.ctx.createBuffer(1, pcm.length, 24000);
    const ch = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.ctx.destination);

    const now = this.ctx.currentTime;
    // Preserve every streamed delta. Bursty delivery can legitimately queue
    // seconds of speech; flushing here would cut the current phrase whenever
    // the next chunk arrives. Explicit barge-in/teardown still call flush().
    const start = Math.max(now, this.nextTime);
    src.start(start);
    this.nextTime = start + buffer.duration;

    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
    return Math.max(0, (start - now) * 1000);
  }

  /** Stop all queued/playing audio immediately (barge-in). */
  flush(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources.clear();
    this.nextTime = this.ctx.currentTime;
  }

  async close(): Promise<void> {
    this.flush();
    await this.ctx.close().catch(() => {});
  }
}
