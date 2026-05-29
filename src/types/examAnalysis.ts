/**
 * 시험지 분석 (Phase N) — TypeScript 타입.
 *
 * mathlab `D:\mathlab\src\lib\exam-analysis\types.ts` 의 BasicAnalysisResult
 * 를 그대로 carry-over. 단 *blank paper (기출 원본) 만* 분석하므로 student
 * 전용 4필드 (is_correct / student_answer / earned_points / error_type) 제거.
 *
 * 출력 schema 는 mathlab 의 prompt-builder.ts:551-695 의 JSON 예시와 1:1 동일.
 * 후처리에서 정규화 거친 *최종 schema* — mathg-gen 의 UI / DB 가 이 shape 만 받음.
 */

/** 5단계 난이도 — 문자열 "1"~"5". H2 (HARD CONSTRAINT) 강제. */
export type DifficultyBand = "1" | "2" | "3" | "4" | "5";

/** 5개 수학 영역 — H3 강제. */
export type QuestionType =
  | "number"
  | "algebra"
  | "function"
  | "geometry"
  | "statistics";

/** 4개 사고력 영역 — H4 강제 (대문자 영문). */
export type AbilityDomain =
  | "calculation"
  | "understanding"
  | "reasoning"
  | "problem_solving";

/** 문항 형식 (3종). */
export type QuestionFormat = "objective" | "short_answer" | "essay";

/**
 * 한 문항의 분석 결과 (10필드, mathlab 의 14필드 중 student 4 제거).
 *
 * mathlab 의 AnalyzedQuestion 과 *서식 동일* — 단원 UI 가 같은 차트 / 표 로 렌더.
 */
export interface AnalyzedQuestion {
  /** 시험지에 표기된 번호 (소문제: "1-1", "서술형1" 등 문자열 가능). */
  question_number: number | string;
  /** 문항 형식. AI 가 판단 불가하면 null. */
  question_format: QuestionFormat | null;
  /** 5단계 난이도 — 문자열 "1"~"5". 갭 placeholder 의 경우 "1" default. */
  difficulty: DifficultyBand;
  /** 난이도 판정 이유 — 최대 15자 (예: "3단계 풀이", "함정 변형"). */
  difficulty_reason: string | null;
  /** 5개 수학 영역. */
  question_type: QuestionType;
  /** 4개 사고력 영역 — 풀이에 요구되는 능력. */
  ability_domain: AbilityDomain | null;
  /** 배점 — 불분명 시 null. */
  points: number | null;
  /** "과목명 > 대단원 > 소단원" 형식 (예: "중3 수학 > 이차방정식 > 이차방정식의 풀이"). */
  topic: string | null;
  /** 2문장, 존댓말(~입니다/~합니다), 각 20~40자. 1문장=출제 의도, 2문장=풀이 포인트. */
  ai_comment: string | null;
  /** 0.0~1.0. mathlab 의 5단계 매핑 (H15) — 분포 강제 (H17). */
  confidence: number;
  /** 신뢰도 판정 근거 — 최대 20자. confidence ↔ value 매핑 (H16) 강제. */
  confidence_reason: string | null;
}

/** 난이도 분포 — "1"~"5" 각 카운트. 합계 = total_questions. */
export interface DifficultyDistribution {
  "1": number;
  "2": number;
  "3": number;
  "4": number;
  "5": number;
}

/** 영역 분포 — 5개 수학 영역 각 카운트. 합계 = total_questions. */
export interface TypeDistribution {
  number: number;
  algebra: number;
  function: number;
  geometry: number;
  statistics: number;
}

/** 사고력 분포 — 4개 영역 각 카운트 (UI 레이더 차트용). */
export interface DomainDistribution {
  calculation: number;
  understanding: number;
  reasoning: number;
  problem_solving: number;
}

/** 문항 형식 분포 — 합계 = total_questions. */
export interface FormatDistribution {
  objective: number;
  short_answer: number;
  essay: number;
}

/** 분석 요약 — UI 차트 4종 source. */
export interface AnalysisSummary {
  difficulty_distribution: DifficultyDistribution;
  type_distribution: TypeDistribution;
  /** 사고력 분포 — mathlab 에는 별도 없지만 후처리에서 questions 으로부터 재계산. */
  domain_distribution: DomainDistribution;
  /** 가장 많은 난이도 (동률이면 낮은 쪽). */
  average_difficulty: DifficultyBand;
  /** 가장 많은 영역. */
  dominant_type: QuestionType;
}

