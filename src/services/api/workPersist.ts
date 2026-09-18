import type { WizardHydrateSnapshot, WizardPage } from "@app/stores/wizardStore";
import type { TestInsert, TestStatusDb } from "./mappers";
import { deleteTest, upsertTest } from "./tests";
import { insertPageRow } from "./pages";
import { upsertOcrProblems } from "./problems";
import { upsertReviews } from "./reviews";
import { removeTestFolder, uploadPageImage, uploadPageThumbnail } from "./storage";

/**
 * 위자드 스냅샷 한 벌을 DB 에 새로 기록한다. 기출 편집본 생성("이어서 작업")과
 * 예전 브라우저 저장본의 DB 이전이 공유한다.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string): boolean => UUID_RE.test(id);

/**
 * DB 키는 uuid 만 받는다. 기출 원본 id(`testchange:q:…`)처럼 uuid 가 아닌
 * 페이지·문항·검토 id 를 새 uuid 로 바꾼다. 검토 id 는 같은 문항 id 와 짝을
 * 유지한다 (wizardSync 가 review.id 를 ocr_problem_id 로 쓴다).
 */
export const withUuidIds = (
  snapshot: WizardHydrateSnapshot,
): { snapshot: WizardHydrateSnapshot; ids: Map<string, string> } => {
  const ids = new Map<string, string>();
  const map = (id: string): string => {
    if (isUuid(id)) return id;
    let next = ids.get(id);
    if (!next) {
      next = crypto.randomUUID();
      ids.set(id, next);
    }
    return next;
  };
  return {
    ids,
    snapshot: {
      ...snapshot,
      pages: snapshot.pages.map((page) => ({
        ...page,
        id: map(page.id),
        ocrResult: page.ocrResult.map((item) => ({ ...item, id: map(item.id) })),
      })),
      problems: snapshot.problems.map((review) => ({ ...review, id: map(review.id) })),
    },
  };
};

/** 페이지 OCR 진행 상태로 tests 행의 상태 표시를 정한다 (wizardSync 와 같은 기준). */
export const testStatusOf = (
  pages: WizardPage[],
): { status: TestStatusDb; status_text: string; problem_count: number } => {
  const items = pages.flatMap((p) => p.ocrResult);
  const ocrDone = pages.length > 0 && pages.every((p) => p.ocrComplete || Boolean(p.ocrError));
  if (!ocrDone) {
    return { status: "draft", status_text: items.length ? "OCR 진행 중" : "OCR 대기", problem_count: items.length };
  }
  const warn = items.filter((it) => it.status === "warn" || it.status === "pending").length;
  return {
    status: warn > 0 ? "warn" : "ok",
    status_text: warn > 0 ? `검토 필요 ${warn}건` : "확정",
    problem_count: items.length,
  };
};

export interface PageImages {
  image: string | null;
  thumb: string | null;
}

/**
 * tests → pages(+Storage 이미지) → ocr_problems → problem_reviews 순서로 기록.
 * 중간에 하나라도 실패하면 만든 행과 파일을 지우고 false — 호출 측은 원본을
 * 그대로 두고 다음에 다시 시도할 수 있다. 스냅샷 id 는 모두 uuid 여야 한다.
 */
export const writeWorkSnapshot = async (
  test: TestInsert & { id: string },
  snapshot: WizardHydrateSnapshot,
  pageImages?: (page: WizardPage) => Promise<PageImages>,
): Promise<boolean> => {
  if (!(await upsertTest(test))) return false;
  const ok = await writeChildren(test.id, snapshot, pageImages).catch((err) => {
    console.warn("[api/workPersist] 저장 실패:", err);
    return false;
  });
  if (!ok) {
    await deleteTest(test.id);
    await removeTestFolder(test.id);
  }
  return ok;
};

const writeChildren = async (
  testId: string,
  snapshot: WizardHydrateSnapshot,
  pageImages?: (page: WizardPage) => Promise<PageImages>,
): Promise<boolean> => {
  for (const [index, page] of snapshot.pages.entries()) {
    const pageNum = index + 1;
    const { image, thumb } = pageImages ? await pageImages(page) : { image: null, thumb: null };
    const [imagePath, thumbPath] = await Promise.all([
      image ? uploadPageImage(testId, pageNum, image) : null,
      thumb ? uploadPageThumbnail(testId, pageNum, thumb) : null,
    ]);
    // 가진 이미지를 못 올렸으면 실패로 본다 — 원본(브라우저 사본)을 지우지 않게.
    if ((image && !imagePath) || (thumb && !thumbPath)) return false;
    if (!(await insertPageRow(testId, pageNum, page, imagePath, thumbPath))) return false;
    if (page.ocrResult.length > 0 && !(await upsertOcrProblems(page.id, page.ocrResult))) return false;
  }
  const problemIds = new Set(snapshot.pages.flatMap((p) => p.ocrResult.map((it) => it.id)));
  return upsertReviews(
    testId,
    snapshot.problems.map((review) => ({
      ocrProblemId: problemIds.has(review.id) ? review.id : null,
      review,
    })),
  );
};
