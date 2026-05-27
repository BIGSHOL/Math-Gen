import { supabase, SUPABASE_ENABLED } from "./supabase";
import type { WizardPage } from "@app/stores/wizardStore";
import { uploadPageImage, uploadPageThumbnail } from "./storage";
import {
  wizardPageToPageInsert,
  type PageRow,
  type PageInsert,
} from "./mappers";

/**
 * Phase I 신규 컬럼 (crop_boxes, crop_inspected) 이 DB schema 에 적용 안 된
 * 경우 PostgREST PGRST204 (schema cache miss) 던짐. 사용자에게 SQL 마이그레이션
 * 안내 후 컬럼 strip 자동 재시도.
 */
const SCHEMA_CACHE_MISS_RE = /(PGRST204|schema cache)/i;
const isSchemaCacheMiss = (msg: string): boolean => SCHEMA_CACHE_MISS_RE.test(msg);

const OPTIONAL_PAGE_COLUMNS = ["crop_boxes", "crop_inspected"] as const;
const stripOptionalPageColumns = <T extends Record<string, unknown>>(row: T): T => {
  const clone = { ...row };
  for (const col of OPTIONAL_PAGE_COLUMNS) delete clone[col];
  return clone;
};

let warnedPageSchema = false;
const warnPageSchemaMigration = () => {
  if (warnedPageSchema) return;
  warnedPageSchema = true;
  // eslint-disable-next-line no-console
  console.warn(
    "[api/pages] 'pages.crop_boxes' / 'pages.crop_inspected' 컬럼 없음 — Phase I 마이그레이션 필요.\n" +
      "Supabase SQL Editor 에서 다음 실행 (멱등):\n" +
      "  ALTER TABLE pages ADD COLUMN IF NOT EXISTS crop_boxes JSONB DEFAULT '[]'::jsonb;\n" +
      "  ALTER TABLE pages ADD COLUMN IF NOT EXISTS crop_inspected BOOL DEFAULT false;\n" +
      "임시 우회: 컬럼 없이 insert/update 자동 재시도 — 보관함 재열기 시 매번 재검출 (Gemini 비용).",
  );
};

/**
 * pages 테이블 CRUD + Storage 의 이미지 path wiring.
 *
 * Step 1 의 페이지 loop 안에서 `insertPage(testId, p, wizPage, imageDataUrl, thumbDataUrl)`
 * 를 *background* 로 호출. Storage upload (2개 병렬) → 결과 path 두 개로 pages row
 * insert. Storage 실패 시 path null 로 row 만 들어감 — IndexedDB 가 backup.
 */

/**
 * 한 페이지의 Storage upload + pages row insert. Step1Upload loop 안에서 페이지별
 * 호출. WizardPage.id 를 그대로 pages.id 로 사용 (FK 일관성).
 */
export const insertPage = async (
  testId: string,
  pageNum: number,
  page: WizardPage,
  imageDataUrl: string,
  thumbDataUrl: string,
): Promise<string | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const [imagePath, thumbPath] = await Promise.all([
    uploadPageImage(testId, pageNum, imageDataUrl),
    uploadPageThumbnail(testId, pageNum, thumbDataUrl),
  ]);
  const payload = wizardPageToPageInsert(testId, pageNum, page, imagePath, thumbPath);
  const { data, error } = await supabase
    .from("pages")
    .upsert(payload, { onConflict: "id" })
    .select("id")
    .single();
  if (error) {
    // Phase I schema 미적용 fallback — crop_boxes / crop_inspected 빼고 재시도
    if (isSchemaCacheMiss(error.message)) {
      warnPageSchemaMigration();
      const stripped = stripOptionalPageColumns(payload as Record<string, unknown>);
      const { data: retryData, error: retryError } = await supabase
        .from("pages")
        .upsert(stripped, { onConflict: "id" })
        .select("id")
        .single();
      if (retryError) {
        console.warn(
          `[api/pages] insertPage retry failed: ${retryError.message} (code: ${retryError.code ?? "-"})`,
        );
        return null;
      }
      return retryData?.id ?? null;
    }
    console.warn(
      `[api/pages] insertPage failed: ${error.message} (code: ${error.code ?? "-"})`,
    );
    return null;
  }
  return data.id;
};

/** pages row 의 OCR 관련 컬럼 patch. usePageOcr 가 결과를 받은 시점에 호출.
 * cropBoxes / cropInspected 변경도 동일 channel — wizardStore action 이 호출. */
export const updatePageOcr = async (
  pageId: string,
  patch: Partial<PageInsert>,
): Promise<boolean> => {
  if (!SUPABASE_ENABLED || !supabase) return false;
  const { error } = await supabase.from("pages").update(patch).eq("id", pageId);
  if (error) {
    // Phase I schema 미적용 fallback
    if (isSchemaCacheMiss(error.message)) {
      warnPageSchemaMigration();
      const stripped = stripOptionalPageColumns(patch as Record<string, unknown>);
      if (Object.keys(stripped).length === 0) return true; // 컬럼만 빼면 update X
      const { error: retryError } = await supabase
        .from("pages")
        .update(stripped)
        .eq("id", pageId);
      if (retryError) {
        console.warn("[api/pages] updatePageOcr retry failed:", retryError.message);
        return false;
      }
      return true;
    }
    console.warn("[api/pages] updatePageOcr failed:", error.message);
    return false;
  }
  return true;
};

/** Phase C detail view 용 — 한 시험지의 모든 pages, page_num asc. */
export const loadPagesByTest = async (testId: string): Promise<PageRow[] | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const { data, error } = await supabase
    .from("pages")
    .select("*")
    .eq("test_id", testId)
    .order("page_num", { ascending: true });
  if (error) {
    console.warn("[api/pages] loadPagesByTest failed:", error.message);
    return null;
  }
  return data as PageRow[];
};
