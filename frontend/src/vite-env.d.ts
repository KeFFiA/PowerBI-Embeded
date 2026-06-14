/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the embed backend API. Defaults to same-origin "/api". */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
