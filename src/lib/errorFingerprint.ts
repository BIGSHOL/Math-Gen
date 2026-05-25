/**
 * 에러를 *카테고리화* 하는 fingerprint — 같은 fingerprint = 같은 종류 에러.
 *
 * Admin UI 의 ErrorLogs 섹션이 *occurrence_count* 로 묶을 때 기준. 동일 fingerprint
 * 가 N 회 발생하면 1 row 의 count++ 형태로 압축 (storage 절약 + 우선순위 정렬).
 *
 * **휴리스틱**:
 *   1. message 의 *변동 부분* (UUID, ID, 숫자, URL) 을 placeholder 로 normalize
 *   2. stack 의 첫 줄 (가장 안쪽 함수 호출) 을 normalize
 *   3. endpoint / hook 이름을 prefix 로 추가 — 같은 message 라도 다른 위치면 별도 묶음
 *   4. djb2 hash → 32자 hex
 *
 * 매우 빠름 (~5μs). 클라이언트 errorReporter 와 서버 _logUsage 양쪽 사용.
 */

/**
 * 메시지의 변동 부분을 placeholder 로 normalize.
 *
 * 예:
 *   "HTTP 500 at /api/ai-ocr (req_abc123)" → "HTTP NNN at /api/ai-ocr (req_ID)"
 *   "page 42 not found" → "page NNN not found"
 */
const normalizeMessage = (msg: string): string => {
  return msg
    // UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "UUID")
    // Anthropic request IDs (req_xxx)
    .replace(/req_[a-zA-Z0-9]{10,}/g, "req_ID")
    // OpenAI / Gemini IDs
    .replace(/(?:msg|run|cmpl)_[a-zA-Z0-9]{10,}/g, "ID")
    // HTTP status codes / 큰 숫자 → NNN
    .replace(/\b\d{3,}\b/g, "NNN")
    // 작은 숫자 (페이지 번호 등) → N
    .replace(/\b\d+\b/g, "N")
    // URL paths 의 query string 제거
    .replace(/\?[^\s)]*/g, "")
    // 공백 정리
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
};

/**
 * Stack trace 의 가장 안쪽 (첫 줄) 함수 호출 위치 추출.
 *
 * "at extractPageProblems (ocr.ts:910:5)" → "extractPageProblems@ocr.ts"
 */
const extractStackTop = (stack: string | undefined): string => {
  if (!stack) return "";
  const lines = stack.split("\n");
  // 첫 줄은 보통 message — 두 번째 줄부터 stack frame
  for (const line of lines.slice(1)) {
    const m = line.match(/at\s+([^\s(]+)\s*\(?([^:)]+)/);
    if (m) {
      const fn = m[1].slice(0, 50);
      const file = m[2].split(/[\\/]/).pop()?.slice(0, 30) ?? "";
      return `${fn}@${file}`;
    }
  }
  return "";
};

/** djb2 — 빠르고 충돌 충분히 낮음 (사용량 통계 묶음 용도). */
const djb2 = (s: string): string => {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash + s.charCodeAt(i)) & 0xffffffff;
  }
  // 32자 hex 로 padding
  return (hash >>> 0).toString(16).padStart(8, "0").repeat(4);
};

/**
 * 에러 + context → fingerprint (32자 hex).
 *
 * @param err - JS Error 또는 임의 객체
 * @param context - 호출 위치 식별자 (예: "useVariantGen", "api/ai-ocr")
 */
export const fingerprintError = (
  err: unknown,
  context: string,
): string => {
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  const normalized = normalizeMessage(message);
  const stackTop = extractStackTop(stack);
  return djb2(`${context}|${normalized}|${stackTop}`);
};
