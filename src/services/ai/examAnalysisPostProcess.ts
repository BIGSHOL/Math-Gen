/**
 * 시험지 분석 (Phase N) — 후처리 4종.
 *
 * mathlab `D:\mathlab\src\lib\exam-analysis\ai-engine.ts` 의 post-processing
 * 함수들을 *기능 그대로* carry-over. 다른 모델 (Sonnet vs Gemini) 의 미세한
 * 출력 차이를 *동일 schema 로 정규화* — UI 차트가 안전하게 렌더.
 *
 * 흐름:
 *   AI 응답 (Anthropic tool_use input)
 *     ↓
 *   validateBasicResult — structural check
 *     ↓
 *   TYPE_TO_STANDARD / TYPE_TO_DOMAIN 매핑 (AI emit 한 값 표준화)
 *     ↓
 *   fillNumberGaps — 누락 번호 placeholder 자동 삽입
 *     ↓
 *   validateAndPenalize — 배점 합계 ≠ 총점 시 confidence -20%
 *     ↓
 *   recomputeSummary — questions 배열에서 summary 직접 재계산 (AI summary 무시)
 *     ↓
 *   최종 BasicAnalysisResult
 */

import type {
  AbilityDomain,
  AnalysisSummary,
  AnalyzedQuestion,
  BasicAnalysisResult,
  DifficultyBand,
  DifficultyDistribution,
  DomainDistribution,
  FormatDistribution,
  QuestionFormat,
  QuestionType,
  TypeDistribution,
} from "@app/types/examAnalysis";

// ════════════════════════════════════════════════════════════════════
// §1. 표준화 매핑 (mathlab constants.ts 의 TYPE_TO_STANDARD / TYPE_TO_DOMAIN)
// ════════════════════════════════════════════════════════════════════

/** AI 가 emit 한 question_type 값을 표준 5영역으로 매핑. */
const TYPE_TO_STANDARD: Record<string, QuestionType> = {
  number: "number",
  algebra: "algebra",
  function: "function",
  geometry: "geometry",
  statistics: "statistics",
  // 대체 표기 흡수
  수와연산: "number",
  대수: "algebra",
  함수: "function",
  기하: "geometry",
  통계: "statistics",
  // ability_domain 값을 question_type 으로 잘못 emit 했을 때 fallback
  calculation: "algebra",
  understanding: "algebra",
  reasoning: "algebra",
  problem_solving: "algebra",
};

/** AI 가 ability_domain 미입력 또는 잘못 emit 시 question_type 기반 추정. */
const TYPE_TO_DOMAIN: Record<string, AbilityDomain> = {
  number: "calculation",
  algebra: "calculation",
  function: "understanding",
  geometry: "problem_solving",
  statistics: "reasoning",
  // 대소문자 호환
  CALCULATION: "calculation",
  UNDERSTANDING: "understanding",
  REASONING: "reasoning",
  PROBLEM_SOLVING: "problem_solving",
};

// ════════════════════════════════════════════════════════════════════
// §2. validateBasicResult — structural check
// ════════════════════════════════════════════════════════════════════

/**
 * AI 응답이 BasicAnalysisResult 구조 갖췄는지 점검.
 * mathlab ai-engine.ts:432-446 동일.
 */
export const validateBasicResult = (
  raw: unknown,
): raw is { exam_info: unknown; summary: unknown; questions: unknown[] } => {
  if (!raw || typeof raw !== "object") return false;
  const r = raw as Record<string, unknown>;
  if (!r.exam_info || typeof r.exam_info !== "object") return false;
  if (!r.summary || typeof r.summary !== "object") return false;
  if (!Array.isArray(r.questions)) return false;
  const examInfo = r.exam_info as Record<string, unknown>;
  if (typeof examInfo.total_questions !== "number") return false;
  return true;
};

