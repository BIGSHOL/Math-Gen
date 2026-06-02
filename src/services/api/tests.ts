import { supabase, SUPABASE_ENABLED, currentUserId } from "./supabase";
import type { TestPaper } from "@app/types";
import { testRowToTestPaper, type TestRow, type TestInsert } from "./mappers";

/**
 * tests 테이블 CRUD. Phase B 의 진입점 — libraryStore 의 hydrate 가 `loadTests()`
 * 호출, Step 1 PDF upload 가 `insertTest(...)` 호출.
 *
 * 모든 함수는 throw 하지 않고 null/false 반환 — 호출 측이 fallback (MOCK / 메모리)
 * 으로 우회 가능.
 */

// ── optional 컬럼 graceful fallback (CLAUDE.md §25-2) ───────────────────────
// furthest_step 등 *나중에 추가된* 컬럼이 아직 마이그레이션 안 된 DB 에서도 test
// 저장이 깨지지 않도록: PGRST204(schema cache) 면 그 컬럼만 빼고 1회 재시도.
const OPTIONAL_COLUMNS = ["furthest_step"] as const;
const SCHEMA_MISS_RE = /(PGRST204|schema cache|could not find|column .* does not exist)/i;
const isSchemaMiss = (err: { message?: string; code?: string } | null): boolean =>
  !!err && (err.code === "PGRST204" || SCHEMA_MISS_RE.test(err.message ?? ""));
const stripOptional = (row: Record<string, unknown>): Record<string, unknown> => {
  const clone = { ...row };
  for (const c of OPTIONAL_COLUMNS) delete clone[c];
  return clone;
};
let warnedSchema = false;
const warnMigration = (): void => {
  if (warnedSchema) return;
  warnedSchema = true;
  console.warn(
    "[api/tests] tests.furthest_step 컬럼 없음 — schema.sql ALTER TABLE 실행 전까지 진행단계 미저장 (저장 자체는 정상).",
  );
};

/** 사용자의 모든 시험지 (DEV: 같은 DEV_USER_ID 의 모든 row). 최신순. */
export const loadTests = async (): Promise<TestPaper[] | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const { data, error } = await supabase
    .from("tests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[api/tests] loadTests failed:", error.message);
    return null;
  }
  return (data as TestRow[]).map(testRowToTestPaper);
};

/**
 * 신규 시험지 row. input.id 가 있으면 그것 사용 (Step1Upload 가 미리 발급한
 * UUID), 없으면 DB 의 gen_random_uuid().
 *
 * RLS 의 WITH CHECK 가 user_id === COALESCE(auth.uid(), DEV_USER_ID) 와 비교 →
 * user_id 컬럼 명시 안 해도 DEFAULT 가 DEV_USER_ID 라 통과. 안전을 위해 명시.
 */
export const insertTest = async (input: TestInsert): Promise<string | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const userId = await currentUserId();
  const payload: Record<string, unknown> = { user_id: userId, ...input };
  let { data, error } = await supabase
    .from("tests")
    .insert(payload)
    .select("id")
    .single();
  if (error && isSchemaMiss(error)) {
    warnMigration();
    ({ data, error } = await supabase
      .from("tests")
      .insert(stripOptional(payload))
      .select("id")
      .single());
  }
  if (error) {
    console.warn(
      `[api/tests] insertTest failed: ${error.message} (code: ${error.code ?? "-"})`,
    );
    return null;
  }
  return data.id;
};

/**
 * 사용자가 만든 동일 row 가 이미 있으면 UPDATE, 없으면 INSERT — Step 1 onFile 의
 * "이미 작업 중인 testId 가 있는 상태에서 reset 후 재업로드" 패턴 대응. id 있는
 * payload 만 받음.
 */
