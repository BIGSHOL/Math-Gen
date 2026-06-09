import type { VercelRequest, VercelResponse } from "./_types.js";
import {
  analyzeCommentaryDirect,
  type AnalyzeCommentaryInput,
} from "../src/services/ai/examCommentary.js";
import { normalizeAnthropicUsage } from "../src/lib/pricing.js";
import { requireAuth } from "./_jwt.js";
import { logAiUsage, logError, serverFingerprint } from "./_logUsage.js";

/**
 * POST /api/ai-exam-commentary
 *
 * Phase N+3 — 시험지 commentary (AI 시험 총평). mathlab buildPrompt 의
 * 기본 commentary 부분 carry-over (V3 블로그 헤드라인 X).
 *
 * Input: AnalyzeCommentaryInput (basic BasicAnalysisResult + grade + meta)
 * Output: { result: CommentaryResult, modelUsed: "claude-sonnet-4-6" } —
 *   _usage 는 서버에서 ai_usage 기록 후 strip.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  const t0 = Date.now();
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const input = (req.body ?? {}) as AnalyzeCommentaryInput;

  if (!input.basic || !input.basic.questions?.length) {
    return res
      .status(400)
      .json({ error: "basic field required (BasicAnalysisResult)" });
  }

  try {
    const output = await analyzeCommentaryDirect(input);
    const latencyMs = Date.now() - t0;
    const normalized = normalizeAnthropicUsage(output._usage);

    logAiUsage({
      userId: auth.userId,
      tenantId: auth.tenantId,
      endpoint: "ai-exam-commentary",
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
      endpoint: "ai-exam-commentary",
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
      kind: "exam-commentary",
      severity: "error",
      message: msg,
      stack: (err as Error).stack ?? null,
      context: { endpoint: "ai-exam-commentary", grade: input.grade ?? null },
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      fingerprint: serverFingerprint(msg, "ai-exam-commentary"),
    });
    // eslint-disable-next-line no-console
    console.error("[api/ai-exam-commentary] error:", msg);
    return res.status(500).json({ error: msg });
  }
}