// ════════════════════════════════════════════════════════════════════
// §3. normalizeQuestion — 한 문항의 enum / null / 매핑 정규화
// ════════════════════════════════════════════════════════════════════

const CONFIDENCE_MEDIUM = 0.75;

const normalizeQuestion = (
  raw: Record<string, unknown>,
  idx: number,
): AnalyzedQuestion => {
  const rawType = String(raw.question_type ?? "algebra");
  const standardType =
    TYPE_TO_STANDARD[rawType.toLowerCase()] ??
    TYPE_TO_STANDARD[rawType] ??
    "algebra";

  const rawDomain = raw.ability_domain;
  const abilityDomain: AbilityDomain | null = (() => {
    if (rawDomain === null || rawDomain === undefined) {
      return TYPE_TO_DOMAIN[standardType] ?? "calculation";
    }
    const lower = String(rawDomain).toLowerCase();
    return (
      TYPE_TO_DOMAIN[lower] ??
      (["calculation", "understanding", "reasoning", "problem_solving"].includes(
        lower,
      )
        ? (lower as AbilityDomain)
        : TYPE_TO_DOMAIN[standardType] ?? "calculation")
    );
  })();

  const rawDiff = String(raw.difficulty ?? "1");
  const difficulty: DifficultyBand = (["1", "2", "3", "4", "5"].includes(rawDiff)
    ? rawDiff
    : "1") as DifficultyBand;

  const rawFormat = raw.question_format;
  const questionFormat: QuestionFormat | null =
    rawFormat === "objective" ||
    rawFormat === "short_answer" ||
    rawFormat === "essay"
      ? rawFormat
      : null;

  return {
    question_number: (raw.question_number as number | string) ?? idx + 1,
    question_format: questionFormat,
    difficulty,
    difficulty_reason:
      typeof raw.difficulty_reason === "string"
        ? raw.difficulty_reason
        : null,
    question_type: standardType,
    ability_domain: abilityDomain,
    points: typeof raw.points === "number" ? raw.points : null,
    topic: typeof raw.topic === "string" ? raw.topic : null,
    ai_comment: typeof raw.ai_comment === "string" ? raw.ai_comment : null,
    confidence:
      typeof raw.confidence === "number" ? raw.confidence : CONFIDENCE_MEDIUM,
    confidence_reason:
      typeof raw.confidence_reason === "string" ? raw.confidence_reason : null,
  };
};

// ════════════════════════════════════════════════════════════════════
// §4. fillNumberGaps — 누락 번호 placeholder 자동 삽입
// mathlab ai-engine.ts:324-428 carry
// ════════════════════════════════════════════════════════════════════