export const upsertTest = async (input: TestInsert): Promise<string | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  if (!input.id) return insertTest(input);
  const userId = await currentUserId();
  const payload: Record<string, unknown> = { user_id: userId, ...input };
  let { data, error } = await supabase
    .from("tests")
    .upsert(payload, { onConflict: "id" })
    .select("id")
    .single();
  if (error && isSchemaMiss(error)) {
    warnMigration();
    ({ data, error } = await supabase
      .from("tests")
      .upsert(stripOptional(payload), { onConflict: "id" })
      .select("id")
      .single());
  }
  if (error) {
    console.warn(
      `[api/tests] upsertTest failed: ${error.message} (code: ${error.code ?? "-"})`,
    );
    return null;
  }
  return data.id;
};

// ── updateTest: id 별 debounce 큐 ────────────────────────────────────────────
type TimerId = ReturnType<typeof setTimeout>;
const updateTimers = new Map<string, TimerId>();
const pendingPatches = new Map<string, Partial<TestInsert>>();

/**
 * tests row 의 부분 UPDATE. debounceMs > 0 면 같은 id 의 연속 호출을 합쳐서
 * 마지막 호출 후 debounceMs ms 뒤에 1번만 실행. 메타 갱신 (status, problem_count)
 * 처럼 잦은 호출에 적합.
 */
export const updateTest = async (
  id: string,
  patch: Partial<TestInsert>,
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
        const ok = await updateTest(id, merged, { debounceMs: 0 });
        resolve(ok);
      }, debounceMs);
      updateTimers.set(id, timer);
    });
  }
  let { error } = await supabase.from("tests").update(patch).eq("id", id);
  if (error && isSchemaMiss(error)) {
    warnMigration();
    ({ error } = await supabase
      .from("tests")
      .update(stripOptional(patch as Record<string, unknown>))
      .eq("id", id));
  }
  if (error) {
    console.warn("[api/tests] updateTest failed:", error.message);
    return false;
  }
  return true;
};

/**
 * 시험지 삭제. CASCADE 로 pages / ocr_problems / problem_reviews / variant_history
 * 모두 자동 제거. Storage 파일은 별도로 `removeTestFolder(id)` 호출 필요.
 */
export const deleteTest = async (id: string): Promise<boolean> => {
  if (!SUPABASE_ENABLED || !supabase) return false;
  const { error } = await supabase.from("tests").delete().eq("id", id);
  if (error) {
    console.warn("[api/tests] deleteTest failed:", error.message);
    return false;
  }
  return true;
};

/** 단건 조회 — Step1Upload reset 시 *draft 상태인지* 확인용. */
export const getTest = async (id: string): Promise<TestPaper | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const { data, error } = await supabase
    .from("tests")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    // PGRST116 = "0 rows returned" (Supabase 의 single() 빈 결과 코드). 그 외만 경고.
    if (error.code !== "PGRST116") {
      console.warn("[api/tests] getTest failed:", error.message);
    }
    return null;
  }
  return testRowToTestPaper(data as TestRow);
};

/**
 * 단건 조회 — TestRow 원본 반환. getTest 와 달리 testRowToTestPaper 변환을
 * 생략해 grade / exam_category / uploaded_file_name 을 보존. "이어서 작업"
 * hydrate 가 selectedGrade / examCategory 추출에 사용.
 */
export const getTestRow = async (id: string): Promise<TestRow | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const { data, error } = await supabase
    .from("tests")
    .select("*")
    .eq("id", id)
    .single();
  if (error) {
    // PGRST116 = "0 rows returned" — getTest 와 동일 처리.
    if (error.code !== "PGRST116") {
      console.warn("[api/tests] getTestRow failed:", error.message);
    }
    return null;
  }
  return data as TestRow;
};

/**
 * draft 상태의 row 만 삭제 + Storage cleanup — reset/handleRestart 가 호출.
 * 이미 사용자가 진행 (status="ok"/"warn") 한 시험지는 *건드리지 않음*.
 *
 * Storage cleanup 은 caller 가 `storage.removeTestFolder` 별도 호출 (이 모듈은
 * storage 의존을 갖지 않게 분리).
 */
export const deleteIfDraft = async (id: string): Promise<boolean> => {
  const t = await getTest(id);
  if (!t || t.status !== "draft") return false;
  return deleteTest(id);
};
