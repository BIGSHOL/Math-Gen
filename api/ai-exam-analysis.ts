import type { VercelRequest, VercelResponse } from "./_types.js";
import {
  analyzeExamDirect,
  type AnalyzeExamInput,
} from "../src/services/ai/examAnalysis.js";
import { normalizeAnthropicUsage } from "../src/lib/pricing.js";
import { resolveAuth } from "./_jwt.js";
import { logAiUsage, logError, serverFingerprint } from "./_logUsage.js";

/**
 * POST /api/ai-exam-analysis
 *
 * Phase N — 시험지 분석 (Sonnet 4.6 vision + prompt caching). mathlab 의
 * 동등 기능을 mathg-gen 안에 carry-over.
 *
 * Input: AnalyzeExamInput (pageImages base64 + grade + examCategory + hasEssay +
 *   examScope?)
 * Output: { result: BasicAnalysisResult, modelUsed: "claude-sonnet-4-6" } —
 *   _usage 는 server 에서 ai_usage 로 기록 후 strip.
 *
 * **Prompt caching 보존**: examAnalysisPrompts.ts 의 system prefix 에
 * `cache_control: ephemeral` 마커. 같은 학년/과목/서술형 여부 시험지 연속 분석
 * 시 cache hit (5분 TTL).
 *
 * **인증**: 현재 phase 는 anon 허용 — user_id null 이어도 ai_usage 기록.
 * tenant_id 는 RLS 미통과 시 null.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  const t0 = Date.now();
  const auth = await resolveAuth(req);
  const input = (req.body ?? {}) as AnalyzeExamInput;

  if (!input.pageImages || input.pageImages.length === 0) {
    return res
      .status(400)
      .json({ error: "pageImages field required (base64 image array)" });
  }
  if (!input.grade) {
    return res.status(400).json({ error: "grade field required" });
  }

  try {
    const output = await analyzeExamDirect(input);
    const latencyMs = Date.now() - t0;

    // raw Anthropic usage shape → NormalizedUsage 변환 (cache 통계 포함)
    const normalized = normalizeAnthropicUsage(output._usage);

    logAiUsage({
      userId: auth.userId,
      tenantId: auth.tenantId,
      endpoint: "ai-exam-analysis",
      provider: "anthropic",
      model: output.modelUsed,
      usage: normalized,
      latencyMs,
      error: null,
    });

    // _usage strip — client 는 result + modelUsed 만 받음
    const { _usage, ...clientOutput } = output;
    void _usage;
    return res.status(200).json(clientOutput);
  } catch (err) {
    const msg = (err as Error).message || "Internal Server Error";
    const latencyMs = Date.now() - t0;

    logAiUsage({
      userId: auth.userId,
      tenantId: auth.tenantId,
      endpoint: "ai-exam-analysis",
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
      kind: "exam-analysis",
      severity: "error",
      message: msg,
      stack: (err as Error).stack ?? null,
      context: { endpoint: "ai-exam-analysis", grade: input.grade ?? null },
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      fingerprint: serverFingerprint(msg, "ai-exam-analysis"),
    });
    // eslint-disable-next-line no-console
    console.error("[api/ai-exam-analysis] error:", msg);
    return res.status(500).json({ error: msg });
  }
}
