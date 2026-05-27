import { supabase, SUPABASE_ENABLED } from "./supabase";
import type { OCRProblem } from "@app/stores/wizardStore";
import {
  ocrProblemToInsert,
  type OcrProblemInsert,
  type OcrProblemRow,
} from "./mappers";

/**
 * ocr_problems 테이블 CRUD.
 *
 * Step 2 OCR 완료 시 페이지의 N 개 문항을 `upsertOcrProblems(pageId, items)` 로
 * batch upsert. Step 3 사용자 편집·해설 추가 시 `updateOcrProblem(id, patch)` 로
 * 부분 갱신 (debounce 권장).
 *
 * OCRProblem.id 는 ocr.ts 의 `newId()` 에서 이미 `crypto.randomUUID()` 형식 →
 * DB 의 `id UUID PRIMARY KEY` 와 그대로 매핑.
 */

/**
 * Phase #7 신규 컬럼 (choices_layout) 이 DB schema 에 적용 안 된 경우 PostgREST
 * 가 PGRST204 (schema cache miss) 를 던진다. 사용자에게 SQL 마이그레이션 안내
 * 후, 이번 insert 는 컬럼 빼고 자동 재시도.
 */
const SCHEMA_CACHE_MISS_RE = /(PGRST204|schema cache)/i;
const isSchemaCacheMiss = (msg: string): boolean => SCHEMA_CACHE_MISS_RE.test(msg);

// 알려진 후속 컬럼 — schema 미적용 시 stripped 대상
const OPTIONAL_COLUMNS = ["choices_layout"] as const;
const stripOptionalColumns = (rows: OcrProblemInsert[]): OcrProblemInsert[] =>
  rows.map((row) => {
    const clone = { ...row } as Record<string, unknown>;
    for (const col of OPTIONAL_COLUMNS) delete clone[col];
    return clone as OcrProblemInsert;
  });

// 한 번만 경고 (콘솔 스팸 방지)
let warnedSchema = false;
const warnSchemaMigration = (col: string) => {
  if (warnedSchema) return;
  warnedSchema = true;
  // eslint-disable-next-line no-console
  console.warn(
    `[api/problems] 'ocr_problems.${col}' 컬럼 없음 — Phase #7 마이그레이션 필요.\n` +
      "Supabase SQL Editor 에서 다음 실행 (멱등):\n" +
      "  ALTER TABLE ocr_problems ADD COLUMN IF NOT EXISTS choices_layout TEXT DEFAULT 'auto';\n" +
      "임시 우회: 컬럼 없이 insert/update 자동 재시도 — 보기 배치 정보 미저장.",
  );
};

export const upsertOcrProblems = async (
  pageId: string,
  items: OCRProblem[],
): Promise<void> => {
  if (!SUPABASE_ENABLED || !supabase) return;
  // page 단위 "전체 교체" — 기존 행 삭제 후 삽입.
  // 재OCR 하면 OCRProblem.id 가 새 randomUUID 로 발급되므로 onConflict:"id"
  // upsert 로는 옛 행이 안 지워지고 누적된다 (사용자 보고: 15문항인데 58행).
  // page_id 로 싹 지우고 새로 넣어야 정확히 1:1 이 된다.
  // (참고: problem_reviews.ocr_problem_id 는 ON DELETE CASCADE — 재OCR 시
  //  해당 문항의 옛 변형도 함께 정리됨. 의도된 동작.)
  const { error: delError } = await supabase
    .from("ocr_problems")
    .delete()
    .eq("page_id", pageId);
  if (delError) {
    console.warn(
      `[api/problems] upsertOcrProblems delete failed: ${delError.message} (code: ${delError.code ?? "-"})`,
    );
  }
  if (items.length === 0) return;
  const payloads = items.map((it) => ocrProblemToInsert(pageId, it));
  const { error } = await supabase.from("ocr_problems").insert(payloads);
  if (error) {
    // Phase #7 schema 미적용 fallback — choices_layout 빼고 재시도
    if (isSchemaCacheMiss(error.message)) {
      warnSchemaMigration("choices_layout");
      const stripped = stripOptionalColumns(payloads);
      const { error: retryError } = await supabase
        .from("ocr_problems")
        .insert(stripped);
      if (retryError) {
        console.warn(
          `[api/problems] upsertOcrProblems retry failed: ${retryError.message} (code: ${retryError.code ?? "-"})`,
        );
      }
      return;
    }
    console.warn(
      `[api/problems] upsertOcrProblems insert failed: ${error.message} (code: ${error.code ?? "-"})`,
    );
  }
};

