/**
 * Solution accuracy validator — Sonnet 출력의 *구조적 정확도* 를 lightweight
 * 휴리스틱으로 검증. 100% 검증은 불가능하지만 *명백한 오류 패턴* 은 잡는다.
 *
 * 현재 검출 항목:
 *   1. **distinct-tuple violation** — "서로 다른 N 개" 조건이 있는 문제에서
 *      풀이 본문의 *어떤 튜플* 이라도 원소 중복이면 *Pattern J 위반 가능성*.
 *      예: "{1, 1, 50}: ... (-50, 1, 1): 합 -48" 에서 (-50, 1, 1) 의 원소 1 이
 *      두 번 → distinct 위반.
 *
 * 검증은 *경고 (warning)* 로만 surfacing — 답 자체를 무효화 하지 않는다.
 * 사용자가 보고 *재생성* 결정. 후속 phase 에서 *자동 재시도* 도입 검토.
 */

export interface SolutionWarning {
  /** 짧은 한 줄 — UI banner 표시. */
  summary: string;
  /** 자세한 검출 결과 — collapsible. */
  detail: string;
  /** 검증 항목 id. */
  rule:
    | "distinct-tuple"
    | "sign-parity"
    | "ascending-order"
    | "trial-and-error"
    | "too-long";
}

/**
 * "서로 다른 N 개" / "모두 다른" / "중복 없는" 조건 키워드 매처.
 * problem.text 에서 키워드 + 숫자 (N) 추출 시도.
 */
const DISTINCT_KEYWORDS = [
  /서로\s*다른\s*(\S+)/,
  /모두\s*다른\s*(\S+)/,
  /각각\s*다른\s*(\S+)/,
  /중복\s*없는\s*(\S+)/,
  /중복이\s*없는\s*(\S+)/,
];

/**
 * 풀이 본문에서 *정수 튜플* 추출. 매칭 패턴:
 *   - `(a, b, c)` — 괄호 안 정수 쉼표 분리. 음수, ± 모두 OK.
 *   - `\{a, b, c\}` — 중괄호 안. KaTeX `\{...\}` 도 매칭.
 *
 * 변수 (a, b, c, x, y, z) 가 섞인 튜플은 제외 — *순수 정수만* 검증 대상.
 */
const PURE_INT = /^-?\d+$/;

const extractIntTuples = (solutionText: string): number[][] => {
  const tuples: number[][] = [];

  // `(...)` 또는 `\{...\}` 또는 `{...}` 형태 모두 매칭.
  // - greedy 안 — 닫는 괄호까지 최단.
  // - KaTeX 의 \{ / \} 도 처리.
  const TUPLE_RE = /(?:\\\{|\{|\()((?:[^(){}\\]|\\.){2,40}?)(?:\\\}|\}|\))/g;

  let match: RegExpExecArray | null;
  while ((match = TUPLE_RE.exec(solutionText)) !== null) {
    const inner = match[1].trim();
    // 쉼표 또는 ", " 로 split. KaTeX 의 `,\,` 같은 spacing 도 안전 처리.
    const parts = inner
      .split(/\s*,\s*/)
      .map((p) => p.replace(/\\,|\\;|\\:/g, "").trim());
    // 3 개 이상의 항목 + 모두 *순수 정수* (음수 포함) 만 검증 대상.
    if (parts.length < 2 || parts.length > 6) continue;
    if (!parts.every((p) => PURE_INT.test(p))) continue;
    const nums = parts.map((p) => Number.parseInt(p, 10));
    tuples.push(nums);
  }
  return tuples;
};

/**
 * "서로 다른 N 개" 조건 추출. problem.text 에서 *키워드 + 숫자* 매치.
 * 예: "서로 다른 세 정수" → N=3, "서로 다른 4 개 정수" → N=4.
 *
 * 한국어 수사: 한/두/세/네/다섯/여섯 + 아라비아 숫자 모두 매칭.
 */
const KOREAN_NUMERAL: Record<string, number> = {
  한: 1,
  두: 2,
  세: 3,
  네: 4,
  다섯: 5,
  여섯: 6,
  일곱: 7,
  여덟: 8,
  아홉: 9,
  열: 10,
};

