/**
 * 시험지 분석 (Phase N) — Sonnet 4.6 vision + prompt caching 서비스.
 *
 * mathlab `D:\mathlab\src\lib\exam-analysis\ai-engine.ts` 의 `analyzeExam`
 * 함수를 *기능 그대로* carry-over — 단 모델만 Gemini 3.1 Pro → Sonnet 4.6
 * 으로 교체. Anthropic 의 prompt caching 활용으로 약 80% 비용 절감.
 *
 * 흐름:
 *   1. buildExamAnalysisPrompt(grade, examCategory, hasEssay) → cacheable system
 *   2. buildExamScopeSuffix(examScope) → dynamic suffix (있을 때만)
 *   3. user content = [...page images (base64), 분석 요청 text]
 *   4. anthropic.messages.create({ system, messages, tools, tool_choice })
 *   5. extractToolUseInput → raw BasicAnalysisResult
 *   6. processAnalysisResult (4-tier 후처리)
 *   7. 반환 + cache 통계 로깅
 *
 * 사용 위치: `useExamAnalysis` 훅이 `analyzeExam(input)` 호출 (또는 Phase H
 * 마이그레이션 후 `analyzeExamViaApi` 로 Vercel function 경유).
 */

import { anthropic, SONNET_MODEL } from "./client";
import { SYSTEM_BLOCKS } from "./generate";
import { extractToolUseInput } from "./generate";
import {
  EXAM_ANALYSIS_TOOL,
  EXAM_ANALYSIS_TOOL_CHOICE,
} from "./examAnalysisSchema";
import {
  buildExamAnalysisPrompt,
  buildExamScopeSuffix,
} from "./examAnalysisPrompts";
import { processAnalysisResult } from "./examAnalysisPostProcess";
import { normalizeAnthropicUsage } from "@app/lib/pricing";
import type {
  AnalyzeExamInput,
  AnalyzeExamOutput,
  BasicAnalysisResult,
} from "@app/types/examAnalysis";

// ════════════════════════════════════════════════════════════════════
// §1. 이미지 base64 → Anthropic image block 변환
// ════════════════════════════════════════════════════════════════════

/** data URI ("data:image/jpeg;base64,...") → media_type + data 분리. */
const parseDataUri = (
  input: string,
): { media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } => {
  const m = input.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
  if (m) {
    return {
      media_type: m[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
      data: m[2],
    };
  }
  // raw base64 (no data URI prefix) — default to png
  return { media_type: "image/png", data: input };
};

// ════════════════════════════════════════════════════════════════════
// §2. analyzeExam — direct SDK 호출
// ════════════════════════════════════════════════════════════════════

const analyzeExamDirect = async (
  input: AnalyzeExamInput,
): Promise<AnalyzeExamOutput> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }
  if (!input.pageImages.length) {
    throw new Error("분석할 시험지 이미지가 없습니다");
  }

  // 1. Cacheable system prompt — 학년/과목/서술형 여부 기반
  const cacheableSystem = buildExamAnalysisPrompt({
    grade: input.grade,
    examCategory: input.examCategory,
    hasEssay: input.hasEssay,
  });

  // 2. Dynamic suffix — examScope 가 있을 때만 추가
  const scopeSuffix = buildExamScopeSuffix(input.examScope);

  // System blocks 구성:
  //   block 0 = 기존 SYSTEM_BLOCKS (COMMON_INSTRUCTIONS, 이미 caching 됨)
  //   block 1 = analysis system (cacheable, ~10k tokens)
  //   block 2 = examScope suffix (dynamic, 있을 때만)
  const systemBlocks: Array<{
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral" };
  }> = [
    ...SYSTEM_BLOCKS,
    {
      type: "text",
      text: cacheableSystem,
      cache_control: { type: "ephemeral" as const },
    },
  ];
  if (scopeSuffix) {
    systemBlocks.push({ type: "text", text: scopeSuffix });
  }

  // 3. User content = 페이지 이미지들 + 분석 지시
  const imageBlocks = input.pageImages.map((img) => {
    const { media_type, data } = parseDataUri(img);
    return {
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type,
        data,
      },
    };
  });

  const userContent = [
    ...imageBlocks,
    {
      type: "text" as const,
      text:
        "위 시험지 이미지를 분석하여 emit_exam_analysis 도구를 호출하세요.\n" +
        "모든 문항을 빠짐없이 분석하고, 5단계 난이도 + 단원 + 배점 + ai_comment 를 정확히 채우세요.",
    },
  ];

  // 4. Anthropic SDK 호출
  const response = await anthropic.messages.create(
    {
      model: SONNET_MODEL,
      max_tokens: 16000,
      temperature: 0.1,
      system: systemBlocks,
      messages: [{ role: "user", content: userContent }],
      tools: [EXAM_ANALYSIS_TOOL],
      tool_choice: EXAM_ANALYSIS_TOOL_CHOICE,
    },
    input.signal ? { signal: input.signal } : undefined,
  );

  // 5. tool_use input 추출
  const raw = extractToolUseInput<unknown>(response, EXAM_ANALYSIS_TOOL.name);

  // 6. 4-tier 후처리
  const result: BasicAnalysisResult = processAnalysisResult(raw);

  // 7. cache 통계 (DEV-only 로깅)
  const usage = (
    response as {
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    }
  ).usage;

  if (import.meta.env?.DEV) {
    console.debug(
      `[ai/examAnalysis] cache_read=${usage?.cache_read_input_tokens ?? 0} cache_create=${usage?.cache_creation_input_tokens ?? 0} input=${usage?.input_tokens ?? 0} output=${usage?.output_tokens ?? 0} questions=${result.questions.length}`,
    );
  }

  return {
    result,
    modelUsed: SONNET_MODEL,
    _usage: usage,
  };
};

// normalizeAnthropicUsage 는 caller (Vercel function _logUsage) 에서 호출.
// 직접 호출 path 에서 사용 안 함 — type 충돌 회피.
void normalizeAnthropicUsage;

// ════════════════════════════════════════════════════════════════════
// §3. USE_API switch — production 빌드는 Vercel function 경유
// ════════════════════════════════════════════════════════════════════

// Phase N-3 에서 추가 예정: analyzeExamViaApi (fetch wrapper) 가 prod 에서 활성.
// 현재는 direct SDK 만 — N-2 검증용.
const USE_API: boolean =
  typeof window !== "undefined" &&
  typeof import.meta !== "undefined" &&
  Boolean(
    import.meta.env?.PROD || import.meta.env?.VITE_USE_API === "true",
  );

/**
 * 시험지 분석 메인 entry — direct SDK / fetch wrapper 자동 분기.
 *
 * @example
 * const { result, modelUsed, _usage } = await analyzeExam({
 *   pageImages: [pageImg1, pageImg2],
 *   grade: "중3",
 *   examCategory: null,
 *   hasEssay: true,
 *   examScope: ["중3 수학 > 이차방정식"],
 * });
 */
export const analyzeExam = async (
  input: AnalyzeExamInput,
): Promise<AnalyzeExamOutput> => {
  if (USE_API) {
    // N-3 추가 시 동적 import (`./api/examAnalysis`) 로 fetch wrapper 호출
    throw new Error(
      "[examAnalysis] USE_API 경로는 Phase N-3 (Vercel function) 후 활성화됩니다",
    );
  }
  return analyzeExamDirect(input);
};

// Re-export — 테스트 / 토큰 측정 스크립트 등에서 직접 호출.
export { analyzeExamDirect };
export type { AnalyzeExamInput, AnalyzeExamOutput };
