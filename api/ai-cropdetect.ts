import type { VercelRequest, VercelResponse } from "./_types.js";
import { detectCropBoxes } from "../src/services/ai/cropDetect.js";
import { resolveAuth } from "./_jwt.js";
import { logAiUsage, logError, serverFingerprint } from "./_logUsage.js";

/**
 * POST /api/ai-cropdetect
 *
 * Step 1.5 크롭 박스 검출 (Gemini 3 Flash) 서버 프록시. prod 빌드는 클라이언트
 * 번들에 AI 키가 안 박혀(vite define 제거) cropDetect 직접 호출 불가 — 사용자
 * 보고 2026-06-04: 배포본에서 "GEMINI_API_KEY is not set" 으로 Step 1.5 가 전부
 * 실패. 이 함수 경유로 서버 GEMINI_API_KEY(Vercel env) 사용. 서버에서
 * detectCropBoxes 는 USE_API=false(window 없음) → direct Gemini SDK 실행.
 *
 * body: { pageBase64: string }  →  { crops: DetectedCrop[] }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  const t0 = Date.now();
  const auth = await resolveAuth(req);
  const body = (req.body ?? {}) as { pageBase64?: string };
  if (!body.pageBase64) {
    return res.status(400).json({ error: "pageBase64 field required" });
  }
  try {
    const crops = await detectCropBoxes(body.pageBase64);
    logAiUsage({
      userId: auth.userId,
      tenantId: auth.tenantId,
      endpoint: "ai-cropdetect",
      provider: "gemini",
      model: "gemini-3-flash-preview",
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 },
      latencyMs: Date.now() - t0,
      error: null,
    });
    return res.status(200).json({ crops });
  } catch (err) {
    const msg = (err as Error).message || "Internal Server Error";
    logError({
      userId: auth.userId,
      tenantId: auth.tenantId,
      kind: "ocr",
      severity: "error",
      message: msg,
      stack: (err as Error).stack ?? null,
      context: { endpoint: "ai-cropdetect" },
      userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
      fingerprint: serverFingerprint(msg, "ai-cropdetect"),
    });
    // eslint-disable-next-line no-console
    console.error("[api/ai-cropdetect] error:", msg);
    return res.status(500).json({ error: msg });
  }
}
