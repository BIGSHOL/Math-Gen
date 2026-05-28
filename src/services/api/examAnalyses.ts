/**
 * exam_analyses 테이블 CRUD (Phase N).
 *
 * 1 시험지 = 1 분석 (UNIQUE test_id) — 재분석은 UPSERT 로 갱신.
 *
 * CLAUDE.md §25-2 graceful fallback 패턴 — SQL editor 마이그레이션 안 됐을
 * 시 (PGRST205 / 404) silent skip + 1-shot console.warn. ocr_feedback.ts
 * 동일 패턴.
 */

import { supabase, SUPABASE_ENABLED, currentUserId } from "./supabase";
import type {
  BasicAnalysisResult,
  CommentaryResult,
  ExamAnalysisRecord,
} from "@app/types/examAnalysis";

// Phase N+3: commentary 컬럼 graceful fallback — schema 마이그레이션 안 됐을 때.
const COMMENTARY_COL_MISSING_RE = /(column.*commentary|PGRST204|schema cache)/i;
const isCommentaryColMissing = (err: { message?: string }): boolean =>
  COMMENTARY_COL_MISSING_RE.test(err.message ?? "");
let warnedCommentaryCol = false;
const warnCommentaryColMissing = (): void => {
  if (warnedCommentaryCol) return;
  warnedCommentaryCol = true;
  console.warn(
    "[examAnalyses] commentary 컬럼이 없습니다 — schema.sql 의 exam_analyses ALTER 안내. 마이그레이션 전까지 commentary 비활성.",
  );
};

// ════════════════════════════════════════════════════════════════════
// §1. graceful fallback — 테이블 미마이그레이션 시
// ════════════════════════════════════════════════════════════════════

const TABLE_MISSING_RE =
  /(PGRST20[45]|schema cache|relation .* does not exist|404)/i;

const isTableMissing = (err: {
  message?: string;
  code?: string;
  status?: number;
} | null): boolean => {
  if (!err) return false;
  if (err.code === "PGRST205" || err.code === "PGRST204") return true;
  if (err.status === 404) return true;
  return TABLE_MISSING_RE.test(err.message ?? "");
};

let warnedMissingTable = false;
const warnSchemaMigration = (): void => {
  if (warnedMissingTable) return;
  warnedMissingTable = true;
  console.warn(
    "[examAnalyses] exam_analyses 테이블이 Supabase 에 없습니다 — supabase/schema.sql 의 §9 (exam_analyses) 블록을 SQL editor 에서 실행하세요. 마이그레이션 전까지 분석 기능 비활성.",
  );
};

// ════════════════════════════════════════════════════════════════════
// §2. fetchExamAnalysis — test_id 로 분석 결과 조회
// ════════════════════════════════════════════════════════════════════

/**
 * test_id 의 가장 최근 분석 결과 (UNIQUE 라 1 row 또는 null).
 * 없거나 fail (RLS / 테이블 없음) 시 null — 호출자가 분기.
 */
export const fetchExamAnalysis = async (
  testId: string,
): Promise<ExamAnalysisRecord | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const { data, error } = await supabase
    .from("exam_analyses")
    .select("*")
    .eq("test_id", testId)
    .maybeSingle();
  if (error) {
    if (isTableMissing(error)) {
      warnSchemaMigration();
      return null;
    }
    console.warn(`[examAnalyses] fetch failed: ${error.message}`);
    return null;
  }
  return (data as ExamAnalysisRecord | null) ?? null;
};

// ════════════════════════════════════════════════════════════════════
// §2b. fetchAnalysesByTestIds — Library 카드 chip 용 batch fetch
// ════════════════════════════════════════════════════════════════════

/**
 * 여러 test_id 의 분석 결과를 한 번에 fetch. Library mount 시 1 회 호출 →
 * 카드 chip 즉시 표시. 없는 testId 는 결과에서 누락 (전체 fetch 가 아닌
 * "분석 있는 것만" 반환).
 *
 * 빈 array 또는 fail 시 빈 배열 — 호출자가 분기.
 */
