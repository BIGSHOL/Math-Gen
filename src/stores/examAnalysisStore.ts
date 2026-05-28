/**
 * 시험지 분석 결과 캐시 (Phase N).
 *
 * testId 별 ExamAnalysisRecord 메모리 보관. DetailScreen 의 stats 탭 진입 시
 * fetchExamAnalysis 호출 → 결과 있으면 store set → 차트 즉시 표시. "분석 시작"
 * 버튼 → analyzeExam → upsertExamAnalysis → store update.
 *
 * persist 안 함 — DB 가 source of truth, 메모리는 *현재 세션 캐시* 만.
 */

import { create } from "zustand";
import type { ExamAnalysisRecord } from "@app/types/examAnalysis";

export interface ExamAnalysisState {
  /** testId → ExamAnalysisRecord 또는 null (조회했지만 없음). */
  byTest: Record<string, ExamAnalysisRecord | null>;
  /** testId → in-flight 여부 (분석 실행 중). */
  inflight: Record<string, boolean>;
  /** testId → 에러 메시지 (실패 시 노출). */
  errors: Record<string, string | undefined>;

  setAnalysis: (testId: string, record: ExamAnalysisRecord | null) => void;
  setInflight: (testId: string, value: boolean) => void;
  setError: (testId: string, error: string | undefined) => void;
  clearError: (testId: string) => void;
  reset: () => void;
}

export const useExamAnalysisStore = create<ExamAnalysisState>((set) => ({
  byTest: {},
  inflight: {},
  errors: {},

  setAnalysis: (testId, record) =>
    set((state) => ({
      byTest: { ...state.byTest, [testId]: record },
    })),

  setInflight: (testId, value) =>
    set((state) => ({
      inflight: { ...state.inflight, [testId]: value },
    })),

  setError: (testId, error) =>
    set((state) => ({
      errors: { ...state.errors, [testId]: error },
    })),

  clearError: (testId) =>
    set((state) => {
      const next = { ...state.errors };
      delete next[testId];
      return { errors: next };
    }),

  reset: () => set({ byTest: {}, inflight: {}, errors: {} }),
}));
