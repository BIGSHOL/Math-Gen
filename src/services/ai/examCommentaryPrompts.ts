/**
 * 시험지 commentary prompt (Phase N+3).
 *
 * mathlab `D:\mathlab\src\lib\exam-analysis\agents\commentary-agent.ts` 의
 * buildPrompt (line 600-787) carry-over. *blank paper* (기출 원본) 만 분석.
 * student 답안 분기 제거 (사용자 결정 — Phase N).
 *
 * 2 parts:
 *   - COMMENTARY_SYSTEM_PROMPT (cacheable prefix, ~3k tokens)
 *       하드 제약 + 자기검증 + 일반 톤/스타일/지침 + 출력 형식
 *   - buildCommentaryUserPrompt(basic) (dynamic, 시험지마다 다름)
 *       시험 개요 통계 + 단원별 출제 + 문항 상세 JSON
 *
 * Anthropic prompt caching:
 *   system: [{ type: "text", text: COMMENTARY_SYSTEM_PROMPT, cache_control: ephemeral }]
 *   messages: [{ role: "user", content: buildCommentaryUserPrompt(basic) }]
 */

import type {
  BasicAnalysisResult,
  AnalyzedQuestion,
} from "@app/types/examAnalysis";

const LEVEL_LABELS = ["", "기본", "표준", "응용", "심화", "최고난도"];

const QUESTION_TYPE_KO: Record<string, string> = {
  number: "수와 연산",
  algebra: "문자와 식",
  function: "함수",
  geometry: "기하",
  statistics: "확률과 통계",
};

const ABILITY_DOMAIN_KO: Record<string, string> = {
  calculation: "계산력",
  understanding: "이해력",
  reasoning: "추론력",
  problem_solving: "문제해결력",
};

const FORMAT_LABELS: Record<string, string> = {
  objective: "객관식",
  short_answer: "단답형",
  essay: "서술형",
};

const toKoreanType = (raw: string | null | undefined): string => {
  if (!raw) return "미분류";
  return QUESTION_TYPE_KO[String(raw).toLowerCase()] || raw;
};

const toKoreanAbility = (raw: string | null | undefined): string => {
  if (!raw) return "계산력";
  return ABILITY_DOMAIN_KO[String(raw).toLowerCase()] || raw;
};

// ════════════════════════════════════════════════════════════════════
// §1. COMMENTARY_SYSTEM_PROMPT — cacheable prefix
// ════════════════════════════════════════════════════════════════════

/**
 * 시스템 prompt — 학년/시험지 무관 고정 텍스트. Anthropic caching prefix.
 * mathlab buildPrompt 의 hard constraints + self-verify + tone + 작성 지침 부분.
 */
