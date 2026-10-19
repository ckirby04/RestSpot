/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** "local" forces the in-browser development backend even when Supabase is configured. */
  readonly VITE_BACKEND?: string
  /** "true" shows Sign in with Apple (needs an Apple Developer account configured in Supabase). */
  readonly VITE_ENABLE_APPLE_SIGNIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