const fillNumberGaps = (result: BasicAnalysisResult): BasicAnalysisResult => {
  const { exam_info, questions } = result;

  // 객관식/단답형(숫자 번호) 문항만 갭 감지 대상
  const numericQuestions = questions.filter((q) => {
    if (q.question_format === "essay") return false;
    const n =
      typeof q.question_number === "string"
        ? parseInt(q.question_number, 10)
        : q.question_number;
    return Number.isFinite(n);
  });

  if (numericQuestions.length < 2) return result;

  const nums = numericQuestions
    .map((q) => Number(q.question_number))
    .sort((a, b) => a - b);
  const min = nums[0];
  const max = nums[nums.length - 1];
  const existing = new Set(nums);
  const missing: number[] = [];
  for (let n = min; n <= max; n++) {
    if (!existing.has(n)) missing.push(n);
  }
  if (missing.length === 0) return result;

  // 객관식 평균 점수 (정밀 추측 가능 시)
  const objWithPoints = numericQuestions.filter(
    (q) => q.points !== null && q.points > 0,
  );
  const objAvg =
    objWithPoints.length > 0
      ? objWithPoints.reduce((s, q) => s + (q.points ?? 0), 0) /
        objWithPoints.length
      : 0;

  const currentSum = questions.reduce((s, q) => s + (q.points ?? 0), 0);
  const totalPoints = exam_info.total_points || 100;
  const diff = totalPoints - currentSum;

  let perGap: number | null = null;
  let reason = "판독 실패 — 번호만 인식";
  if (objAvg > 0 && missing.length > 0 && diff > 0) {
    const expected = objAvg * missing.length;
    const tolerance = expected * 0.5;
    const lower = expected - tolerance;
    const upper = expected + tolerance;
    if (diff >= lower && diff <= upper) {
      perGap = Math.round(diff / missing.length);
    }
  }

  const placeholders: AnalyzedQuestion[] = missing.map((n) => ({
    question_number: n,
    question_format: "objective" as QuestionFormat,
    difficulty: "1" as DifficultyBand,
    difficulty_reason: null,
    question_type: "algebra" as QuestionType,
    ability_domain: null,
    points: perGap,
    topic: null,
    ai_comment:
      "⚠️ 이 문항은 자동 분석에 실패했습니다. 시험지를 확인하고 정보를 직접 입력해 주세요.",
    confidence: 0,
    confidence_reason: reason,
  }));

  // 번호 순으로 정렬 (서술형은 뒤)
  const merged = [...questions, ...placeholders];
  const sorted = merged.sort((a, b) => {
    const aIsEssay = a.question_format === "essay";
    const bIsEssay = b.question_format === "essay";
    if (aIsEssay && !bIsEssay) return 1;
    if (!aIsEssay && bIsEssay) return -1;
    const aNum =
      typeof a.question_number === "string"
        ? parseInt(a.question_number, 10) || 0
        : a.question_number;
    const bNum =
      typeof b.question_number === "string"
        ? parseInt(b.question_number, 10) || 0
        : b.question_number;
    return aNum - bNum;
  });

  return {
    ...result,
    exam_info: { ...exam_info, total_questions: sorted.length },
    questions: sorted,
  };
};

// ════════════════════════════════════════════════════════════════════
// §5. validateAndPenalize — 배점 합계 ≠ 총점 시 confidence 페널티
// mathlab ai-engine.ts:276-304 carry
// ════════════════════════════════════════════════════════════════════

const validateAndPenalize = (result: BasicAnalysisResult): BasicAnalysisResult => {
  const { exam_info, questions } = result;
  const questionsWithPoints = questions.filter(
    (q) => q.points !== null && (q.points as number) > 0,
  );
  const pointsSum = questionsWithPoints.reduce(
    (sum, q) => sum + (q.points ?? 0),
    0,
  );

  let nextQuestions = questions;

  // 배점 합계 ≠ 총점 → 페널티
  if (
    exam_info.total_points > 0 &&
    pointsSum > 0 &&
    pointsSum !== exam_info.total_points
  ) {
    const ratio =
      Math.abs(pointsSum - exam_info.total_points) / exam_info.total_points;
    const penalty = Math.min(ratio * 0.3, 0.2);
    nextQuestions = nextQuestions.map((q) => ({
      ...q,
      confidence: Math.max(0, Number((q.confidence - penalty).toFixed(3))),
    }));
  }

  // 문항 수 불일치 → 추가 페널티
  if (
    exam_info.total_questions > 0 &&
    nextQuestions.length !== exam_info.total_questions
  ) {
    const penalty = 0.1;
    nextQuestions = nextQuestions.map((q) => ({
      ...q,
      confidence: Math.max(0, Number((q.confidence - penalty).toFixed(3))),
    }));
  }

  return { ...result, questions: nextQuestions };
};

// ════════════════════════════════════════════════════════════════════
// §6. recomputeSummary — questions 에서 summary 직접 재계산
// mathlab ai-engine.ts:512+ carry — AI summary 부정확 방지
// ════════════════════════════════════════════════════════════════════

