import type { TestPaper, TopicSlice, GeneratedProblem, VariantHistory } from "@app/types";
import type {
  WizardPage,
  OCRProblem,
  ProblemReview,
  OCRImage,
} from "@app/stores/wizardStore";

/**
 * DB row ↔ Wizard/Library 타입 변환.
 *
 * 우리 코드의 도메인 타입 (`TestPaper`, `WizardPage`, `OCRProblem`, `ProblemReview`)
 * 은 camelCase + 표시 친화적 필드 (`time: "오늘"`) 를 갖는다. Postgres 는
 * snake_case + ISO timestamp. 이 module 이 *유일한* 변환 지점.
 */

// ============================================================================
// DB Row 타입 — schema.sql 정확히 반영
// ============================================================================

export type TestStatusDb = "ok" | "warn" | "draft";

export interface TestRow {
  id: string;
  user_id: string;
  title: string;
  subject: string | null;
  grade: string | null;
  exam_category: string | null;
  problem_count: number;
  status: TestStatusDb;
  status_text: string | null;
  tags: string[];
  topic_distribution: TopicSlice[] | null;
  uploaded_file_name: string | null;
  created_at: string;
  updated_at: string;
}

/** INSERT/UPDATE payload — id 는 client 가 발급해 보낼 수도 있음. */
export type TestInsert = Partial<Omit<TestRow, "user_id" | "created_at" | "updated_at">> & {
  title: string;
};

export interface PageRow {
  id: string;
  test_id: string;
  page_num: number;
  rotation: 0 | 90 | 180 | 270;
  text_layer: string | null;
  is_problem_page: boolean;
  force_ocr: boolean | null;
  image_storage_path: string | null;
  thumb_storage_path: string | null;
  ocr_complete: boolean;
  ocr_model: string | null;
  ocr_error: string | null;
  created_at: string;
}

export type PageInsert = Partial<Omit<PageRow, "created_at">> & {
  test_id: string;
  page_num: number;
};

export interface OcrProblemRow {
  id: string;
  page_id: string;
  problem_number: number;
  topic: string | null;
  text: string;
  choices: string[] | null;
  answer: string | null;
  solution: string | null;
  solution_model: string | null;
  ocr_model: string | null;
  solution_warnings: Array<{ rule: string; summary: string; detail: string }> | null;
  body_missing: boolean | null;
  choices_missing: boolean | null;
  status: "ok" | "warn" | "pending";
  reviewed: boolean;
  images: OCRImage[] | null;
  created_at: string;
}

export type OcrProblemInsert = Partial<Omit<OcrProblemRow, "created_at">> & {
  page_id: string;
  problem_number: number;
  text: string;
};

export interface ReviewRow {
  id: string;
  test_id: string;
  ocr_problem_id: string | null;
  original_problem: GeneratedProblem;
  variant_problem: GeneratedProblem;
  status: "confirmed" | "review" | "pending";
  gen_model: string | null;
  gen_error: string | null;
  created_at: string;
}

export type ReviewInsert = Partial<Omit<ReviewRow, "created_at">> & {
  test_id: string;
  original_problem: GeneratedProblem;
  variant_problem: GeneratedProblem;
};

export interface VariantHistoryRow {
  id: string;
  test_id: string;
  intensity: 0 | 1 | 2;
  count: number;
  label: string | null;
  created_at: string;
}

export type VariantHistoryInsert = Partial<Omit<VariantHistoryRow, "created_at">> & {
  test_id: string;
  intensity: 0 | 1 | 2;
  count: number;
};

// ============================================================================
// 헬퍼
// ============================================================================

/**
 * ISO timestamp → 한국어 상대시간. TestPaper.time 표시용 — DB 에는 원본 ISO 보관,
 * 표시 시점에 매번 계산. 새로고침해도 "오늘" 이 "어제" 로 자연 갱신.
 */
export const formatRelativeKo = (iso: string): string => {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffMs = Date.now() - t;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHour = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay === 1) return "어제";
  if (diffDay < 7) return `${diffDay}일 전`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}주 전`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}개월 전`;
  return `${Math.floor(diffDay / 365)}년 전`;
};

// ============================================================================
// Row → Domain
// ============================================================================

/**
 * tests row → TestPaper. variants / problems 는 별도 join 안 함 (Phase B 에선
 * library 카드용 메타만). detail view 에서 별도 load.
 *
 * status 가 "draft" 면 UI 의 TestPaper.status 는 "warn" 으로 매핑 — TestStatus
 * 타입에 "draft" 가 있긴 하지만 LibraryScreen 의 chip 색은 ok/warn 만 받음.
 */
export const testRowToTestPaper = (row: TestRow): TestPaper => ({
  id: row.id,
  title: row.title,
  problemCount: row.problem_count,
  status: row.status,
  statusText: row.status_text ?? "",
  time: formatRelativeKo(row.created_at),
  subject: row.subject ?? "",
  tags: row.tags ?? [],
  grade: row.grade ?? "",
  topicDistribution: row.topic_distribution ?? [],
  variants: [],
  problems: [],
});

