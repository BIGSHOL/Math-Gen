import type { VercelRequest, VercelResponse } from "./_types.js";
import { generateVariant, type VariantGenInput } from "../src/services/ai/variants.js";

/**
 * POST /api/ai-variant
 *
 * Phase 5a — 변형 생성 서버 함수 proxy. `src/services/ai/variants.ts` 의
 * generateVariant 본문 그대로 — Node SDK 직접 호출.
 *
 * Anthropic prompt caching 패턴 (variantSchema + cache_control) 보존.
 * OpenAI/Gemini fallback 도 동일.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  try {
    const input = (req.body ?? {}) as VariantGenInput;
    if (!input.problem || !input.goal || !input.difficulty) {
      return res.status(400).json({ error: "problem/goal/difficulty fields required" });
    }
    const result = await generateVariant(input);
    return res.status(200).json(result);
  } catch (err) {
    const msg = (err as Error).message || "Internal Server Error";
    // eslint-disable-next-line no-console
    console.error("[api/ai-variant] error:", msg);
    return res.status(500).json({ error: msg });
  }
}
