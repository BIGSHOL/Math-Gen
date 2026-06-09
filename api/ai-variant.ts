import type { VercelRequest, VercelResponse } from "./_types.js";
import { generateVariant, type VariantGenInput } from "../src/services/ai/variants.js";
import { OCR_MODELS } from "../src/services/ai/ocr.js";
import { requireAuth } from "./_jwt.js";
import { logAiUsage, logError, serverFingerprint } from "./_logUsage.js";

/**
 * POST /api/ai-variant
 *
 * Phase 5a — 변형 생성 서버 함수 proxy.
 * Phase B — usage 추출 + ai_usage / error_logs 자동 기록.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  const t0 = Date.now();
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const input = (req.body ?? {}) as VariantGenInput;
  if (!input.problem || !input.goal || !input.difficulty) {
    return res.status(400).json({ error: "problem/goal/difficulty fields required" });
  }
  try {
    const result = await generateVariant(input);
    const latencyMs = Date.now() - t0;
    const provider =
      (OCR_MODELS[result.modelUsed]?.provider as
        | "anthropic"
        | "gemini"
        | "openai"
        | undefined) ?? "anthropic";
    logAiUsage({
      userId: auth.userId,
      tenantId: auth.tenantId,
      endpoint: "ai-variant",
      provider,
      model: result.modelUsed,
      usage: result._usage ?? {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      latencyMs,
      error: null,
    });
    const { _usage, ...clientResult } = result;
    void _usage;
    return res.status(200).json(clientResult);
  } catch (err) {
    const msg = (err as Error).message || "Internal Server Error";
    const latencyMs = Date.now() - t0;
    logAiUsage({
      userId: auth.userId,
      tenantId: auth.tenantId,
      endpoint: "ai-variant",
      provider: "anthropic",
      model: input.model ?? "unknown",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      latencyMs,
      error: msg.slice(0, 500),
    });
    logError({
      userId: auth.userId,
      tenantId: auth.tenantId,
      kind: "variant",
      severity: "error",
      message: msg,
      stack: (err as Error).stack ?? null,
      context: {
        endpoint: "ai-variant",
        goal: input.goal,
        difficulty: input.difficulty,
        model: input.model ?? null,
      },
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      fingerprint: serverFingerprint(msg, "ai-variant"),
    });
    // eslint-disable-next-line no-console
    console.error("[api/ai-variant] error:", msg);
    return res.status(500).json({ error: msg });
  }
}