const recomputeSummary = (
  questions: AnalyzedQuestion[],
): AnalysisSummary & { _formatDist: FormatDistribution } => {
  const diffDist: DifficultyDistribution = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
  const typeDist: TypeDistribution = {
    number: 0,
    algebra: 0,
    function: 0,
    geometry: 0,
    statistics: 0,
  };
  const domainDist: DomainDistribution = {
    calculation: 0,
    understanding: 0,
    reasoning: 0,
    problem_solving: 0,
  };
  const formatDist: FormatDistribution = {
    objective: 0,
    short_answer: 0,
    essay: 0,
  };

  for (const q of questions) {
    const d = q.difficulty as DifficultyBand;
    if (d in diffDist) diffDist[d]++;
    if (q.question_type in typeDist) typeDist[q.question_type]++;
    if (q.ability_domain && q.ability_domain in domainDist) {
      domainDist[q.ability_domain]++;
    }
    if (q.question_format && q.question_format in formatDist) {
      formatDist[q.question_format]++;
    }
  }

  // average_difficulty: 가장 많은 난이도 (동률이면 낮은 쪽)
  let avgDiff: DifficultyBand = "1";
  let maxDiffCount = -1;
  for (const d of ["1", "2", "3", "4", "5"] as const) {
    if (diffDist[d] > maxDiffCount) {
      maxDiffCount = diffDist[d];
      avgDiff = d;
    }
  }

  // dominant_type: 가장 많은 영역
  let dominantType: QuestionType = "algebra";
  let maxTypeCount = -1;
  for (const t of [
    "number",
    "algebra",
    "function",
    "geometry",
    "statistics",
  ] as const) {
    if (typeDist[t] > maxTypeCount) {
      maxTypeCount = typeDist[t];
      dominantType = t;
    }
  }

  return {
    difficulty_distribution: diffDist,
    type_distribution: typeDist,
    domain_distribution: domainDist,
    average_difficulty: avgDiff,
    dominant_type: dominantType,
    _formatDist: formatDist,
  };
};

// ════════════════════════════════════════════════════════════════════
// §7. processAnalysisResult — 전체 후처리 파이프라인
// ════════════════════════════════════════════════════════════════════

/**
 * AI 가 emit 한 BasicAnalysisResult raw 를 받아 최종 정규화된 result 반환.
 * 4-tier 후처리: validate → normalize → fillGaps → validatePoints → recomputeSummary.
 *
 * mathlab analyzeExam (ai-engine.ts:457-) 의 핵심 흐름.
 */
export const processAnalysisResult = (raw: unknown): BasicAnalysisResult => {
  if (!validateBasicResult(raw)) {
    throw new Error(
      "AI 분석 결과가 올바른 구조가 아닙니다. exam_info, summary, questions 필드 필요.",
    );
  }

  const r = raw as {
    exam_info: Record<string, unknown>;
    summary: Record<string, unknown>;
    questions: Record<string, unknown>[];
  };

  // 1. normalize each question
  const questions = r.questions.map(normalizeQuestion);

  // 2. exam_info 기본값 채우기
  const formatDistRaw = r.exam_info.format_distribution as
    | Record<string, number>
    | undefined;
  const examInfo = {
    total_questions:
      typeof r.exam_info.total_questions === "number"
        ? r.exam_info.total_questions
        : questions.length,
    total_points:
      typeof r.exam_info.total_points === "number" ? r.exam_info.total_points : 100,
    school_name:
      typeof r.exam_info.school_name === "string" ? r.exam_info.school_name : null,
    format_distribution: {
      objective: formatDistRaw?.objective ?? 0,
      short_answer: formatDistRaw?.short_answer ?? 0,
      essay: formatDistRaw?.essay ?? 0,
    },
  };

  let result: BasicAnalysisResult = {
    exam_info: examInfo,
    summary: {
      difficulty_distribution: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
      type_distribution: {
        number: 0,
        algebra: 0,
        function: 0,
        geometry: 0,
        statistics: 0,
      },
      domain_distribution: {
        calculation: 0,
        understanding: 0,
        reasoning: 0,
        problem_solving: 0,
      },
      average_difficulty: "1",
      dominant_type: "algebra",
    },
    questions,
  };

  // 3. 누락 번호 placeholder
  result = fillNumberGaps(result);

  // 4. 배점 페널티
  result = validateAndPenalize(result);

  // 5. summary 재계산 (AI summary 무시)
  const recomputed = recomputeSummary(result.questions);
  const { _formatDist, ...summary } = recomputed;
  result = {
    ...result,
    exam_info: { ...result.exam_info, format_distribution: _formatDist },
    summary,
  };

  return result;
};