// ── updateOcrProblem: id 별 debounce ─────────────────────────────────────────
type TimerId = ReturnType<typeof setTimeout>;
const updateTimers = new Map<string, TimerId>();
const pendingPatches = new Map<string, Partial<OcrProblemInsert>>();

export const updateOcrProblem = async (
  id: string,
  patch: Partial<OcrProblemInsert>,
  options: { debounceMs?: number } = {},
): Promise<boolean> => {
  if (!SUPABASE_ENABLED || !supabase) return false;
  const debounceMs = options.debounceMs ?? 0;
  if (debounceMs > 0) {
    const existing = updateTimers.get(id);
    if (existing) clearTimeout(existing);
    pendingPatches.set(id, { ...(pendingPatches.get(id) ?? {}), ...patch });
    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        updateTimers.delete(id);
        const merged = pendingPatches.get(id) ?? patch;
        pendingPatches.delete(id);
        const ok = await updateOcrProblem(id, merged, { debounceMs: 0 });
        resolve(ok);
      }, debounceMs);
      updateTimers.set(id, timer);
    });
  }
  const { error } = await supabase.from("ocr_problems").update(patch).eq("id", id);
  if (error) {
    // Phase #7 schema 미적용 fallback — choices_layout 빼고 재시도
    if (isSchemaCacheMiss(error.message)) {
      warnSchemaMigration("choices_layout");
      const stripped = { ...(patch as Record<string, unknown>) };
      for (const col of OPTIONAL_COLUMNS) delete stripped[col];
      if (Object.keys(stripped).length === 0) return true; // 컬럼만 빼면 update 항목 X
      const { error: retryError } = await supabase
        .from("ocr_problems")
        .update(stripped)
        .eq("id", id);
      if (retryError) {
        console.warn("[api/problems] updateOcrProblem retry failed:", retryError.message);
        return false;
      }
      return true;
    }
    console.warn("[api/problems] updateOcrProblem failed:", error.message);
    return false;
  }
  return true;
};

export const markReviewed = async (id: string, reviewed: boolean): Promise<boolean> =>
  updateOcrProblem(id, { reviewed });

/**
 * 한 시험지의 모든 문항 — pages 와 inner join, page_num + problem_number 순.
 * Phase C detail view 가 mount 시 호출.
 *
 * PostgREST embed 패턴: `select=*,page:pages!inner(test_id,page_num)` +
 * `page.test_id=eq.{testId}`. 정렬은 부모 컬럼 (problem_number) 만 가능 —
 * page_num 정렬은 client-side.
 */
export const loadProblemsByTest = async (
  testId: string,
): Promise<OcrProblemRow[] | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const { data, error } = await supabase
    .from("ocr_problems")
    .select("*, page:pages!inner(id, test_id, page_num)")
    .eq("page.test_id", testId)
    .order("problem_number", { ascending: true });
  if (error) {
    console.warn("[api/problems] loadProblemsByTest failed:", error.message);
    return null;
  }
  // page_num 으로 client-side 정렬 + page object 는 제거 (OcrProblemRow 형태로)
  type Joined = OcrProblemRow & { page?: { page_num: number } };
  const rows = (data as Joined[]).slice().sort((a, b) => {
    const pa = a.page?.page_num ?? 0;
    const pb = b.page?.page_num ?? 0;
    if (pa !== pb) return pa - pb;
    return a.problem_number - b.problem_number;
  });
  return rows.map(({ page: _omit, ...row }) => row);
};
