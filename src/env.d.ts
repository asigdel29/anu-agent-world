/// <reference types="vite/client" />

/**
 * Environment the client is built with.
 *
 * Declared rather than read loosely, so a missing variable is a compile-time
 * `undefined` that the code must handle instead of an `any` that flows
 * silently into a URL.
 */
interface ImportMetaEnv {
  /**
   * Host of the relay, without a scheme. Absent means solo, which is a
   * supported mode rather than a misconfiguration.
   */
  readonly VITE_RELAY_HOST?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