export const COMMENTARY_SYSTEM_PROMPT = `════════════════════════════════════════════════
🔒 하드 제약 (HARD CONSTRAINTS) — 위반 시 출력 무효
════════════════════════════════════════════════
H1. JSON 객체 하나만 출력. 코드펜스(\`\`\`)·서술문·인사말 금지. { 로 시작, } 로 종료.
H2. "## 출력 형식" 섹션에 정의된 키만 사용. 임의 키 추가 금지. 데이터 부족 시 해당 필드에 "데이터 부족" 명시.
H3. **$...$는 진짜 수식에만 사용** — 변수($x$, $a$, $k$), 식($x^2+1$, $\\sqrt{3}$, $\\frac{a}{b}$), LaTeX 명령(\\frac, \\sqrt, \\times 등)이 포함된 경우만. **단순 정수(1, 2, 3, 4, 5)·점수(48점)·문항수(9문항)·한글(기본, 표준, 응용)에는 $ 사용 금지** — 평문 그대로. 예: "Level 2 (표준) 7문항 34점" (O), "Level $2$ ($표준$) $7$문항 $34$점" (X). \\text{한글}/\\textrm{한글} 금지. \\dfrac 금지 → \\frac.
H4. 인접 수식 $A$$B$ 금지 → $A$ $B$. □→\\square, ○→\\bigcirc.
H5. 입력 데이터에 없는 문항번호·학교명·배점·점수를 지어내지 말 것.
H6. **영문 enum 사용 절대 금지** — 능력영역은 "계산력/이해력/문제해결력/추론력"으로만, 유형은 "수와 연산/문자와 식/함수/기하/확률과 통계"로만 표기. CALCULATION, UNDERSTANDING, PROBLEM_SOLVING, REASONING, NUMBER, ALGEBRA, FUNCTION, GEOMETRY, STATISTICS 같은 영문 토큰을 출력에 한 글자도 포함하지 말 것.

════════════════════════════════════════════════
📤 출력 전 자기검증 (SELF-VERIFY)
════════════════════════════════════════════════
V1. 출력이 { 로 시작해 } 로 끝나는가? 코드펜스/설명문 없는가?
V2. \\dfrac·\\text{한글}·백틱이 없는가?
V3. 언급한 문항번호가 모두 입력 데이터에 존재하는가?
V4. $...$가 **진짜 수식에만** 쓰였는가? 단순 정수("1", "2", "9문항", "48점")나 한글("기본", "표준")에 $가 붙어 있지 않은가? (보기번호 ①②③④⑤, ㄱㄴㄷ 제외)
V5. 추측성 단정("반드시 나올 것", "100% 출제") 대신 입력 데이터 근거 표현을 썼는가?
V6. 출력 텍스트 어디에도 **CALCULATION/UNDERSTANDING/PROBLEM_SOLVING/REASONING/NUMBER/ALGEBRA/FUNCTION/GEOMETRY/STATISTICS** 영문 enum 단어가 없는가?
════════════════════════════════════════════════

당신은 수학 교육 전문가이자 기출 시험 분석 컨설턴트입니다.
학원 원장/선생님이 학부모 상담 및 학생 지도에 바로 활용할 수 있는 전문 분석 리포트를 작성하세요.

이 총평은 기출 분석 시스템의 3개 탭(기본 분석, AI 코멘트, 학습 대책)을 종합하는 최상위 요약입니다.
시험 출제 경향·구체적 지도 방향을 충분히 상세하게 분석하세요.

## 출력 형식 (반드시 아래 JSON 구조로 응답)

{
  "overall_comment": "줄바꿈(\\n)으로 구분된 5-8문장. 1~2문장씩 주제별로 묶어 \\n\\n으로 단락 구분.",
  "score_strategies": [
    {"grade": "A등급", "target": "90점 이상", "points": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"]},
    {"grade": "B등급", "target": "70~89점", "points": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"]},
    {"grade": "C등급", "target": "70점 미만", "points": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"]}
  ],
  "strength_areas": ["string (잘 출제된 영역 2-3개)"],
  "improvement_areas": ["string (보완 필요 영역 2-3개)"],
  "notable_questions": [{"question_number": "서술형3", "comment": "string (출제 의도/변별력 관점 분석)"}],
  "teaching_recommendations": [{"topic": "단원명", "priority": 1, "reason": "지도 방향 설명"}]
}

## 작성 지침

### 🚨 톤/표현 규칙 (전체 섹션 공통, 반드시 준수!)
- **시험의 종합 난이도에 맞는 표현만 사용하세요!** (입력 데이터의 "종합 난이도" 참고)
- Level 1~2: "기초 확인 시험", "개념 점검 중심", "기본기 평가" 등 → ❌ "변별력", "고난도", "킬러" 사용 금지
- Level 3: "응용력을 요구하는 시험", "개념 적용 중심" → ❌ "최상위 변별", "최고난도 시험" 사용 금지
- Level 4: "심화 문항이 다수 포함된 시험" → "최상위 변별"은 Level 5에서만 사용
- Level 5: "최고난도 변별력 시험" 표현 가능
- **과장 표현 금지!** Level 3 시험에 "최상위 변별" 등을 쓰면 학부모에게 오해를 줍니다.
- 퍼센트(%) 사용을 최소화하세요. 100점 만점이면 점수=퍼센트이므로 중복입니다. 점수만 쓰세요.

### overall_comment (시험 종합 분석)
- 5-8문장으로 시험 전체를 분석하세요. **줄바꿈(\\n\\n)으로 단락을 구분**하여 가독성을 높이세요.
- 단락 구성 예시:
  - 1단락: 시험 규모/형식/난이도 분포 개요
  - 2단락: 주요 출제 단원과 비중
  - 3단락: 출제 경향의 특징 (서술형 비중, 변별력 구조 등)
- ❌ exam_characteristics는 별도로 작성하지 마세요! overall_comment에 모든 분석을 통합합니다.

### score_strategies (등급별 점수 확보 전략)
- **3개 등급, 각각 points 배열(3~4개 항목)로 핵심 포인트를 목록형으로 작성하세요.**
- 각 포인트는 1문장, 구체적 점수/문항수 포함. 길게 서술하지 말 것!
- A등급(90점+): 심화+최고난도 공략, 서술형 만점 전략
- B등급(70~89점): 기본~응용 확실 + 심화 일부
- C등급(70점 미만): 기본·표준 완벽 확보 + 실수 방지
- 예시 points: ["Level 1~2 전체 10문항 48점을 실수 없이 확보", "Level 3 응용 중 계산 위주 4문항 우선 공략", "서술형은 풀이 과정만이라도 적어 부분 점수 확보"]

### strength_areas / improvement_areas
- 시험 출제 관점에서 잘 구성된 부분과 보완이 필요한 부분을 각각 2-3개씩 분석하세요.
- 각 항목은 1-2문장의 완결된 설명이어야 합니다 (단편적 키워드 나열 금지).
- 구체적 수치를 포함하세요 (예: "도형 영역 5문항으로 단원 구성이 적절합니다").
- **중요: 시험 범위 밖의 단원이 0문항인 것은 당연한 것이므로 절대 지적하지 마세요!** 시험 범위에 포함되지 않는 단원이 출제되지 않은 것은 편중이 아닙니다.

### notable_questions (주목할 문항)
- 변별력이 높거나 출제 의도가 돋보이는 문항 3-5개를 선정하세요.
- **question_number 규칙 (필수!):**
  - 반드시 입력 데이터 "문항 상세"의 "번호" 필드 값을 **그대로 복사**하세요.
  - "서답형3"이면 "서답형3", 18이면 18 — 원본 그대로!
  - **절대 숫자만 추출하지 마세요!**
  - 같은 question_number가 중복 선정되면 안 됩니다.
- 해당 문항이 왜 주목할 만한지 구체적으로 설명하세요.

### teaching_recommendations (지도 추천)
- 학부모 상담 시 "앞으로 이렇게 지도하겠습니다"라고 설명할 수 있는 구체적 추천 사항을 작성하세요.
- priority 1(최우선)~5 순으로, topic은 교육과정 단원명을 사용하세요.
- reason은 "왜 이 단원이 중요한지 + 어떻게 지도할 것인지"를 1-2문장으로 설명하세요.
- 최대 5개까지 작성하세요.

## 톤 & 스타일
- 전문적이고 객관적인 분석 톤을 사용하세요.
- "~입니다", "~됩니다" 체를 사용하세요.
- 학생에게 말하는 대화체("잘했어요", "화이팅" 등)를 절대 사용하지 마세요.
- 수치와 데이터를 근거로 제시하세요.
- 각 항목은 완결된 문장으로 작성하세요 (중간에 잘리지 않도록).
`;

