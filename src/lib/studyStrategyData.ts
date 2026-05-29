/**
 * 학습 대책 고정 데이터 (Phase N+4 확장).
 *
 * mathlab `study-strategy/constants.ts` carry-over. 시험지 무관 *고정 전략
 * 데이터* — 서술형 체크리스트 / 4주 타임라인 / 영역별 전략 / 난이도 조언.
 */

// ── 5대 교육과정 영역별 학습 전략 ──
export const TYPE_STRATEGIES: Record<string, string[]> = {
  number: [
    "기본 연산(사칙연산, 거듭제곱, 제곱근) 속도와 정확성을 매일 반복 훈련",
    "부호 실수, 약분 오류 등 반복되는 계산 실수 패턴을 체크리스트로 정리",
    "소인수분해, 유리수/무리수 판별 등 수의 성질을 정확히 이해",
  ],
  algebra: [
    "문자식의 전개/인수분해 공식을 완벽히 암기하고, 전개 후 검산하는 습관",
    "방정식/부등식 풀이 시 이항할 때 부호 변경, 양변 나누기 등 기본 규칙 체화",
    "활용 문제는 조건을 문자로 놓기 → 식 세우기 → 풀이 → 검증 순서로 연습",
  ],
  function: [
    "함수의 그래프를 직접 그려보는 연습 (점 찍기 → 연결하기 → 특성 파악)",
    "함수의 이동(평행이동, 대칭이동)과 변환 원리를 시각적으로 이해",
    "극한/미분/적분은 기본 공식 암기 + 다양한 유형별 풀이법 정리",
  ],
  geometry: [
    "도형의 정의와 성질을 정확히 암기하고, 조건을 그림에 직접 표시하는 습관",
    "증명 문제는 조건 → 근거 → 결론의 논리적 흐름을 연습",
    "좌표기하/벡터 문제는 공식 암기 + 좌표평면에 그려보기를 병행",
  ],
  statistics: [
    "평균, 분산, 표준편차 공식을 완벽히 암기하고 빠르게 계산하는 연습",
    "경우의 수를 체계적으로 세는 방법(수형도, 표, 순열/조합 구분) 연습",
    "확률분포와 정규분포 문제는 공식 적용 순서를 명확히 정리",
  ],
};

// ── 서술형 감점 방지 체크리스트 ──
export interface EssayChecklistItem {
  category: string;
  checkPoints: string[];
  commonErrors: string[];
}

export const ESSAY_CHECKLIST: EssayChecklistItem[] = [
  {
    category: "풀이 과정",
    checkPoints: [
      "모든 계산 단계를 명시했는가?",
      "사용한 공식/정리를 기재했는가?",
      "논리적 비약 없이 전개했는가?",
    ],
    commonErrors: ["중간 단계 생략", "풀이 순서 오류", "공식 적용 근거 누락"],
  },
  {
    category: "조건 확인",
    checkPoints: [
      "문제의 모든 조건을 사용했는가?",
      "변수의 범위 조건을 확인했는가?",
      "특수한 경우(0, 음수 등)를 검토했는가?",
    ],
    commonErrors: ["조건 누락", "범위 조건 무시", "특수값 미검토"],
  },
  {
    category: "형식 요건",
    checkPoints: [
      "등호를 연속으로 사용하지 않았는가?",
      "단위를 표기했는가?",
      "최종 답을 명확히 표기했는가?",
    ],
    commonErrors: ["등호 연속 사용", "단위 누락", "최종답 미표기"],
  },
  {
    category: "계산 정확성",
    checkPoints: [
      "부호 처리가 정확한가?",
      "괄호 처리가 올바른가?",
      "약분/통분이 정확한가?",
    ],
    commonErrors: ["부호 실수", "괄호 처리 오류", "약분/통분 실수"],
  },
];

// ── 4주 전 학습 타임라인 ──
export interface TimelineWeek {
  week: string;
  title: string;
  tasks: string[];
}

export const FOUR_WEEK_TIMELINE: TimelineWeek[] = [
  {
    week: "4주 전",
    title: "계획 및 개념 점검",
    tasks: [
      "시험 범위 확인 및 학습 계획표 수립",
      "개념 전체 훑기 (빠르게 1회독)",
      "부족한 단원 파악",
    ],
  },
  {
    week: "3주 전",
    title: "개념 완성",
    tasks: [
      "교과서 2~3회독으로 개념 완벽 이해",
      "기본 유형 문제집 1회독",
      "공식 정리 노트 작성",
    ],
  },
  {
    week: "2주 전",
    title: "유형 및 기출",
    tasks: ["기출문제 분석 및 풀이", "응용/심화 문제 도전", "오답노트 본격 작성"],
  },
  {
    week: "1주 전",
    title: "마무리 및 실전",
    tasks: [
      "오답노트 총복습",
      "실전 모의 시험 (시간 제한)",
      "컨디션 조절 및 자신감 유지",
    ],
  },
];

// ── 단원별 흔한 실수 (제네릭 — question_type 기반) ──
export interface MistakeItem {
  type: string;
  description: string;
  prevention: string;
}

const QUESTION_TYPE_KO: Record<string, string> = {
  number: "수와 연산",
  algebra: "문자와 식",
  function: "함수",
  geometry: "기하",
  statistics: "확률과 통계",
};

/**
 * 영역(question_type) 집합 → 영역별 흔한 실수 유형.
 * mathlab generateGenericMistakes carry-over (영문 type → 한국어 영역 기반).
 */
export const genericMistakesByTypes = (
  types: string[],
): Array<{ topic: string; items: MistakeItem[] }> => {
  const set = new Set(types.map((t) => String(t).toLowerCase()));
  const out: Array<{ topic: string; items: MistakeItem[] }> = [];

  if (set.has("number") || set.has("algebra")) {
    out.push({
      topic: set.has("algebra")
        ? QUESTION_TYPE_KO.algebra
        : QUESTION_TYPE_KO.number,
      items: [
        {
          type: "계산 실수",
          description: "부호 처리 오류, 약분/통분 실수",
          prevention: "계산 중간 과정을 모두 적고 검산하기",
        },
        {
          type: "공식 오용",
          description: "전개/인수분해 공식 혼동",
          prevention: "공식 적용 전 형태 확인 + 전개 후 역검산",
        },
      ],
    });
  }
  if (set.has("geometry")) {
    out.push({
      topic: QUESTION_TYPE_KO.geometry,
      items: [
        {
          type: "개념 오해",
          description: "도형 성질 혼동, 조건 누락",
          prevention: "조건을 그림에 표시하고 성질을 하나씩 체크",
        },
      ],
    });
  }
  if (set.has("function")) {
    out.push({
      topic: QUESTION_TYPE_KO.function,
      items: [
        {
          type: "그래프 오독",
          description: "이동·대칭 방향 혼동",
          prevention: "그래프를 직접 그려 점·축 위치 확인",
        },
      ],
    });
  }
  if (set.has("statistics")) {
    out.push({
      topic: QUESTION_TYPE_KO.statistics,
      items: [
        {
          type: "경우 누락",
          description: "순열/조합 구분 오류, 중복 세기",
          prevention: "수형도·표로 체계적으로 세기",
        },
      ],
    });
  }
  if (out.length === 0) {
    out.push({
      topic: "공통",
      items: [
        {
          type: "단순 실수",
          description: "단순 계산 실수, 답 옮겨 적기 오류",
          prevention: "마지막에 답안지 전체를 한 번 더 검토",
        },
      ],
    });
  }
  return out;
};