const detectDistinctRequirement = (problemText: string): number | null => {
  for (const re of DISTINCT_KEYWORDS) {
    const m = problemText.match(re);
    if (!m) continue;
    // 다음 토큰에서 N 추출 시도. m[1] 은 키워드 뒤 첫 토큰.
    const tail = m[1] ?? "";
    // 아라비아 숫자.
    const arabic = tail.match(/^(\d+)/);
    if (arabic) return Number.parseInt(arabic[1], 10);
    // 한국어 수사.
    for (const [k, v] of Object.entries(KOREAN_NUMERAL)) {
      if (tail.startsWith(k)) return v;
    }
    // 키워드만 있고 N 추출 실패 — null 반환. 위반 검증 skip.
  }
  return null;
};

/**
 * "서로 다른 N 개" 조건 위반 case 검출.
 *
 * 휴리스틱: problem.text 에서 "서로 다른 N 개" 추출 → solution.text 의 모든
 * *순수 정수 N-튜플* 에 대해 `|set| < N` 인 것 카운트.
 *
 * **False positive 위험**: 풀이가 *중복 case 를 일부러 제시하고 무효라고 명시*
 * 한 경우 → 위반으로 잘못 잡힘. 그러나 모델이 *그래도 정답에 포함시킨* 경우와
 * 구분이 어려우니 일단 warning 로 surfacing.
 *
 * **검증 강도**: 위반 튜플 *3 개 이상* 일 때만 warning. 1~2 개는 풀이 안에서
 * *명시적 무효 처리* 가능성 高.
 */
export const validateDistinctTuples = (
  problemText: string,
  solutionText: string,
): SolutionWarning | null => {
  const requiredN = detectDistinctRequirement(problemText);
  if (requiredN === null) return null;

  const tuples = extractIntTuples(solutionText);
  if (tuples.length === 0) return null;

  const violations = tuples
    .filter((t) => t.length === requiredN)
    .filter((t) => new Set(t).size < t.length);

  if (violations.length === 0) return null;

  // 위반 튜플을 풀이 본문에서 발견한 그대로 표시.
  const violationStrs = violations
    .slice(0, 5)
    .map((t) => `(${t.join(", ")})`)
    .join(", ");

  return {
    rule: "distinct-tuple",
    summary: `"서로 다른 ${requiredN} 개" 조건 위반 가능성 — 풀이 안에 원소 중복 튜플 ${violations.length} 개`,
    detail:
      `문제 본문이 *서로 다른 ${requiredN} 개* 를 요구하는데 풀이 본문에 ` +
      `원소가 중복인 ${requiredN}-튜플이 ${violations.length} 개 발견됨: ` +
      `${violationStrs}${violations.length > 5 ? " ..." : ""}. ` +
      `Pattern J (부호 배정 후 set 크기 미검증) 위반 의심. 정답에서 해당 ` +
      `합이 잘못 포함됐을 수 있습니다 — 재생성 권장.`,
  };
};

/**
 * trial-and-error / 검증 / 재시작 흔적 검출 (사용자 보고 2026-06-02 — "강력하게 차단").
 *
 * 모델이 풀이 도중 오답을 발견하고 *"선택지에 없으므로 재검토 → 다시 계산 →
 * 정답"* 흐름을 그대로 출력하는 경우. SOLUTION_PROMPT (§7-6) 가 강력히 금지하는데도
 * 모델이 종종 위반(특히 어려운 문제). prompt 만으로 100% 못 막으므로 runtime 에서
 * *명시적 마커* 를 검출해 경고 → 사용자 재생성 유도(강력 차단의 2차 방어선).
 *
 * **강한 마커만** 사용 — false positive 최소화. 깨끗한 학생용 풀이는 "선택지"
 * 를 언급하거나(정답은 answer 필드) "다시 계산/재검토/오류" 를 쓸 일이 없다.
 */
