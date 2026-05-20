import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic SDK client.
 *
 * ⚠️ SECURITY — TEMPORARY CLIENT-SIDE USAGE ⚠️
 * `dangerouslyAllowBrowser: true` exposes the API key in the client bundle.
 * Anyone who opens DevTools can extract it and use it.
 *
 * Plan: Phase 5 moves all model calls behind a serverless proxy
 * (Vercel/Cloudflare Functions). Until then, do NOT ship a production build
 * with this configuration. Local development + private demo only.
 */
const apiKey = process.env.ANTHROPIC_API_KEY;

if (!apiKey) {
  // eslint-disable-next-line no-console
  console.warn(
    "[ai] ANTHROPIC_API_KEY is not set. AI calls will fail. " +
      "Add ANTHROPIC_API_KEY=... to your .env.local file.",
  );
}

export const anthropic = new Anthropic({
  apiKey: apiKey ?? "",
  dangerouslyAllowBrowser: true,
});

/**
 * Anthropic model family.
 *  - Haiku 4.5  — cheapest + fastest, weaker on dense vision tasks. Use for
 *    text-only re-runs or extremely simple figures.
 *  - Sonnet 4.6 — default for the first OCR pass. Sweet spot for cost/quality
 *    on vision + structured output.
 *  - Opus 4.7   — slow + expensive but markedly better at visual structure
 *    (axis placement, points through specific coordinates, parabola
 *    orientation). Use as the second pass on figure-bearing pages.
 */
export const HAIKU_MODEL = "claude-haiku-4-5" as const;
export const SONNET_MODEL = "claude-sonnet-4-6" as const;
export const OPUS_MODEL = "claude-opus-4-7" as const;

/** Kept as an alias for back-compat — the codebase used DEFAULT_MODEL widely. */
export const DEFAULT_MODEL = SONNET_MODEL;

export type AnthropicModelId =
  | typeof HAIKU_MODEL
  | typeof SONNET_MODEL
  | typeof OPUS_MODEL;

/** @deprecated Use AnthropicModelId. Kept for type-import back-compat. */
export type ModelId = AnthropicModelId;
