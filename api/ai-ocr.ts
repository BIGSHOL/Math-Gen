import type { VercelRequest, VercelResponse } from "./_types.js";
import { extractPageProblems, type OCRPageInput } from "../src/services/ai/ocr.js";

/**
 * POST /api/ai-ocr
 *
 * Phase 5a — OCR (페이지 단위) 서버 함수 proxy.
 * `src/services/ai/ocr.ts` 의 `extractPageProblems` 본문 그대로 호출.
 *
 * **Vision payload 주의**: 페이지 이미지 (PNG/JPEG dataUrl 또는 base64) 가
 * body 에 포함. Vercel function body limit 4.5MB. OCR 페이지 이미지 압축
 * 후 ~500KB-2MB 추정. 안전 범위.
 *
 * **Streaming**: 일부 Anthropic 호출이 `messages.stream` 사용 (max_tokens
 * 21k+). Node function 에서 *stream.finalMessage()* 그대로 동작 — 클라이언트
 * 에는 *non-streaming* response. 진행률 UX 손실은 후속 SSE 로 해결.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  try {
    const input = (req.body ?? {}) as OCRPageInput;
    if (!input.pageBase64) {
      return res.status(400).json({ error: "pageBase64 field required" });
    }
    const result = await extractPageProblems(input);
    return res.status(200).json(result);
  } catch (err) {
    const msg = (err as Error).message || "Internal Server Error";
    // eslint-disable-next-line no-console
    console.error("[api/ai-ocr] error:", msg);
    return res.status(500).json({ error: msg });
  }
}
