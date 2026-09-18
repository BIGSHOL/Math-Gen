import { workDb as supabase, SUPABASE_ENABLED } from "./supabase";
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
 * 코드가 DB 스키마보다 앞서 있을 때(후속 컬럼 미적용) 저장이 통째로 실패하지 않도록
 * 행을 스키마에 맞춰 1단계씩 조정한다. 없는 컬럼만 정확히 빼고, `score` 가 아직
 * integer 인 DB 에서는 소수 배점을 null 로 두고 `printed_score` 표기로 보존한다.
 */
const SCHEMA_CACHE_MISS_RE = /(PGRST204|schema cache)/i;
const isSchemaCacheMiss = (msg: string): boolean => SCHEMA_CACHE_MISS_RE.test(msg);
const MISSING_COLUMN_RE = /could not find the '([a-z_]+)' column/i;
const INTEGER_SYNTAX_RE = /invalid input syntax for type (?:integer|smallint)/i;

// 알려진 후속 컬럼 — 누락 컬럼명을 특정할 수 없을 때 일괄 제거 대상.
const OPTIONAL_COLUMNS = [
  "choices_layout",
  "diagram_params",
  "solution_auto_retried",
  "figures",
  // 옵션 B: 네이티브 블록 영속화 컬럼.
  "blocks",
  "choice_groups",
  "score",
  "printed_score",
  "label_type",
  // D3: 소문항 (1)(2) 구조화.
  "sub_questions",
] as const;

type Row = Record<string, unknown>;
type DbError = { message: string; code?: string };

// 한 번만 경고 (콘솔 스팸 방지)
let warnedSchema = false;
const warnSchemaMigration = (detail: string) => {
  if (warnedSchema) return;
  warnedSchema = true;
  // eslint-disable-next-line no-console
  console.warn(
    `[api/problems] ocr_problems 스키마가 최신이 아닙니다 (${detail}) — 해당 값만 빼고 저장합니다.
` +
      "Supabase SQL Editor 에서 supabase/patch-testchange-work.sql 을 실행하세요 (멱등).",
  );
};

const isFractional = (v: unknown): boolean => typeof v === "number" && !Number.isInteger(v);

/** 오류에 맞춰 조정한 행. 더 조정할 수 없으면 null. */
const adaptRowsToSchema = (rows: Row[], error: DbError): Row[] | null => {
  const missing = MISSING_COLUMN_RE.exec(error.message)?.[1];
  if (missing && rows.some((r) => missing in r)) {
    warnSchemaMigration(`${missing} 컬럼 없음`);
    return rows.map(({ [missing]: _omit, ...rest }) => rest);
  }
  if (isSchemaCacheMiss(error.message)) {
    if (!rows.some((r) => OPTIONAL_COLUMNS.some((c) => c in r))) return null;
    warnSchemaMigration("후속 컬럼 없음");
    return rows.map((r) => {
      const clone = { ...r };
      for (const col of OPTIONAL_COLUMNS) delete clone[col];
      return clone;
    });
  }
  if (error.code === "22P02" || INTEGER_SYNTAX_RE.test(error.message)) {
    if (!rows.some((r) => isFractional(r.score))) return null;
    warnSchemaMigration("score 가 integer — 소수 배점은 printed_score 로만 보관");
    return rows.map((r) => (isFractional(r.score) ? { ...r, score: null } : r));
  }
  return null;
};

/** 스키마 차이를 흡수하며 실행. 최종 오류(없으면 null)를 반환한다. */
const runAdapting = async (
  rows: Row[],
  run: (rows: Row[]) => PromiseLike<{ error: DbError | null }>,
): Promise<DbError | null> => {
  let current = rows;
  for (let attempt = 0; attempt < OPTIONAL_COLUMNS.length + 2; attempt++) {
    const { error } = await run(current);
    if (!error) return null;
    const adapted = adaptRowsToSchema(current, error);
    if (!adapted) return error;
    current = adapted;
    if (current.every((r) => Object.keys(r).length === 0)) return null; // 남은 변경 없음
  }
  return { message: "스키마 조정 한도 초과" };
};

/** 페이지 문항 전체 교체. 성공하면 true (DB 비활성은 false). */
export const upsertOcrProblems = async (
  pageId: string,
  items: OCRProblem[],
): Promise<boolean> => {
  if (!SUPABASE_ENABLED || !supabase) return false;
  const db = supabase;
  // page 단위 "전체 교체" — 기존 행 삭제 후 삽입.
  // 재OCR 하면 OCRProblem.id 가 새 randomUUID 로 발급되므로 onConflict:"id"
  // upsert 로는 옛 행이 안 지워지고 누적된다 (사용자 보고: 15문항인데 58행).
  // page_id 로 싹 지우고 새로 넣어야 정확히 1:1 이 된다.
  // (참고: problem_reviews.ocr_problem_id 는 ON DELETE CASCADE — 재OCR 시
  //  해당 문항의 옛 변형도 함께 정리됨. 의도된 동작.)
  const { error: delError } = await db
    .from("ocr_problems")
    .delete()
    .eq("page_id", pageId);
  if (delError) {
    console.warn(
      `[api/problems] upsertOcrProblems delete failed: ${delError.message} (code: ${delError.code ?? "-"})`,
    );
  }
  if (items.length === 0) return !delError;
  const payloads = items.map((it) => ocrProblemToInsert(pageId, it) as Row);
  const error = await runAdapting(payloads, (rows) => db.from("ocr_problems").insert(rows));
  if (error) {
    console.warn(
      `[api/problems] upsertOcrProblems insert failed: ${error.message} (code: ${error.code ?? "-"})`,
    );
    return false;
  }
  return true;
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
  const db = supabase;
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
  const error = await runAdapting([patch as Row], ([row]) =>
    db.from("ocr_problems").update(row).eq("id", id),
  );
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
