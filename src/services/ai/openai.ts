import OpenAI from "openai";

/**
 * OpenAI / GPT client — third provider in the OCR rotation, alongside
 * Anthropic (Claude) and Google (Gemini). Available for the bench page
 * and (eventually) the per-page OCR pass.
 *
 * ⚠️ SECURITY — same caveat as the other providers: the key is exposed in
 * the client bundle (Phase 0.5 arrangement). Phase 5 moves model calls
 * behind a server proxy.
 *
 * Key environment notes:
 *  - OPENAI_API_KEY is optional. If unset, callers must surface a clear
 *    "OpenAI not configured" message rather than crashing.
 *  - SDK target: openai@6.x which supports both the legacy
 *    `chat.completions.create` AND the newer `responses.create` API.
 *    We use chat.completions because every GPT-4/5 family model supports
 *    it with vision + JSON schema, and the schema accepts our existing
 *    OCR_PAGE_SCHEMA shape with one tweak (strict mode requires
 *    `additionalProperties: false` everywhere, which our schema already has).
 */

const apiKey = process.env.OPENAI_API_KEY;

let _client: OpenAI | null = null;

export const getOpenAIClient = (): OpenAI => {
  if (_client) return _client;
  if (!apiKey) {
    throw new Error(
      "[openai] OPENAI_API_KEY is not set. Add it to .env.local to enable the GPT family.",
    );
  }
  _client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  return _client;
};

/** True when an OpenAI key is configured. Use this to gate UI affordances. */
export const isOpenAIAvailable = (): boolean => Boolean(apiKey);

/**
 * Model family. As of 2026-05 OpenAI's current vision-capable lineup is:
 *
 *   ─ GPT-5.5 series (current flagship — released 2026-04-23) ───────
 *   - GPT_5_5_PRO   — highest accuracy variant; $30 / $180 per 1M.
 *   - GPT_5_5       — flagship; $5 / $30 per 1M, 1M context window.
 *
 *   ─ GPT-5.2 / 5 series (still actively useful) ────────────────────
 *   - GPT_5_2       — 5.5의 직전 마이너. 비전 + JSON 안정.
 *   - GPT_5         — original GPT-5; strong reasoning + vision.
 *   - GPT_5_MINI    — distilled; cheaper, still vision-capable.
 *   - GPT_5_NANO    — ultra-cheap; vision works but rough on dense pages.
 *
 *   ─ GPT-4.1 series (general-purpose, stable) ──────────────────────
 *   - GPT_4_1       — strong vision + cheaper than gpt-5.
 *   - GPT_4_1_MINI  — light + vision.
 *
 *   ─ GPT-4o series (legacy, very stable) ──────────────────────────
 *   - GPT_4O        — older but rock-solid for OCR.
 *   - GPT_4O_MINI   — cheap, fast, decent vision.
 *
 *   ─ o-series (reasoning, vision) ─────────────────────────────────
 *   - O3            — reasoning model; very accurate on hard figures
 *                      but slow. Vision-capable.
 *   - O4_MINI       — light reasoning + vision; faster than o3.
 */
export const GPT_5_5_PRO = "gpt-5.5-pro" as const;
export const GPT_5_5 = "gpt-5.5" as const;
export const GPT_5_2 = "gpt-5.2" as const;
export const GPT_5 = "gpt-5" as const;
export const GPT_5_MINI = "gpt-5-mini" as const;
export const GPT_5_NANO = "gpt-5-nano" as const;
export const GPT_4_1 = "gpt-4.1" as const;
export const GPT_4_1_MINI = "gpt-4.1-mini" as const;
export const GPT_4O = "gpt-4o" as const;
export const GPT_4O_MINI = "gpt-4o-mini" as const;
export const O3 = "o3" as const;
export const O4_MINI = "o4-mini" as const;

export type OpenAIModel =
  | typeof GPT_5_5_PRO
  | typeof GPT_5_5
  | typeof GPT_5_2
  | typeof GPT_5
  | typeof GPT_5_MINI
  | typeof GPT_5_NANO
  | typeof GPT_4_1
  | typeof GPT_4_1_MINI
  | typeof GPT_4O
  | typeof GPT_4O_MINI
  | typeof O3
  | typeof O4_MINI;
