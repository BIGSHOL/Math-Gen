import { supabase, SUPABASE_ENABLED } from "./supabase";
import type { WizardPage } from "@app/stores/wizardStore";
import { uploadPageImage, uploadPageThumbnail } from "./storage";
import {
  wizardPageToPageInsert,
  type PageRow,
  type PageInsert,
} from "./mappers";

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
    console.warn(
      `[api/pages] insertPage failed: ${error.message} (code: ${error.code ?? "-"})`,
    );
    return null;
  }
  return data.id;
};

/** pages row 의 OCR 관련 컬럼 patch. usePageOcr 가 결과를 받은 시점에 호출. */
export const updatePageOcr = async (
  pageId: string,
  patch: Partial<PageInsert>,
): Promise<boolean> => {
  if (!SUPABASE_ENABLED || !supabase) return false;
  const { error } = await supabase.from("pages").update(patch).eq("id", pageId);
  if (error) {
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
