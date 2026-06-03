import type {
  WizardStepIndex,
  WizardPage,
  ProblemReview,
  WizardHydrateSnapshot,
  ExamCategory,
} from "@app/stores/wizardStore";
import type { GradeKey } from "@app/services/ai/mathDefense";
import { loadDetailData } from "@app/hooks/useDetailData";
import { getTestRow } from "@app/services/api/tests";
import { pageRowToWizard } from "@app/services/api/mappers";
import { restoreThumbnail } from "@app/lib/imageRestore";

/**
 * "이어서 작업" — 저장된 시험지(Supabase)를 위자드 스냅샷으로 변환.
 *
 * DetailScreen 의 "이어서 작업" 버튼이 `hydrateWizardFromTest` 를 호출하고,
 * 결과 스냅샷을 `wizardStore.hydrateFromTest` 에 넘겨 위자드 state 를 복원한다.
 */

// ── 페이지별 Storage path 사이드 채널 ──────────────────────────────────────
// hydrate 시 채워지고, 재OCR lazy 이미지 복원(`imageRestore.ensurePageImage`)이
// 조회한다. WizardPage 타입에 image_storage_path 컬럼을 넣지 않기 위한 우회.
const storagePathByPage = new Map<string, string | null>();

/** 페이지 id 의 Storage hi-res 이미지 경로. hydrate 안 된 페이지는 null. */
export const getPageStoragePath = (pageId: string): string | null =>
  storagePathByPage.get(pageId) ?? null;

/**
 * 시험지 완성도로 재진입 step 판정 (위→아래 첫 매치).
 * step 0(업로드)로는 자동 진입하지 않는다 — 진입 후 Stepper 로 이동.
 *
 * Phase I-6 시점 step 매핑: 0=업로드, 1=검수, 2=OCR, 3=해설, 4=옵션, 5=검토,
 * 6=내보내기. 검수 단계는 자동 진입 안 함 (cropDetect 결과 박스 검토 의무
 * 아님 — 사용자가 명시적 다음 단계 클릭으로만 진입).
 *
 * `furthestStep` (tests.furthest_step, wizardSync 가 DB 저장) — 데이터가 모두
 * 완료된 시험지일 때, *이전에 내보내기(6)까지 도달했으면* 그 단계에서 이어가게
 * 한다. 사용자 보고 (2026-06-04): 내보내기(7/7)에서 저장 후 "이어하기" 하면 항상
 * 검토(6/7)로 시작 — 마지막 단계 복원 안 됨. 단, 한 번도 내보내기에 안 갔던
 * 시험지는 종전대로 검토(5)에서 시작 (첫 진입 시 내보내기 자동진입 안 함 유지).
 */
export const decideResumeStep = (
  pages: WizardPage[],
  problems: ProblemReview[],
  furthestStep = 0,
): WizardStepIndex => {
  const problemPages = pages.filter((p) => p.isProblemPage || p.forceOcr);
  if (problemPages.length === 0) return 2; // OCR — 추출된 문제 페이지 없음
  const ocrDone = problemPages.every((p) => p.ocrComplete || Boolean(p.ocrError));
  if (!ocrDone) return 2; // OCR 미완료
  const allItems = problemPages.flatMap((p) => p.ocrResult);
  const solEligible = allItems.filter((it) => it.text && !it.bodyMissing);
  const solDone =
    solEligible.length > 0 &&
    solEligible.every((it) => it.solution || it.solutionError);
  if (!solDone) return 3; // 해설 미완료
  if (problems.length === 0) return 4; // 옵션 — 변형 전
  // 데이터 완료 — 기본 검토(5). 단, 이전에 내보내기(6)까지 도달했으면 거기서 이어감.
  return furthestStep >= 6 ? 6 : 5;
};

/**
 * 저장된 시험지를 위자드 스냅샷으로 변환. pages 0건이면 null (진입 거부 — 호출
 * 측이 토스트 등으로 안내). `SUPABASE_ENABLED=false` 면 loadDetailData 가 빈
 * 결과 → 자연히 null.
 */
export const hydrateWizardFromTest = async (
  testId: string,
): Promise<WizardHydrateSnapshot | null> => {
  const [detail, testRow] = await Promise.all([
    loadDetailData(testId, { withSignedUrls: false }),
    getTestRow(testId),
  ]);
  if (detail.pages.length === 0) return null;

  // pages → WizardPage[] — ocr_problems 를 page_id 로 그룹핑해 각 페이지에 주입.
  // 썸네일은 Storage 에서 받아 IndexedDB 에 캐시 + thumbRef 채움 (위자드
  // PageThumbColumn 표시용). 썸네일은 작아서 hydrate 시점 eager 복원해도 부담 없음.
  const pages: WizardPage[] = await Promise.all(
    detail.pages.map(async (row) => {
      const wp = pageRowToWizard(row, detail.problemsByPage.get(row.id) ?? []);
      const thumbRef = await restoreThumbnail(row.thumb_storage_path);
      return thumbRef ? { ...wp, thumbRef } : wp;
    }),
  );

  // 재OCR lazy 복원용 storage path 맵 갱신.
  storagePathByPage.clear();
  for (const row of detail.pages) {
    storagePathByPage.set(row.id, row.image_storage_path ?? null);
  }

  const problems: ProblemReview[] = detail.reviews;

  return {
    testId,
    step: decideResumeStep(pages, problems, testRow?.furthest_step ?? 0),
    pages,
    problems,
    selectedGrade: (testRow?.grade ?? null) as GradeKey | null,
    examCategory: (testRow?.exam_category ?? null) as ExamCategory | null,
    uploadedFileName: testRow?.uploaded_file_name ?? null,
  };
};
