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

// Module-load warning policy:
//   - Anthropic missing, but Gemini OR OpenAI present  → silent. The user is
//     intentionally running on the Gemini/OpenAI route. Anthropic features
//     (Step 3 해설 생성, single-problem variant) will surface their own
//     error if they actually get invoked without a key.
//   - All three providers missing                      → warn. There is no
//     code path that can succeed without at least one provider.
//
// 이 조건문이 없으면 Gemini+OpenAI 로만 OCR 돌리는 사용자에게도 매번 콘솔
// 경고가 떠 노이즈가 됨 (사용자 보고).
const hasAnyProviderKey =
  Boolean(apiKey) ||
  Boolean(process.env.GEMINI_API_KEY) ||
  Boolean(process.env.OPENAI_API_KEY);

// Phase 5a — production build 의 client bundle 에는 *AI 키가 의도적으로 없음*
// (vite.config.ts 의 define 이 command="serve" 만 inject). 모든 AI 호출은
// `/api/ai-*` Vercel function 경유 → 키 없는 게 정상. 따라서 *서버 함수 경로*
// (USE_API=true) 에서는 이 경고를 skip — 노이즈 방지.
const USE_API: boolean =
  typeof window !== "undefined" &&
  typeof import.meta !== "undefined" &&
  Boolean(import.meta.env?.PROD || import.meta.env?.VITE_USE_API === "true");

if (!hasAnyProviderKey && !USE_API) {
  // eslint-disable-next-line no-console
  console.warn(
    "[ai] No provider key is set (ANTHROPIC_API_KEY / GEMINI_API_KEY / " +
      "OPENAI_API_KEY all blank). Every AI call will fail. Add at least " +
      "one key to your .env / .env.local file.",
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