/** 시험지 메타 정보. */
export interface ExamInfo {
  total_questions: number;
  total_points: number;
  school_name: string | null;
  format_distribution: FormatDistribution;
}

/** Phase N 의 최종 분석 결과 — DB exam_analyses 의 JSONB 저장 형태. */
export interface BasicAnalysisResult {
  exam_info: ExamInfo;
  summary: AnalysisSummary;
  questions: AnalyzedQuestion[];
}

/**
 * analyzeExam() 호출 input.
 *
 * 이미지 base64 가 mathlab 동일 — Sonnet 4.6 vision API 에 직접 전달.
 * grade / examCategory / hasEssay 가 prompt 분기 (학년별 카탈로그 + 서술형
 * 가이드). examScope 는 출제범위 ABSOLUTE 룰 추가용.
 */
export interface AnalyzeExamInput {
  /** 페이지별 base64 이미지 (data URI 또는 순수 base64). */
  pageImages: string[];
  /** "중1" | "중2" | "중3" | "고1" | "고2" | "고3" — mathlab 의 grade_level. */
  grade: string;
  /** "공통수학1" | "대수" | "확률과 통계" 등 — 고등학교 선택 과목. null 가능. */
  examCategory: string | null;
  /** 서술형 문항 포함 여부 — ESSAY_ANALYSIS_FULL_GUIDE 분기. */
  hasEssay: boolean;
  /** 출제범위 — 있으면 ABSOLUTE 룰 추가. 예: ["중3 수학 > 이차방정식"]. */
  examScope?: string[] | null;
  /** cancel signal — fan-out hook 의 dispatched Set 동기. */
  signal?: AbortSignal;
}

/** analyzeExam() 반환. usage 는 Anthropic SDK 응답의 cache 통계. */
export interface AnalyzeExamOutput {
  result: BasicAnalysisResult;
  modelUsed: string;
  _usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// ════════════════════════════════════════════════════════════════════
// §3. Commentary (V3/V4) — Phase N+3 / N+5
// ════════════════════════════════════════════════════════════════════

/** 주목할 만한 문항 — AI 가 특정 번호 + 자연어 코멘트. */
export interface NotableQuestion {
  question_number: number | string;
  comment: string;
}

/** 단원별 지도 권장 — 우선순위 1~5. */
export interface TeachingRecommendation {
  topic: string;
  priority: number;
  reason: string;
}

/** 점수 전략 — 등급 + 목표 + 포인트. */
export interface ScoreStrategy {
  grade: string;
  target: string;
  strategy?: string;
  points?: string[];
}

/**
 * Commentary 결과 (mathlab `CommentaryResult` carry-over).
 *
 * 두 영역:
 *  - 기본 (overall_comment / strength / improvement / notable / teaching) — Phase N+3 활성
 *  - V4 학원 블로그 (v4_*) — Phase N+5, *비활성 상태* (사용자 결정 2026-05-28)
 *
 * V3 (블로그 헤드라인 + Q&A) carry-over 안 함 (사용자 결정).
 */
export interface CommentaryResult {
  // ── 기본 (Phase N+3 활성) ──
  overall_comment?: string;
  exam_characteristics?: string[];
  score_strategy?: string;
  score_strategies?: ScoreStrategy[];
  strength_areas?: string[];
  improvement_areas?: string[];
  notable_questions?: NotableQuestion[];
  teaching_recommendations?: TeachingRecommendation[];
  /** 주변 학교 비교 (Phase N+6) — 사용자 입력 메모 근거. 메모 없으면 undefined. */
  nearby_comparison?: string;
  /** 이전 연도 비교 (Phase N+6) — 사용자 입력 메모 근거. 메모 없으면 undefined. */
  year_comparison?: string;
  study_priority?: TeachingRecommendation[];
  encouragement?: string;