const TRIAL_ERROR_MARKERS: Array<{ re: RegExp; label: string }> = [
  // 선택지 대조 — 풀이가 답을 선택지와 맞춰보는 검증 (풀이에 있으면 안 됨).
  { re: /선택지\S*\s*(?:에|와|가|랑|를)?\s*(?:없|맞지\s*않|안\s*맞|아니|틀)/, label: "선택지 대조" },
  // 재검토 / 조건 재해석.
  { re: /재검토|다시\s*검토|조건\s*(?:을|해석을)?\s*재(?:검토|해석)/, label: "재검토" },
  // 다시 계산/정리/풀이.
  { re: /다시\s*(?:계산|정리|풀|확인|구하|살펴)|재계산|재확인|다시\s*풀어/, label: "다시 계산" },
  { re: /처음부터\s*다시/, label: "처음부터 다시" },
  // 오답 인정.
  { re: /오류!|잘못\s*(?:계산|설정|되|됐|함|두)|부호\s*오류|계산\s*(?:실수|오류)/, label: "오답 인정" },
  { re: /잠깐[,.\s]/, label: "잠깐" },
  { re: /말도\s*안/, label: "비속어" },
  // "여전히 −50 / 여전히 없음 / 여전히 선택지" — 불일치 반복.
  { re: /여전히\s*(?:없|맞지|선택지|틀|[−–-]?\s*\d)/, label: "여전히(불일치)" },
];

export const validateTrialAndError = (solutionText: string): SolutionWarning | null => {
  if (!solutionText) return null;
  const hits = TRIAL_ERROR_MARKERS.filter((m) => m.re.test(solutionText)).map((m) => m.label);
  if (hits.length === 0) return null;
  // 중복 라벨 제거.
  const labels = Array.from(new Set(hits));
  return {
    rule: "trial-and-error",
    summary: `풀이에 검토/재시도 흔적 — ${labels.join(", ")}`,
    detail:
      `풀이 본문에서 *오답 발견 → 재검토 → 재계산* 같은 trial-and-error / 검증 흔적이 ` +
      `검출됐습니다 (${labels.join(", ")}). 학생용 풀이는 정답까지 *직선 흐름* 만 보여야 하고, ` +
      `검증·재시작 과정은 출력에서 지워야 합니다. 재생성을 권장합니다.`,
  };
};

/**
 * 과도한 분량 검출 — 사용자 보고 "풀이 너무 길다 줄여". SOLUTION_PROMPT 의
 * HARD CAP (hard 도 ~20 줄) 을 *크게* 초과하는 풀이만 flag. 정상 hard 풀이가
 * false positive 안 나도록 관대한 임계(비어있지 않은 줄 32 개).
 */
const MAX_SOLUTION_LINES = 32;

export const validateLength = (solutionText: string): SolutionWarning | null => {
  if (!solutionText) return null;
  const lines = solutionText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length <= MAX_SOLUTION_LINES) return null;
  return {
    rule: "too-long",
    summary: `풀이가 너무 깁니다 — ${lines.length}줄 (권장 최대 ${MAX_SOLUTION_LINES}줄)`,
    detail:
      `풀이가 ${lines.length}줄로, 학생용 정답지 기준(hard 도 ~20줄)을 크게 넘습니다. ` +
      `case 나열 / 검증 절차 / 보일러플레이트 도입부를 제거하고 정답까지 직선 흐름으로 ` +
      `압축하세요. 재생성을 권장합니다.`,
  };
};

/**
 * 모든 검증 항목을 한 번에 실행. 발견된 warning array 반환 (없으면 빈 배열).
 *
 * 후속 phase 에서 sign-parity, ascending-order 등 추가 검증.
 */
export const validateSolution = (input: {
  problemText: string;
  solutionText: string;
}): SolutionWarning[] => {
  const warnings: SolutionWarning[] = [];
  const distinctWarning = validateDistinctTuples(input.problemText, input.solutionText);
  if (distinctWarning) warnings.push(distinctWarning);
  const trialWarning = validateTrialAndError(input.solutionText);
  if (trialWarning) warnings.push(trialWarning);
  const lengthWarning = validateLength(input.solutionText);
  if (lengthWarning) warnings.push(lengthWarning);
  return warnings;
};
