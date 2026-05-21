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

export const upsertOcrProblems = async (
  pageId: string,
  items: OCRProblem[],
): Promise<void> => {
  if (!SUPABASE_ENABLED || !supabase) return;
  if (items.length === 0) return;
  const payloads = items.map((it) => ocrProblemToInsert(pageId, it));
  const { error } = await supabase
    .from("ocr_problems")
    .upsert(payloads, { onConflict: "id" });
  if (error) {
    console.warn(
      `[api/problems] upsertOcrProblems failed: ${error.message} (code: ${error.code ?? "-"})`,
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