// ============================================================================
// Domain → Insert
// ============================================================================

export const testPaperToTestInsert = (
  t: Partial<TestPaper>,
  extras: { exam_category?: string | null; uploaded_file_name?: string | null } = {},
): TestInsert => ({
  ...(t.id !== undefined ? { id: t.id } : {}),
  title: t.title ?? "Untitled",
  subject: t.subject ?? null,
  grade: t.grade ?? null,
  exam_category: extras.exam_category ?? null,
  problem_count: t.problemCount ?? 0,
  status: (t.status ?? "draft") as TestStatusDb,
  status_text: t.statusText ?? null,
  tags: t.tags ?? [],
  topic_distribution: t.topicDistribution ?? null,
  uploaded_file_name: extras.uploaded_file_name ?? null,
});

export const wizardPageToPageInsert = (
  testId: string,
  pageNum: number,
  page: WizardPage,
  imageStoragePath: string | null = null,
  thumbStoragePath: string | null = null,
): PageInsert => ({
  id: page.id,
  test_id: testId,
  page_num: pageNum,
  rotation: page.rotation,
  text_layer: page.textLayer || null,
  is_problem_page: page.isProblemPage,
  force_ocr: page.forceOcr ?? false,
  image_storage_path: imageStoragePath,
  thumb_storage_path: thumbStoragePath,
  ocr_complete: page.ocrComplete,
  ocr_model: page.ocrModel ?? null,
  ocr_error: page.ocrError ?? null,
});

/**
 * OCRProblem → ocr_problems row.
 *
 * 주의: WizardStore 의 OCRProblem 에는 별도 `choices: string[]` 필드가 없고
 * 텍스트 안에 ①②③④⑤ 가 inline 으로 박혀있다. schema 의 `choices` JSONB 컬럼은
 * 향후 parse 결과를 저장할 자리 — Phase B 에선 null 로 두고, 후속 phase 에 본문
 * 파서 추가 시 채움.
 */
export const ocrProblemToInsert = (
  pageId: string,
  item: OCRProblem,
): OcrProblemInsert => ({
  id: item.id,
  page_id: pageId,
  problem_number: item.number,
  topic: item.topic ?? null,
  text: item.text,
  choices: null,
  answer: item.answer ?? null,
  solution: item.solution ?? null,
  solution_model: item.solutionModel ?? null,
  ocr_model: item.ocrModel ?? null,
  solution_warnings: item.solutionWarnings ?? null,
  body_missing: item.bodyMissing ?? false,
  choices_missing: item.choicesMissing ?? false,
  status: item.status,
  reviewed: item.reviewed,
  images: item.images ?? null,
});

export const reviewToInsert = (
  testId: string,
  ocrProblemId: string | null,
  review: ProblemReview,
): ReviewInsert => ({
  id: review.id,
  test_id: testId,
  ocr_problem_id: ocrProblemId,
  original_problem: review.original,
  variant_problem: review.variant,
  status: review.status,
  gen_model: review.genModel ?? null,
  gen_error: review.genError ?? null,
});

// ============================================================================
// Row → Wizard 타입 (Phase C detail view — OCRItem / SolutionItem 재사용)
// ============================================================================

/**
 * DB row → WizardStore 의 OCRProblem. UI 컴포넌트 (OCRItem / SolutionItem) 가
 * 그대로 받을 수 있는 형태. in-flight 휘발 필드는 모두 undefined — Detail
 * view 에선 *읽기 전용* 이라 generating / startedAt 의미 없음.
 */
export const ocrProblemRowToWizard = (row: OcrProblemRow): OCRProblem => ({
  id: row.id,
  number: row.problem_number,
  text: row.text,
  topic: row.topic ?? undefined,
  images: row.images ?? undefined,
  status: row.status,
  reviewed: row.reviewed,
  bodyMissing: row.body_missing ?? undefined,
  choicesMissing: row.choices_missing ?? undefined,
  solution: row.solution ?? undefined,
  answer: row.answer ?? undefined,
  solutionModel: row.solution_model ?? undefined,
  solutionWarnings: row.solution_warnings ?? undefined,
  ocrModel: row.ocr_model ?? undefined,
});

export const reviewRowToWizard = (row: ReviewRow): ProblemReview => ({
  id: row.id,
  original: row.original_problem,
  variant: row.variant_problem,
  status: row.status,
  genModel: row.gen_model ?? undefined,
  genError: row.gen_error ?? undefined,
});

/**
 * variant_history row → TestPaper.variants 의 VariantHistory.
 * Phase D: DetailScreen 에서 detail.history 를 test.variants 로 enrich.
 */
export const historyRowToVariant = (row: VariantHistoryRow): VariantHistory => ({
  id: row.id,
  createdAt: formatRelativeKo(row.created_at),
  intensity: row.intensity,
  count: row.count,
  label: row.label ?? undefined,
});
