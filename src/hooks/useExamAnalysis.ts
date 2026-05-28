/**
 * 시험지 분석 fan-out hook (Phase N).
 *
 * 사용 패턴:
 *   const { record, inflight, error, trigger } = useExamAnalysis(testId, pages);
 *   - mount 시 fetchExamAnalysis(testId) 자동 → store set
 *   - trigger() 호출 시 페이지 이미지 base64 수집 → analyzeExam → upsert → store update
 *
 * fan-out 패턴 (CLAUDE.md §1-6-b): in-flight Set 멤버십만 cancel 신호. *AbortController 금지*.
 */

import { useCallback, useEffect, useRef } from "react";
import { analyzeExam } from "@app/services/ai/examAnalysis";
import { analyzeCommentary } from "@app/services/ai/examCommentary";
import {
  fetchExamAnalysis,
  upsertExamAnalysis,
} from "@app/services/api/examAnalyses";
import { friendlyError } from "@app/lib/friendlyError";
import { useExamAnalysisStore } from "@app/stores/examAnalysisStore";
import type { ExamAnalysisRecord } from "@app/types/examAnalysis";

export interface UseExamAnalysisInput {
  testId: string | null;
  /** 시험지의 페이지 이미지 (base64). pages 가 ready 안 됐으면 빈 배열. */
  pageImages: string[];
  /** 시험지 학년 — "중1"~"고3" 또는 enum 형태. */
  grade: string;
  /** 선택 과목 (고등학교) — 공통수학1/대수 등. */
  examCategory: string | null;
  /** 서술형 문항 포함 여부 — prompt 의 ESSAY_GUIDE 분기. */
  hasEssay: boolean;
  /** 출제범위 — 있으면 ABSOLUTE 룰 추가. */
  examScope?: string[] | null;
}

export interface UseExamAnalysisOutput {
  /** 현재 시험지의 분석 결과 (없으면 null, 미조회면 undefined). */
  record: ExamAnalysisRecord | null | undefined;
  /** 분석 in-flight. */
  inflight: boolean;
  /** 에러 메시지. */
  error: string | undefined;
  /** "분석 시작" / "재분석" 트리거. */
  trigger: () => void;
  /** 에러 clear. */
  clearError: () => void;
}

export const useExamAnalysis = (
  input: UseExamAnalysisInput,
): UseExamAnalysisOutput => {
  const { testId, pageImages, grade, examCategory, hasEssay, examScope } =
    input;

  const record = useExamAnalysisStore((s) =>
    testId ? s.byTest[testId] : undefined,
  );
  const inflight = useExamAnalysisStore((s) =>
    testId ? s.inflight[testId] ?? false : false,
  );
  const error = useExamAnalysisStore((s) =>
    testId ? s.errors[testId] : undefined,
  );
  const setAnalysis = useExamAnalysisStore((s) => s.setAnalysis);
  const setInflight = useExamAnalysisStore((s) => s.setInflight);
  const setError = useExamAnalysisStore((s) => s.setError);
  const clearError = useExamAnalysisStore((s) => s.clearError);

  // fetch 한 testId 추적 — 같은 id 중복 fetch 회피
  const fetchedRef = useRef<Set<string>>(new Set());

  // mount / testId 변경 시 fetch
  useEffect(() => {
    if (!testId) return;
    if (fetchedRef.current.has(testId)) return;
    if (record !== undefined) return; // 이미 store 에 있음

    fetchedRef.current.add(testId);
    void fetchExamAnalysis(testId).then((rec) => {
      setAnalysis(testId, rec);
    });
  }, [testId, record, setAnalysis]);

  const trigger = useCallback(() => {
    if (!testId) return;
    if (inflight) return;
    if (pageImages.length === 0) {
      setError(testId, "페이지 이미지를 불러올 수 없습니다.");
      return;
    }
    if (!grade) {
      setError(testId, "학년 정보가 필요합니다.");
      return;
    }

    setInflight(testId, true);
    setError(testId, undefined);

    void (async () => {
      try {
        const output = await analyzeExam({
          pageImages,
          grade,
          examCategory,
          hasEssay,
          examScope,
        });
        const cacheReadTokens =
          (output._usage as { cache_read_input_tokens?: number } | undefined)
            ?.cache_read_input_tokens ?? null;
        const cacheWriteTokens =
          (output._usage as {
            cache_creation_input_tokens?: number;
          } | undefined)?.cache_creation_input_tokens ?? null;

        // Phase N+3: 기본 분석 후 commentary 도 호출 (graceful — 실패해도 분석은 저장)
        let commentary = undefined;
        try {
          const commentaryOut = await analyzeCommentary({
            basic: output.result,
            grade,
            examCategory: examCategory ?? null,
          });
          commentary = commentaryOut.result;
        } catch (err) {
          if (import.meta.env?.DEV) {
            console.warn(
              "[useExamAnalysis] commentary 실패 (분석은 유지):",
              (err as Error).message,
            );
          }
        }

        const persisted = await upsertExamAnalysis({
          testId,
          result: output.result,
          model: output.modelUsed,
          inputPageCount: pageImages.length,
          cacheReadTokens,
          cacheWriteTokens,
          commentary,
        });
        // DB 저장 실패해도 메모리 캐시는 유지 — UX 끊김 방지
        if (persisted) {
          setAnalysis(testId, persisted);
        } else {
          // 가상 record — DB 미마이그레이션 시
          setAnalysis(testId, {
            id: "memory",
            test_id: testId,
            user_id: "memory",
            tenant_id: null,
            exam_info: output.result.exam_info,
            summary: output.result.summary,
            questions: output.result.questions,
            model: output.modelUsed,
            input_page_count: pageImages.length,
            cache_read_tokens: cacheReadTokens,
            cache_write_tokens: cacheWriteTokens,
            commentary,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        setError(testId, friendlyError(err));
        if (import.meta.env?.DEV) {
          console.warn("[useExamAnalysis] failed:", (err as Error).message);
        }
      } finally {
        setInflight(testId, false);
      }
    })();
  }, [
    testId,
    pageImages,
    grade,
    examCategory,
    hasEssay,
    examScope,
    inflight,
    setAnalysis,
    setInflight,
    setError,
  ]);

  const clearErrorBound = useCallback(() => {
    if (testId) clearError(testId);
  }, [testId, clearError]);

  return {
    record,
    inflight,
    error,
    trigger,
    clearError: clearErrorBound,
  };
};
