import { supabase } from "./supabase";

/**
 * Phase #6 — OCR 단계 카드 좋아요/싫어요 + 관리자 스크랩.
 *
 * 사용자가 Step 2 OCR Review 의 카드에 👍 / 👎 한 기록을 `ocr_feedback`
 * 테이블에 저장. 👎 시 사전 정의 reason codes (multi-select) + 자유 입력
 * reason_text. 관리자가 list / resolved 표시.
 *
 * 기존 `feedback.ts` (`content_feedback`) 와 분리:
 *   - content_feedback: 해설/변형 *콘텐츠 품질* (Phase E)
 *   - ocr_feedback:     OCR *전사 정확도* (Phase #6) — 스크랩 + resolved workflow
 *
 * **anon (비로그인) 차단**: RLS `feedback_insert_role` 가 `user_id =
 * auth.uid()` 강제 — anon insert fail. UI 단에서 비로그인 시 버튼 숨김.
 *
 * **Graceful fallback for missing table** (CLAUDE.md §25-2): 사용자가 Supabase
 * 에 `supabase/schema.sql` 의 ocr_feedback 부분을 마이그레이션 안 한 상태에서
 * 클라이언트가 GET/POST 호출하면 PostgREST 404 또는 PGRST205. 한 번 경고
 * (warnSchemaMigration) 후 silent skip — 콘솔 404 noise 방지 + UI 정상 동작
 * (👍/👎 안 됨이지만 OCR 자체는 영향 X).
 */

const TABLE_MISSING_RE = /(PGRST20[45]|schema cache|relation .* does not exist|404)/i;
const isTableMissing = (
  err: { message?: string; code?: string; status?: number } | null,
): boolean => {
  if (!err) return false;
  if (err.code === "PGRST205" || err.code === "PGRST204") return true;
  if (err.status === 404) return true;
  return TABLE_MISSING_RE.test(err.message ?? "");
};

let warnedMissingTable = false;
const warnSchemaMigration = (): void => {
  if (warnedMissingTable) return;
  warnedMissingTable = true;
  // eslint-disable-next-line no-console
  console.warn(
    "[ocrFeedback] ocr_feedback 테이블이 Supabase 에 없습니다 — supabase/schema.sql 의 §8 (ocr_feedback) 블록을 SQL editor 에서 실행하세요. 마이그레이션 전까지 👍/👎 기능 비활성.",
  );
};

// ============================================================================
// Predefined reason codes (사용자 보고 — 사전 정의 6 사유)
// ============================================================================

export type OcrFeedbackReasonCode =
  | "body_missing"        // 본문 누락 / 잘못됨
  | "choices_missing"     // 보기 누락 / 잘못됨
  | "latex_error"         // 수식 / LaTeX 인식 오류
  | "figure_error"        // 도형 / 표 잘못 그림
  | "answer_wrong"        // 답 비어있음 / 잘못됨
  | "other_distortion";   // 다른 문제로 변형됨

export const OCR_FEEDBACK_REASON_LABELS: Record<OcrFeedbackReasonCode, string> = {
  body_missing: "본문 누락 / 잘못됨",
  choices_missing: "보기 누락 / 잘못됨",
  latex_error: "수식·LaTeX 인식 오류",
  figure_error: "도형·표 잘못 그림",
  answer_wrong: "답 비어있음 / 잘못됨",
  other_distortion: "다른 문제로 변형됨",
};

export const OCR_FEEDBACK_REASON_CODES: OcrFeedbackReasonCode[] = [
  "body_missing",
  "choices_missing",
  "latex_error",
  "figure_error",
  "answer_wrong",
  "other_distortion",
];

// ============================================================================
// Types
// ============================================================================

export type OcrFeedbackRating = "like" | "dislike";

