/// <reference types="vite/client" />

// Extend Vite's environment typings with our custom variables.
// Any variable prefixed with `VITE_` will be exposed to the client
// and replaced at build time.  We rely on VITE_API_BASE_URL so that
// the frontend can talk to a separately‑hosted backend service.

declare interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  // other env variables can go here
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