export const fetchAnalysesByTestIds = async (
  testIds: string[],
): Promise<ExamAnalysisRecord[]> => {
  if (!SUPABASE_ENABLED || !supabase) return [];
  if (testIds.length === 0) return [];
  const { data, error } = await supabase
    .from("exam_analyses")
    .select("*")
    .in("test_id", testIds);
  if (error) {
    if (isTableMissing(error)) {
      warnSchemaMigration();
      return [];
    }
    console.warn(`[examAnalyses] batch fetch failed: ${error.message}`);
    return [];
  }
  return (data as ExamAnalysisRecord[]) ?? [];
};

// ════════════════════════════════════════════════════════════════════
// §3. upsertExamAnalysis — 신규/재분석 UPSERT
// ════════════════════════════════════════════════════════════════════

export interface UpsertExamAnalysisInput {
  testId: string;
  tenantId?: string | null;
  result: BasicAnalysisResult;
  model: string;
  inputPageCount: number;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  /** Phase N+3 — AI 시험 총평. graceful fallback (컬럼 없으면 retry without). */
  commentary?: CommentaryResult | null;
}

/**
 * 신규 분석 또는 재분석. UNIQUE (test_id) 강제 — onConflict 로 UPDATE.
 * 성공 시 record 반환, 실패 시 null.
 */
export const upsertExamAnalysis = async (
  input: UpsertExamAnalysisInput,
): Promise<ExamAnalysisRecord | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const userId = await currentUserId();
  const basePayload = {
    test_id: input.testId,
    user_id: userId,
    tenant_id: input.tenantId ?? null,
    exam_info: input.result.exam_info,
    summary: input.result.summary,
    questions: input.result.questions,
    model: input.model,
    input_page_count: input.inputPageCount,
    cache_read_tokens: input.cacheReadTokens ?? null,
    cache_write_tokens: input.cacheWriteTokens ?? null,
    updated_at: new Date().toISOString(),
  };
  // commentary 가 있으면 함께 저장 시도
  const payload =
    input.commentary !== undefined
      ? { ...basePayload, commentary: input.commentary }
      : basePayload;

  const { data, error } = await supabase
    .from("exam_analyses")
    .upsert(payload, { onConflict: "test_id" })
    .select("*")
    .single();
  if (error) {
    if (isTableMissing(error)) {
      warnSchemaMigration();
      return null;
    }
    // commentary 컬럼 없음 → fallback retry without commentary
    if (input.commentary !== undefined && isCommentaryColMissing(error)) {
      warnCommentaryColMissing();
      const { data: retryData, error: retryErr } = await supabase
        .from("exam_analyses")
        .upsert(basePayload, { onConflict: "test_id" })
        .select("*")
        .single();
      if (retryErr) {
        console.warn(`[examAnalyses] upsert retry failed: ${retryErr.message}`);
        return null;
      }
      return retryData as ExamAnalysisRecord;
    }
    console.warn(`[examAnalyses] upsert failed: ${error.message}`);
    return null;
  }
  return data as ExamAnalysisRecord;
};

// ════════════════════════════════════════════════════════════════════
// §4. deleteExamAnalysis — 분석 결과 삭제 (재분석 강제 또는 정리용)
// ════════════════════════════════════════════════════════════════════

export const deleteExamAnalysis = async (testId: string): Promise<boolean> => {
  if (!SUPABASE_ENABLED || !supabase) return false;
  const { error } = await supabase
    .from("exam_analyses")
    .delete()
    .eq("test_id", testId);
  if (error) {
    if (isTableMissing(error)) {
      warnSchemaMigration();
      return false;
    }
    console.warn(`[examAnalyses] delete failed: ${error.message}`);
    return false;
  }
  return true;
};
