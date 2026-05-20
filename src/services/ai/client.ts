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
 * Default model. Claude Sonnet 4.6 is the sweet spot for cost/quality on
 * vision + structured math problem generation.
 */
export const DEFAULT_MODEL = "claude-sonnet-4-6" as const;

/**
 * Fallback for higher-difficulty problems (currently unused; the design
 * handoff describes a difficulty knob that can promote to Opus).
 */
export const OPUS_MODEL = "claude-opus-4-7" as const;

export type ModelId = typeof DEFAULT_MODEL | typeof OPUS_MODEL;
