/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the WUD backend API, no trailing slash (e.g. https://api.wud.app). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** App version, injected at build time by Vite from package.json. */
declare const __APP_VERSION__: string;
