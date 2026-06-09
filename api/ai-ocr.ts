import type { VercelRequest, VercelResponse } from "./_types.js";
import { extractPageProblems, type OCRPageInput, OCR_MODELS, type OCRModel } from "../src/services/ai/ocr.js";
import { requireAuth } from "./_jwt.js";
import { logAiUsage, logError, serverFingerprint } from "./_logUsage.js";

/**
 * POST /api/ai-ocr
 *
 * Phase 5a — OCR (페이지 단위) 서버 함수 proxy.
 * Phase B — usage 추출 + ai_usage / error_logs 자동 기록.
 *
 * **Vision payload 주의**: 페이지 이미지 base64 가 body 에 포함. Vercel Pro
 * body limit 4.5MB. OCR 페이지 이미지 ~500KB-2MB 안전 범위.
 *
 * **Streaming**: Anthropic 호출은 `messages.stream` 사용 — Vercel function 안에서
 * stream.finalMessage() 동기 await. 클라이언트에는 *non-streaming* response.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  const t0 = Date.now();
  const auth = await requireAuth(req, res);
  if (!auth) return;
  const input = (req.body ?? {}) as OCRPageInput;
  if (!input.pageBase64) {
    return res.status(400).json({ error: "pageBase64 field required" });
  }
  try {
    const result = await extractPageProblems(input);
    const latencyMs = Date.now() - t0;
    const modelUsed = (result._modelUsed ?? input.model ?? "claude-sonnet-4-6") as OCRModel;
    const provider =
      (OCR_MODELS[modelUsed]?.provider as "anthropic" | "gemini" | "openai" | undefined) ??
      "anthropic";
    logAiUsage({
      userId: auth.userId,
      tenantId: auth.tenantId,
      endpoint: "ai-ocr",
      provider,
      model: modelUsed,
      usage: result._usage ?? {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      },
      latencyMs,
      error: null,
    });
    // _usage / _modelUsed strip — 클라이언트는 items 만 받음
    const { _usage, _modelUsed, ...clientResult } = result;
    void _usage;
    void _modelUsed;
    return res.status(200).json(clientResult);
  } catch (err) {
    const msg = (err as Error).message || "Internal Server Error";
    const latencyMs = Date.now() - t0;
    logAiUsage({
      userId: auth.userId,
      tenantId: auth.tenantId,
      endpoint: "ai-ocr",
      provider: "anthropic",
      model: input.model ?? "unknown",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      latencyMs,
      error: msg.slice(0, 500),
    });
    logError({
      userId: auth.userId,
      tenantId: auth.tenantId,
      kind: "ocr",
      severity: "error",
      message: msg,
      stack: (err as Error).stack ?? null,
      context: { endpoint: "ai-ocr", model: input.model ?? null },
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      fingerprint: serverFingerprint(msg, "ai-ocr"),
    });
    // eslint-disable-next-line no-console
    console.error("[api/ai-ocr] error:", msg);
    return res.status(500).json({ error: msg });
  }
}