  /**
   * 학습 대책 — mathlab 의 curriculum-strategies (13K 고정 데이터) 를 AI 생성으로
   * 대체 (사용자 결정 2026-05-29). Sonnet 이 시험지별 학년연계/킬러/단원실수/
   * 시간팁 생성. 없으면 (구 분석) StudyStrategySection 이 derived fallback.
   */
  study_strategy?: {
    /** 선수학습 연계 — 이 단원을 위해 복습해야 할 이전 학년 개념. */
    grade_connections?: Array<{
      unit: string; // 현재 단원
      prerequisite: string; // 선수 개념
      importance: "critical" | "high" | "recommended";
      warning: string; // 1문장
    }>;
    /** 킬러 문항 함정 — 고난도 문항의 전형적 함정 + 대응. */
    killer_patterns?: Array<{
      unit: string;
      trap: string; // 함정 설명 1문장
      solution: string; // 대응 전략 1문장
    }>;
    /** 단원별 자주 하는 실수 + 예방. */
    common_mistakes?: Array<{
      topic: string;
      mistake: string;
      prevention: string;
    }>;
    /** 시험 시간 배분 팁 (빠르게 / 주의 / 절약). */
    time_tips?: {
      quick: string[];
      caution: string[];
      saving: string[];
    };
  };

  // ── V4 학원 블로그 (Phase N+5, 비활성 상태로 추가) ──
  v4_exam_overview?: {
    title: string;
    grade: string;
    school?: string | null;
    range: string;
    total_questions: number;
    total_points: number;
    avg_difficulty_label: string;
    peak_difficulty: string;
    essay_summary?: string;
    expected_grade_cut?: string;
    one_liner: string;
  };
  v4_intro?: string;
  v4_academy_strategy?: Array<{ title: string; body: string }>;
  v4_difficulty_rows?: Array<{
    question_number: string | number;
    topic: string;
    sub_topic?: string;
    difficulty: DifficultyBand;
    points: number;
    analysis_short?: string;
  }>;
  v4_exam_features?: { headline: string; body: string };
  v4_main_analysis?: Array<{ heading: string; body: string }>;
  v4_previous_comparison?: { headline: string; body: string };
  v4_key_questions?: Array<{
    question_number: string | number;
    title: string;
    body: string;
  }>;
  v4_final_strategy?: Array<{
    area: string;
    current_status: string;
    action: string;
  }>;
}

/** analyzeCommentary() input — 기본 분석 결과 + 학년 등 메타. */
export interface AnalyzeCommentaryInput {
  /** 기본 분석 결과 (analyzeExam 후) — questions/summary/exam_info. */
  basic: BasicAnalysisResult;
  /** 한국어 학년 ("중1"~"고3"). */
  grade: string;
  /** 고등학교 선택 과목 (있으면). */
  examCategory?: string | null;
  /** 학교명 (있으면 — 학교 비교 Q&A 활성화). */
  schoolName?: string | null;
  /** 시험명 (예: "1학기 중간고사"). */
  examName?: string | null;
  /**
   * 주변 학교 비교 메모 (사용자 입력 — Phase N+6). 있으면 nearby_comparison 생성.
   * corpus 없음 → AI 는 *이 메모에 담긴 정보만* 근거로 정리 (학교명·점수 fabrication 금지).
   */
  nearbyComparisonNote?: string | null;
  /**
   * 이전 연도 비교 메모 (사용자 입력 — Phase N+6). 있으면 year_comparison 생성.
   * 작년 평균/경향 등 사용자가 아는 정보. AI 는 이 메모만 근거로 정리.
   */
  yearComparisonNote?: string | null;
  /** cancel signal. */
  signal?: AbortSignal;
}

/** analyzeCommentary() 반환. */
export interface AnalyzeCommentaryOutput {
  result: CommentaryResult;
  modelUsed: string;
  _usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// ════════════════════════════════════════════════════════════════════
// §4. DB record
// ════════════════════════════════════════════════════════════════════

/** DB row → 클라이언트 hydrate 시 사용. exam_analyses 테이블 매핑. */
export interface ExamAnalysisRecord {
  id: string;
  test_id: string;
  user_id: string;
  tenant_id: string | null;
  exam_info: ExamInfo;
  summary: AnalysisSummary;
  questions: AnalyzedQuestion[];
  model: string;
  input_page_count: number;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  /** Commentary (V3 + V4) — Phase N+3/N+5. graceful fallback (컬럼 없으면 undefined). */
  commentary?: CommentaryResult | null;
  created_at: string;
  updated_at: string;
}