export interface OcrFeedbackRow {
  id: string;
  ocr_problem_id: string;
  test_id: string;
  user_id: string;
  tenant_id: string | null;
  rating: OcrFeedbackRating;
  reason_codes: OcrFeedbackReasonCode[];
  reason_text: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  resolved_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitOcrFeedbackInput {
  ocr_problem_id: string;
  test_id: string;
  rating: OcrFeedbackRating;
  reason_codes?: OcrFeedbackReasonCode[];
  reason_text?: string | null;
}

// ============================================================================
// Service functions (user-facing)
// ============================================================================

/**
 * Upsert 패턴 — 한 사용자 + 한 문제 = 한 피드백. like → dislike 전환 또는
 * dislike 의 사유 추가 시 같은 행 UPDATE. UNIQUE (ocr_problem_id, user_id)
 * 가 schema 에 박혀 있음.
 *
 * 성공 시 row 반환, 실패 시 null (silent — RLS 차단 / network).
 */
export const submitOcrFeedback = async (
  input: SubmitOcrFeedbackInput,
): Promise<OcrFeedbackRow | null> => {
  if (!supabase) return null;
  // tenant_id 는 tests.tenant_id 에서 복사 (admin filter 효율). null OK.
  let tenant_id: string | null = null;
  const { data: testRow } = await supabase
    .from("tests")
    .select("tenant_id")
    .eq("id", input.test_id)
    .maybeSingle();
  if (testRow && (testRow as { tenant_id?: string | null }).tenant_id) {
    tenant_id = (testRow as { tenant_id: string }).tenant_id;
  }

  // 본인 user_id 확보 (RLS WITH CHECK 통과용)
  const { data: authData } = await supabase.auth.getUser();
  const user_id =
    authData?.user?.id ?? "00000000-0000-0000-0000-000000000000";

  const payload = {
    ocr_problem_id: input.ocr_problem_id,
    test_id: input.test_id,
    user_id,
    tenant_id,
    rating: input.rating,
    reason_codes: input.reason_codes ?? [],
    reason_text: input.reason_text ?? null,
    resolved: false,
  };
  const { data, error } = await supabase
    .from("ocr_feedback")
    .upsert(payload, { onConflict: "ocr_problem_id,user_id" })
    .select("*")
    .single();
  if (error) {
    if (isTableMissing(error)) {
      warnSchemaMigration();
      return null;
    }
    // eslint-disable-next-line no-console
    console.warn("[ocrFeedback] submit failed:", error.message);
    return null;
  }
  return data as OcrFeedbackRow;
};

/**
 * 본인의 한 문제 피드백 조회 (mount 시 현재 상태 hydrate). 없으면 null.
 */
export const getMyOcrFeedback = async (
  ocrProblemId: string,
): Promise<OcrFeedbackRow | null> => {
  if (!supabase) return null;
  const { data: authData } = await supabase.auth.getUser();
  const user_id = authData?.user?.id;
  if (!user_id) return null;
  const { data, error } = await supabase
    .from("ocr_feedback")
    .select("*")
    .eq("ocr_problem_id", ocrProblemId)
    .eq("user_id", user_id)
    .maybeSingle();
  if (error && isTableMissing(error)) {
    warnSchemaMigration();
    return null;
  }
  return (data as OcrFeedbackRow) ?? null;
};

/**
 * 본인의 한 시험지 모든 피드백 (test 마운트 시 bulk hydrate). Map<problem_id, row>.
 */
export const listMyOcrFeedbackByTest = async (
  testId: string,
): Promise<Map<string, OcrFeedbackRow>> => {
  const out = new Map<string, OcrFeedbackRow>();
  if (!supabase) return out;
  const { data: authData } = await supabase.auth.getUser();
  const user_id = authData?.user?.id;
  if (!user_id) return out;
  const { data, error } = await supabase
    .from("ocr_feedback")
    .select("*")
    .eq("test_id", testId)
    .eq("user_id", user_id);
  if (error && isTableMissing(error)) {
    warnSchemaMigration();
    return out;
  }
  if (!data) return out;
  for (const row of data as OcrFeedbackRow[]) {
    out.set(row.ocr_problem_id, row);
  }
  return out;
};

/**
 * 본인 피드백 취소 (👍/👎 클릭 해제). RLS feedback_delete_own 통과.
 */
export const deleteMyOcrFeedback = async (
  ocrProblemId: string,
): Promise<boolean> => {
  if (!supabase) return false;
  const { data: authData } = await supabase.auth.getUser();
  const user_id = authData?.user?.id;
  if (!user_id) return false;
  const { error } = await supabase
    .from("ocr_feedback")
    .delete()
    .eq("ocr_problem_id", ocrProblemId)
    .eq("user_id", user_id);
  if (error) {
    if (isTableMissing(error)) {
      warnSchemaMigration();
      return false;
    }
    // eslint-disable-next-line no-console
    console.warn("[ocrFeedback] delete failed:", error.message);
    return false;
  }
  return true;
};

// ============================================================================
// Admin queries (scrapped items list)
// ============================================================================

export interface ScrappedOcrItem {
  feedback: OcrFeedbackRow;
  // 컨텍스트 — admin 화면에서 빠르게 식별
  test_title: string | null;
  test_grade: string | null;
  problem_number: number | null;
  problem_text: string | null;
  problem_choices: string[] | null;
  problem_answer: string | null;
  page_num: number | null;
  page_id: string | null;
  page_image_path: string | null;
  reporter_email: string | null;
  reporter_name: string | null;
}

export interface ScrappedListFilters {
  resolved?: boolean | "all";     // undefined or "all" = both. false = pending only. true = resolved only.
  tenant_id?: string | null;      // tenant_admin 이 사용 시 자동. system_admin 은 생략 가능.
  limit?: number;                 // 기본 100
}

/**
 * 스크랩 (👎) 된 OCR 문제 list — RLS 가 본인 + tenant_admin (같은 tenant)
 * + system_admin (전체) 자동 filter. context 행 정보 (test/page/problem) join.
 */
export const listScrappedOcrItems = async (
  filters: ScrappedListFilters = {},
): Promise<ScrappedOcrItem[]> => {
  if (!supabase) return [];
  const limit = filters.limit ?? 100;
  let q = supabase
    .from("ocr_feedback")
    .select(
      `
      *,
      ocr_problems!inner (
        id,
        problem_number,
        text,
        choices,
        answer,
        page_id,
        pages!inner (
          id,
          page_num,
          image_storage_path
        )
      ),
      tests!inner (
        id,
        title,
        grade
      ),
      profiles:user_id (
        email,
        display_name
      )
    `,
    )
    .eq("rating", "dislike")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filters.resolved === true) q = q.eq("resolved", true);
  else if (filters.resolved === false) q = q.eq("resolved", false);
  if (filters.tenant_id !== undefined && filters.tenant_id !== null) {
    q = q.eq("tenant_id", filters.tenant_id);
  }
  const { data, error } = await q;
  if (error) {
    if (isTableMissing(error)) {
      warnSchemaMigration();
      return [];
    }
    // eslint-disable-next-line no-console
    console.warn("[ocrFeedback] listScrapped failed:", error.message);
    return [];
  }
  if (!data) return [];
  return (data as unknown[]).map((rawRow) => {
    const row = rawRow as Record<string, unknown>;
    const ocrProb = row.ocr_problems as Record<string, unknown> | null;
    const page = ocrProb?.pages as Record<string, unknown> | null;
    const test = row.tests as Record<string, unknown> | null;
    const profile = row.profiles as Record<string, unknown> | null;
    return {
      feedback: {
        id: row.id as string,
        ocr_problem_id: row.ocr_problem_id as string,
        test_id: row.test_id as string,
        user_id: row.user_id as string,
        tenant_id: (row.tenant_id as string | null) ?? null,
        rating: row.rating as OcrFeedbackRating,
        reason_codes: (row.reason_codes as OcrFeedbackReasonCode[]) ?? [],
        reason_text: (row.reason_text as string | null) ?? null,
        resolved: row.resolved as boolean,
        resolved_at: (row.resolved_at as string | null) ?? null,
        resolved_by: (row.resolved_by as string | null) ?? null,
        resolved_note: (row.resolved_note as string | null) ?? null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
      },
      test_title: (test?.title as string | null) ?? null,
      test_grade: (test?.grade as string | null) ?? null,
      problem_number: (ocrProb?.problem_number as number | null) ?? null,
      problem_text: (ocrProb?.text as string | null) ?? null,
      problem_choices: (ocrProb?.choices as string[] | null) ?? null,
      problem_answer: (ocrProb?.answer as string | null) ?? null,
      page_num: (page?.page_num as number | null) ?? null,
      page_id: (page?.id as string | null) ?? null,
      page_image_path: (page?.image_storage_path as string | null) ?? null,
      reporter_email: (profile?.email as string | null) ?? null,
      reporter_name: (profile?.display_name as string | null) ?? null,
    };
  });
};