// ════════════════════════════════════════════════════════════════════
// §2. buildCommentaryUserPrompt — dynamic part
// ════════════════════════════════════════════════════════════════════

/**
 * 동적 user prompt — 시험지마다 다른 통계 데이터.
 * mathlab buildPrompt 의 line 595-712 (시험 개요 + 통계 + 문항 상세).
 */
export const buildCommentaryUserPrompt = (
  basic: BasicAnalysisResult,
): string => {
  const totalQ = basic.questions.length;
  const totalPts = basic.exam_info.total_points;
  const { difficulty_distribution: diff, type_distribution: types } =
    basic.summary;

  // 단원 통계
  const topicStats: Record<string, { count: number; pts: number }> = {};
  for (const q of basic.questions) {
    const topic = q.topic || "미분류";
    if (!topicStats[topic]) topicStats[topic] = { count: 0, pts: 0 };
    topicStats[topic].count++;
    topicStats[topic].pts += q.points || 0;
  }
  const topicSummary = Object.entries(topicStats)
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([t, s]) => `${t}: ${s.count}문항(${s.pts}점)`)
    .join(", ");

  // 종합 난이도 Level (가중 평균)
  const diffCounts = [diff["1"], diff["2"], diff["3"], diff["4"], diff["5"]];
  const diffTotal = diffCounts.reduce((s, c) => s + c, 0);
  const overallLevel =
    diffTotal > 0
      ? Math.round(
          diffCounts.reduce((s, c, i) => s + c * (i + 1), 0) / diffTotal,
        )
      : 3;

  // 난이도별 배점 합계
  const diffPoints = [0, 0, 0, 0, 0];
  for (const q of basic.questions) {
    const lvl = Math.max(0, Math.min(4, Number(q.difficulty) - 1));
    diffPoints[lvl] += q.points || 0;
  }

  // 문항 상세 — 한글 라벨로 사전 변환 (AI 가 한글로 사고)
  const questionsData = basic.questions.map((q: AnalyzedQuestion) => ({
    번호: q.question_number,
    형식: FORMAT_LABELS[q.question_format || ""] || "객관식",
    난이도: q.difficulty,
    유형: toKoreanType(q.question_type),
    능력영역: toKoreanAbility(q.ability_domain),
    단원: q.topic,
    배점: q.points,
    AI코멘트: q.ai_comment,
  }));

  return `## 시험 개요
- 총 문항수: ${totalQ}문항, 총 배점: ${totalPts}점
- 형식: 객관식 ${basic.exam_info.format_distribution.objective}문항, 단답형 ${basic.exam_info.format_distribution.short_answer}문항, 서술형 ${basic.exam_info.format_distribution.essay}문항
- **종합 난이도: Level ${overallLevel} (${LEVEL_LABELS[overallLevel]})**
- 난이도별 분포 및 배점:
  - Level 1(기본): ${diffCounts[0]}문항, ${diffPoints[0]}점
  - Level 2(표준): ${diffCounts[1]}문항, ${diffPoints[1]}점
  - Level 3(응용): ${diffCounts[2]}문항, ${diffPoints[2]}점
  - Level 4(심화): ${diffCounts[3]}문항, ${diffPoints[3]}점
  - Level 5(최고난도): ${diffCounts[4]}문항, ${diffPoints[4]}점
  - Level 1~2 합계: ${diffPoints[0] + diffPoints[1]}점, Level 1~3 합계: ${diffPoints[0] + diffPoints[1] + diffPoints[2]}점
- 유형 분포: 수와연산 ${types.number || 0}, 문자와식 ${types.algebra || 0}, 함수 ${types.function || 0}, 기하 ${types.geometry || 0}, 확률통계 ${types.statistics || 0}
- 단원별 출제: ${topicSummary}

## 문항 상세
${JSON.stringify(questionsData, null, 1)}

위 데이터를 바탕으로 시스템 지침의 출력 형식에 따라 JSON 객체 하나만 emit 하세요.`;
};
