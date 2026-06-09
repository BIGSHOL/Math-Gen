import type { VercelRequest, VercelResponse } from "./_types.js";
import {
  analyzeV4Direct,
  type AnalyzeV4Input,
} from "../src/services/ai/examV4.js";
import { normalizeAnthropicUsage } from "../src/lib/pricing.js";
import { requireAuth } from "./_jwt.js";
import { logAiUsage, logError, serverFingerprint } from "./_logUsage.js";

/**
 * POST /api/ai-exam-v4
 *
 * Phase N+5 (비활성) — V4 학원 블로그 생성 (9 키). mathlab generate-v4 carry-over.
 *
 * Input: AnalyzeV4Input (basic BasicAnalysisResult + grade/examCategory/academyName)
 * Output: { result: V4Extension, modelUsed } — _usage 는 서버에서 ai_usage 기록 후 strip.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  const t0 = Date.now();
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const input = (req.body ?? {}) as AnalyzeV4Input;

  if (!input.basic || !input.basic.questions?.length) {
    return res
      .status(400)
      .json({ error: "basic field required (BasicAnalysisResult)" });
  }

  try {
    const output = await analyzeV4Direct(input);
    const latencyMs = Date.now() - t0;
    const normalized = normalizeAnthropicUsage(output._usage);

    logAiUsage({
      userId: auth.userId,
      tenantId: auth.tenantId,
      endpoint: "ai-exam-v4",
      provider: "anthropic",
      model: output.modelUsed,
      usage: normalized,
      latencyMs,
      error: null,
    });

    const { _usage, ...clientOutput } = output;
    void _usage;
    return res.status(200).json(clientOutput);
  } catch (err) {
    const msg = (err as Error).message || "Internal Server Error";
    const latencyMs = Date.now() - t0;

    logAiUsage({
      userId: auth.userId,
      tenantId: auth.tenantId,
      endpoint: "ai-exam-v4",
      provider: "anthropic",
      model: "claude-sonnet-4-6",
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      latencyMs,
      error: msg.slice(0, 500),
    });
    logError({
      userId: auth.userId,
      tenantId: auth.tenantId,
      kind: "exam-v4",
      severity: "error",
      message: msg,
      stack: (err as Error).stack ?? null,
      context: { endpoint: "ai-exam-v4", grade: input.grade ?? null },
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      fingerprint: serverFingerprint(msg, "ai-exam-v4"),
    });
    // eslint-disable-next-line no-console
    console.error("[api/ai-exam-v4] error:", msg);
    return res.status(500).json({ error: msg });
  }
}