/**
 * 관리자가 스크랩 행을 resolved 표시 (검토 완료). resolved_note 선택적.
 */
export const resolveOcrFeedback = async (
  feedbackId: string,
  note?: string | null,
): Promise<boolean> => {
  if (!supabase) return false;
  const { data: authData } = await supabase.auth.getUser();
  const adminId = authData?.user?.id ?? null;
  const { error } = await supabase
    .from("ocr_feedback")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: adminId,
      resolved_note: note ?? null,
    })
    .eq("id", feedbackId);
  if (error) {
    if (isTableMissing(error)) {
      warnSchemaMigration();
      return false;
    }
    // eslint-disable-next-line no-console
    console.warn("[ocrFeedback] resolve failed:", error.message);
    return false;
  }
  return true;
};

/**
 * resolved 표시 해제 (잘못 클릭 시 되돌리기).
 */
export const unresolveOcrFeedback = async (
  feedbackId: string,
): Promise<boolean> => {
  if (!supabase) return false;
  const { error } = await supabase
    .from("ocr_feedback")
    .update({
      resolved: false,
      resolved_at: null,
      resolved_by: null,
      resolved_note: null,
    })
    .eq("id", feedbackId);
  if (error) {
    if (isTableMissing(error)) {
      warnSchemaMigration();
      return false;
    }
    // eslint-disable-next-line no-console
    console.warn("[ocrFeedback] unresolve failed:", error.message);
    return false;
  }
  return true;
};

