function abToBase64(ab: ArrayBuffer): string {
  const bytes = new Uint8Array(ab);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  return btoa(bin);
}

/**
 * Captures the mic and emits base64 PCM16 @ 24 kHz chunks via onChunk.
 * Echo cancellation / noise suppression are on so barge-in works on speakers.
 */
export class MicCapture {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private highpass: BiquadFilterNode | null = null;
  private lowpass: BiquadFilterNode | null = null;
  private muted = false;

  async start(
    onChunk: (base64: string, rms: number, samples: Int16Array) => void
  ): Promise<void> {
    const supported =
      navigator.mediaDevices.getSupportedConstraints() as MediaTrackSupportedConstraints & {
        voiceIsolation?: boolean;
      };
    const audioConstraints: MediaTrackConstraints & {
      voiceIsolation?: boolean;
    } = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000,
    };
    if (supported.voiceIsolation) audioConstraints.voiceIsolation = true;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
    });
    // Capture at the browser/WebRTC production rate. The worklet performs one
    // controlled downsample to Swaram's required PCM16 24 kHz wire format.
    this.ctx = new AudioContext({ sampleRate: 48000 });
    await this.ctx.audioWorklet.addModule("/worklets/recorder.js");
    this.source = this.ctx.createMediaStreamSource(this.stream);
    // Remove fan/vehicle rumble and out-of-band hiss before local VAD + STT.
    this.highpass = this.ctx.createBiquadFilter();
    this.highpass.type = "highpass";
    this.highpass.frequency.value = 85;
    this.highpass.Q.value = 0.7;
    this.lowpass = this.ctx.createBiquadFilter();
    this.lowpass.type = "lowpass";
    this.lowpass.frequency.value = 7600;
    this.lowpass.Q.value = 0.7;
    this.node = new AudioWorkletNode(this.ctx, "recorder-processor");
    this.node.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (this.muted) return;
      const i16 = new Int16Array(e.data);
      let sum = 0;
      for (let i = 0; i < i16.length; i++) {
        const v = i16[i] / 32768;
        sum += v * v;
      }
      const rms = i16.length ? Math.sqrt(sum / i16.length) : 0;
      onChunk(abToBase64(e.data), rms, i16);
    };
    this.source.connect(this.highpass);
    this.highpass.connect(this.lowpass);
    this.lowpass.connect(this.node);
    // connect to destination so the worklet is pulled; it outputs silence.
    this.node.connect(this.ctx.destination);
    // The context is created after an await (outside the click gesture) so it
    // can start suspended — resume it or no audio is ever captured.
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  /** Current AudioContext state (for diagnostics). */
  state(): string {
    return this.ctx?.state ?? "none";
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  async stop(): Promise<void> {
    this.node?.disconnect();
    this.lowpass?.disconnect();
    this.highpass?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.stream = null;
    this.node = null;
    this.source = null;
    this.highpass = null;
    this.lowpass = null;
  }
}
