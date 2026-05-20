import { GoogleGenAI } from "@google/genai";

/**
 * Google Gemini client — used as a 3rd-pass figure-rendering fallback when
 * even Claude Opus 4.7 fails to draw a figure correctly.
 *
 * Why a separate provider for a fallback?
 * Different model families have different visual-reasoning blind spots.
 * Sonnet/Opus occasionally mis-place vertices or pick the wrong parabola
 * orientation; Gemini 2.5 Pro has been observed to handle Korean exam
 * paper figures with comparable or better accuracy on the cases where
 * Anthropic struggles. Routing only the hard cases (figure-bearing
 * problems where the user explicitly requested another pass, or where a
 * heuristic flagged the Opus output as suspect) keeps cost bounded.
 *
 * Key environment notes:
 *  - GEMINI_API_KEY is optional. If unset, callers must surface a clear
 *    "Gemini fallback not configured" message rather than crashing.
 *  - The SDK targets the browser. Like the Anthropic client, this is a
 *    Phase-0.5 arrangement; Phase 5 moves all model calls behind a backend
 *    proxy so the key never ships to clients.
 */

const apiKey = process.env.GEMINI_API_KEY;

let _client: GoogleGenAI | null = null;

export const getGeminiClient = (): GoogleGenAI => {
  if (_client) return _client;
  if (!apiKey) {
    throw new Error(
      "[gemini] GEMINI_API_KEY is not set. Add it to .env.local to enable the Gemini fallback.",
    );
  }
  _client = new GoogleGenAI({ apiKey });
  return _client;
};

/** True when a Gemini key is configured. Use this to gate UI affordances. */
export const isGeminiAvailable = (): boolean => Boolean(apiKey);

/**
 * Model family. Updated to match Google AI Studio's actual model list as of
 * 2026-Q2. The Gemini 3 line is the recommended default for vision-heavy
 * OCR work; the older 2.5 line is kept for back-compat and stability.
 *
 *   ─ Gemini 3 series (current) ──────────────────────────────────────
 *   - GEMINI_3_1_PRO    — highest visual fidelity for hard figures.
 *                          Preview. Free-tier limit is 0 → billing required.
 *   - GEMINI_3_5_FLASH  — stable, balanced. Strongest "general" Flash.
 *   - GEMINI_3_FLASH    — preview, large-model-quality at lower cost.
 *   - GEMINI_3_1_FL_LITE — stable, cheapest vision-capable option.
 *
 *   ─ Gemini 2.5 series (legacy, kept for fallback) ─────────────────
 *   - GEMINI_2_5_PRO       — older Pro. Free-tier limit is 0.
 *   - GEMINI_2_5_FLASH     — older Flash. Free-tier available.
 *   - GEMINI_2_5_FLASH_LITE — text-only / ultra-cheap; NOT for vision.
 *
 * Pricing/availability changes frequently — when adding a model, also
 * register it in `OCR_MODELS` (services/ai/ocr.ts) with the latest blurb
 * + cost band.
 */
// Gemini 3 series — current generation
export const GEMINI_3_1_PRO = "gemini-3.1-pro-preview" as const;
export const GEMINI_3_5_FLASH = "gemini-3.5-flash" as const;
export const GEMINI_3_FLASH = "gemini-3-flash-preview" as const;
export const GEMINI_3_1_FLASH_LITE = "gemini-3.1-flash-lite" as const;

// Gemini 2.5 series — kept for back-compat
export const GEMINI_2_5_PRO = "gemini-2.5-pro" as const;
export const GEMINI_2_5_FLASH = "gemini-2.5-flash" as const;
export const GEMINI_2_5_FLASH_LITE = "gemini-2.5-flash-lite" as const;

// Legacy aliases — code written before the Gemini 3 update may still
// import these names. Map them to the closest current model.
/** @deprecated Use GEMINI_3_1_PRO. */
export const GEMINI_PRO = GEMINI_2_5_PRO;
/** @deprecated Use GEMINI_3_5_FLASH. */
export const GEMINI_FLASH = GEMINI_2_5_FLASH;
/** @deprecated Use GEMINI_3_1_FLASH_LITE. */
export const GEMINI_FLASH_LITE = GEMINI_2_5_FLASH_LITE;
/** @deprecated Use GEMINI_3_1_PRO. */
export const GEMINI_3_PRO_PREVIEW = GEMINI_3_1_PRO;

export type GeminiModel =
  | typeof GEMINI_3_1_PRO
  | typeof GEMINI_3_5_FLASH
  | typeof GEMINI_3_FLASH
  | typeof GEMINI_3_1_FLASH_LITE
  | typeof GEMINI_2_5_PRO
  | typeof GEMINI_2_5_FLASH
  | typeof GEMINI_2_5_FLASH_LITE;