// ════════════════════════════════════════════════════════════════════
// §8. parseJsonResponse — Anthropic tool_use 가 strict JSON 보장하지만
// 폴백 경로 (텍스트 응답) 위해 3-tier fallback 제공.
// mathlab ai-engine.ts:66-129 carry.
// ════════════════════════════════════════════════════════════════════

/**
 * AI 응답 텍스트 → JSON.parse. 3-tier fallback (코드펜스 / trailing comma /
 * invalid escape). mathlab 의 강력한 복구 로직 그대로.
 *
 * Anthropic tool_use 응답은 *이미 JSON 객체* 라 이 함수 거의 사용 X. 단
 * fallback (모델이 도구 호출 안 하고 텍스트 emit) 시 사용.
 */
export const parseJsonResponse = <T = unknown>(text: string): T => {
  let cleaned = text.trim();

  // ```json ... ``` 또는 ``` ... ``` 제거
  const codeFenceRegex = /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/;
  const match = cleaned.match(codeFenceRegex);
  if (match) cleaned = match[1].trim();
  if (cleaned.startsWith("```")) {
    const lines = cleaned.split("\n");
    lines.shift();
    if (lines[lines.length - 1]?.trim() === "```") lines.pop();
    cleaned = lines.join("\n").trim();
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // 1단계: 잘린 JSON 구조 복구 + trailing comma 제거 + undefined → null
    let fixed = cleaned;
    const openQuotes = (fixed.match(/"/g) || []).length;
    if (openQuotes % 2 !== 0) fixed += '"';
    const openBrackets =
      (fixed.match(/\[/g) || []).length - (fixed.match(/\]/g) || []).length;
    const openBraces =
      (fixed.match(/\{/g) || []).length - (fixed.match(/\}/g) || []).length;
    for (let i = 0; i < openBrackets; i++) fixed += "]";
    for (let i = 0; i < openBraces; i++) fixed += "}";
    fixed = fixed.replace(/,\s*([}\]])/g, "$1");
    fixed = fixed.replace(/:\s*undefined\b/g, ": null");
    try {
      return JSON.parse(fixed) as T;
    } catch {
      // 2단계: invalid escape character 자동 정정 (LaTeX 백슬래시 보존)
      let fixed2 = fixed.replace(/\\(?!["\\/bfnrtu])/g, "\\\\");
      fixed2 = fixed2.replace(/"((?:[^"\\]|\\.)*)"/g, (_m, inner: string) => {
        const escaped = inner
          .replace(/\r\n/g, "\\n")
          .replace(/\n/g, "\\n")
          .replace(/\r/g, "\\n")
          .replace(/\t/g, "\\t");
        return `"${escaped}"`;
      });
      try {
        const parsed = JSON.parse(fixed2) as T;
        if (import.meta.env?.DEV) {
          console.warn(
            "[examAnalysisPostProcess] JSON 파싱: invalid escape 정정 후 성공",
          );
        }
        return parsed;
      } catch (e3) {
        throw new Error(
          `AI 응답 JSON 파싱 실패: ${e3 instanceof Error ? e3.message : String(e3)}\n원본: ${text.slice(0, 500)}`,
        );
      }
    }
  }
};
