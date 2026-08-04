/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  /** PCM RMS floor below which local VAD ignores microphone input. */
  readonly VITE_MIC_RMS_THRESHOLD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
