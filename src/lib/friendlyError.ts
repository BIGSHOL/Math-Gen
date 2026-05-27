/**
 * AI API 호출 실패 시 사용자에게 보여줄 *친화적 한국어 메시지* 로 변환.
 *
 * 원본 에러 (Anthropic / OpenAI / Gemini / fetch 네트워크 / 우리 service throw)
 * 는 raw JSON 또는 영문 — 일반 사용자는 의미 파악 불가. 패턴 매칭으로 *카테고리*
 * 식별 후 *짧은 한국어 메시지* 반환. raw 디버깅 정보는 DevTools console 에 별도
 * `console.error` 로 남김 (각 hook 의 catch 안에서).
 *
 * 사용 위치: useVariantGen / useSolutionGen / usePageOcr 의 catch.
 */

/**
 * 에러 메시지에서 HTTP status 코드 추출. fetch wrapper 가 `"400 {...}"` /
 * `"HTTP 500"` / `"500: ..."` 형식으로 emit.
 */
const extractStatus = (msg: string): number | null => {
  const patterns = [
    /^(\d{3})\s/, // "400 {...}"
    /\bHTTP\s+(\d{3})/i, // "HTTP 500"
    /^(\d{3}):/, // "500: ..."
  ];
  for (const re of patterns) {
    const m = msg.match(re);
    if (m) {
      const code = Number(m[1]);
      if (code >= 100 && code < 600) return code;
    }
  }
  return null;
};

/**
 * raw 에러 → 한국어 친화 메시지. 80자 이내로 짧게.
 *
 * 우선순위:
 *   1. 우리 자체 throw (한국어) → 그대로
 *   2. HTTP status 기반 카테고리
 *   3. 키워드 매칭 (rate limit, network, ...)
 *   4. fallback — "변형 생성 실패. 재시도해주세요."
 */
export const friendlyError = (err: unknown): string => {
  if (err === null || err === undefined) return "알 수 없는 오류";
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.trim();
  if (!msg) return "알 수 없는 오류";

  // (1) 우리가 직접 throw 한 한국어 메시지 — 통과
  // 휴리스틱: 한글 문자가 메시지의 30% 이상이면 이미 우리 한국어 메시지
  // 길이 한도 200 — cropDetect / OCR / 변형 의 자체 에러 메시지가 진단 정보
  // 포함해 ~150-200자가 되는 케이스 정상. fallback 으로 떨어지면 "처리 실패" 라는
  // 진단 가치 0 메시지가 표시되어 사용자가 root cause 추적 불가능 (CLAUDE.md
  // §1-2 / §1-3 의 friendly 메시지 길이 함정).
  const hangulCount = (msg.match(/[가-힣]/g) ?? []).length;
  if (hangulCount > 0 && hangulCount / msg.length > 0.3 && msg.length < 200) {
    return msg;
  }

  // (2) HTTP status 카테고리
  const status = extractStatus(msg);

  // 429 → rate limit
  if (status === 429 || /\b(rate|limit|quota|too many|overloaded|temporarily)\b/i.test(msg)) {
    return "요청 한도 초과 — 잠시 후 재시도해주세요.";
  }

  // 5xx → 서버 일시 오류
  if (status !== null && status >= 500) {
    return `AI 서버 일시 오류 (${status}) — 잠시 후 재시도해주세요.`;
  }

  // 401 / 403 → 인증
  if (status === 401 || status === 403) {
    return "AI 서버 인증 오류 — 관리자에게 보고해주세요.";
  }

  // 413 / 본문 크기
  if (status === 413 || /payload.*large|body.*size|request.*too.*large/i.test(msg)) {
    return "이미지 크기가 너무 큼 — 페이지 압축 필요.";
  }

  // 400 + invalid_request_error → schema / 요청 형식 오류
  if (
    status === 400 ||
    /invalid_request_error|invalid_request|invalid.*schema|not supported/i.test(msg)
  ) {
    return "AI 서버 요청 형식 오류 — 관리자에게 보고해주세요.";
  }

  // (3) 키워드 — 네트워크
  if (/network|timeout|ETIMEDOUT|ECONN|ENOTFOUND|fetch.*failed/i.test(msg)) {
    return "네트워크 오류 — 연결을 확인하고 재시도해주세요.";
  }

  // Abort / 사용자 취소
  if (/abort|aborted|cancelled?|canceled/i.test(msg)) {
    return "사용자가 취소했습니다.";
  }

  // 안전 모델 / safety filter
  if (/safety|blocked|content.*policy|harm/i.test(msg)) {
    return "AI 안전 필터에 차단됨 — 다른 모델로 재시도해주세요.";
  }

  // MAX_TOKENS / 출력 한도
  if (/max_tokens|MAX_TOKENS|output.*limit/i.test(msg)) {
    return "AI 출력 한도 초과 — 다른 모델로 재시도해주세요.";
  }

  // (4) fallback — 너무 긴 raw 메시지는 자르기
  if (msg.length > 80) {
    return "처리 실패 — 재시도해주세요.";
  }
  return msg;
};
