import type { VercelRequest, VercelResponse } from "./_types.js";
import { generateSolution, type SolutionGenInput } from "../src/services/ai/solutions.js";
import { OCR_MODELS } from "../src/services/ai/ocr.js";
import { requireAuth } from "./_jwt.js";
import { logAiUsage, logError, serverFingerprint } from "./_logUsage.js";

/**
 * POST /api/ai-solution
 *
 * Phase 5a — Sonnet/Gemini/OpenAI 해설 호출 서버 함수 proxy. AI 키가 클라이언트
 * 번들에 박히지 않게.
 *
 * Phase B — Authorization Bearer 헤더 → user_id 추출 + SDK 응답의 usage 추출 →
 * `ai_usage` row insert (fire-and-forget). 실패 시 `error_logs` 도 insert.
 * 응답 shape 은 *_usage 필드 제외* — 클라이언트에 노출 안 함.
 *
 * **Prompt caching 보존**: `cache_control: ephemeral` 마커가 요청 body 에 박혀
 * 보내지므로 서버에서 호출해도 1st write + 2nd-30th read 자동.
 *
 * **인증**: 현재 phase 는 anon 허용 — user_id null 이어도 ai_usage 기록.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  const t0 = Date.now();
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const input = (req.body ?? {}) as SolutionGenInput;
  if (!input.problem) {
    return res.status(400).json({ error: "problem field required" });
  }
  try {
    const result = await generateSolution(input);
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
      endpoint: "ai-solution",
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
    // _usage 필드 strip — 클라이언트는 사용 안 함
    const { _usage, ...clientResult } = result;
    void _usage;
    return res.status(200).json(clientResult);
  } catch (err) {
    const msg = (err as Error).message || "Internal Server Error";
    const latencyMs = Date.now() - t0;
    // ai_usage 에 error 행 + error_logs 에 fingerprint 묶음
    logAiUsage({
      userId: auth.userId,
      tenantId: auth.tenantId,
      endpoint: "ai-solution",
      provider: "anthropic", // model 모를 때 default
      model: input.model ?? "unknown",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      latencyMs,
      error: msg.slice(0, 500),
    });
    logError({
      userId: auth.userId,
      tenantId: auth.tenantId,
      kind: "solution",
      severity: "error",
      message: msg,
      stack: (err as Error).stack ?? null,
      context: { endpoint: "ai-solution", model: input.model ?? null },
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      fingerprint: serverFingerprint(msg, "ai-solution"),
    });
    // eslint-disable-next-line no-console
    console.error("[api/ai-solution] error:", msg);
    return res.status(500).json({ error: msg });
  }
}
