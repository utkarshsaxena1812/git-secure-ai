/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Git Secure-AI backend. Unset → frontend runs on mock data. */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
