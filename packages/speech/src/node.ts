/** Node-only PCM helpers — do not import from browser bundles. */

export function pcm16FromBase64(base64: string): Int16Array {
  const buffer = Buffer.from(base64, "base64");
  const length = Math.floor(buffer.byteLength / 2);
  const samples = new Int16Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = buffer.readInt16LE(i * 2);
  }
  return samples;
}
