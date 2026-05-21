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
  rule: "distinct-tuple" | "sign-parity" | "ascending-order";
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
  return warnings;
};
