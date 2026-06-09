/// <reference types="vite/client" />

/**
 * Project-specific `import.meta.env` extensions.
 *
 * Vite's default `ImportMetaEnv` only types the built-in `MODE`, `BASE_URL`,
 * `PROD`, `DEV`, `SSR` fields. Anything we inject via `define` in
 * `vite.config.ts` or that ships through a `VITE_` prefix needs to be
 * declared here so TS components don't fall through `Property 'env' does
 * not exist on type 'ImportMeta'`.
 *
 * Keep this list in sync with `vite.config.ts > define` and the contents of
 * `.env.example`.
 */
interface ImportMetaEnv {
  /** Anthropic API key — injected via `vite.config.ts > define`. */
  readonly ANTHROPIC_API_KEY?: string;
  /** Google GenAI key — injected via `vite.config.ts > define`. */
  readonly GEMINI_API_KEY?: string;
  /** OpenAI key — injected via `vite.config.ts > define`. */
  readonly OPENAI_API_KEY?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_ENABLED?: string;
  readonly VITE_ENABLE_DEV_TOOLS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