// ============================================================================
// Summary (admin 대시보드 카드용)
// ============================================================================

export interface OcrFeedbackSummary {
  total_likes: number;
  total_dislikes: number;
  pending_scraps: number;       // resolved = false
  resolved_scraps: number;
}

export const loadOcrFeedbackSummary = async (
  days = 30,
): Promise<OcrFeedbackSummary> => {
  const empty = {
    total_likes: 0,
    total_dislikes: 0,
    pending_scraps: 0,
    resolved_scraps: 0,
  };
  if (!supabase) return empty;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("ocr_feedback")
    .select("rating, resolved")
    .gte("created_at", since)
    .limit(50000);
  if (error && isTableMissing(error)) {
    warnSchemaMigration();
    return empty;
  }
  if (!data) return empty;
  let total_likes = 0;
  let total_dislikes = 0;
  let pending_scraps = 0;
  let resolved_scraps = 0;
  for (const rawRow of data) {
    const row = rawRow as { rating: string; resolved: boolean };
    if (row.rating === "like") total_likes += 1;
    else if (row.rating === "dislike") {
      total_dislikes += 1;
      if (row.resolved) resolved_scraps += 1;
      else pending_scraps += 1;
    }
  }
  return { total_likes, total_dislikes, pending_scraps, resolved_scraps };
};
