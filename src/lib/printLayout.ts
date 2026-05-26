import type {
  ExportSource,
  PrintTemplate,
  ProblemReview,
} from "@app/stores/wizardStore";
import type { GeneratedProblem } from "@app/types";

/**
 * Step 5 의 인쇄 layout 알고리즘. mathlab `lib/utils/print-estimate.ts` +
 * `paginateQuestions` 의 알고리즘을 mathg-gen 데이터 모델 (`ProblemReview` =
 * { original, variant }) 에 맞게 차용.
 *
 * **핵심 차이점**:
 *   - mathlab: 한 페이지 한 카드 = 한 문제 본문
 *   - mathg-gen: `exportSource === "both"` 시 한 카드 안에 *원본 + 변형* 두
 *     본문 → 높이 합산 2x. 페이지 분할이 그만큼 자주 발생.
 *
 * **안전 margin** (CRITICAL): mathlab `PAGE_CONTENT_HEIGHT = 880` 을 우리는
 * `820` 으로 보수적으로 축소. mathg-gen 의 카드 내부 패딩 (`<MarkdownRenderer
 * className="prose">`) 이 mathlab 보다 살짝 크고, KaTeX heavy 문항의 추정
 * 오차 흡수. 한 페이지 11~12 문항 → 10~11 문항으로 자연 감소.
 */
export const PAGE_CONTENT_HEIGHT = 980;

/**
 * Template 별 페이지 가용 컨텐츠 높이 (px). paginateProblems 가 한 페이지에
 * 몇 문항을 넣을지 결정할 때 사용.
 *
 * **첫 페이지 vs 이후 페이지** 분기 — 첫 페이지는 헤더 (시험 정보표 + 학생
 * 정보표 + OMR 안내 등) 가 ~200~300px 추가 차지. 사용자 보고 (5번 문항이
 * 페이지 하단 침범) → 첫 페이지 가용 높이 보수화.
 *
 * - **workbook / jaseup 1단**: 풀이공간 카드 flex:1 → 페이지당 3~4 문항.
 * - **pyeongga**: 박스 헤더만, OMR 표 없음 → 첫 페이지도 충분히 들어감.
 * - **jeongtong / modern**: 시험 정보표 + 학생 정보표 + OMR 안내 → 첫 페이지 -240.
 * - **yuhyung**: 검정 배너 + 핵심 전략 → 첫 페이지 -100.
 */
export function getPageContentHeight(
  template: PrintTemplate,
  columns: 1 | 2,
  isFirstPage = false,
): number {
  if ((template === "workbook" || template === "jaseup") && columns === 1) {
    // workbook/jaseup 1단 — 풀이공간 stretch 로 페이지당 3~4 문항.
    return isFirstPage ? 600 : 720;
  }
  if (template === "pyeongga" && columns === 2) {
    return isFirstPage ? 900 : 1000;
  }
  if ((template === "jeongtong" || template === "modern") && isFirstPage) {
    // 첫 페이지에 시험 정보표 + 학생 정보표 + OMR 안내 (~240px).
    return 740;
  }
  if (template === "yuhyung" && isFirstPage) {
    // 검정 배너 + 핵심 전략 (~100px).
    return 880;
  }
  return PAGE_CONTENT_HEIGHT;
}

const ITEM_VERTICAL_PADDING_PX = 16;
const NUMBER_META_PX = 45; // 문항 번호 + 메타 (chapter/difficulty) 라인
const VARIANT_SEPARATOR_PX = 18; // "both" 일 때 원본↔변형 사이 dashed 구분선
const ORIGINAL_DIAGRAM_AVG_PX = 200; // OCR 페이지 이미지 crop 평균 높이

/**
 * KaTeX 수식을 짧은 placeholder 로 치환해 렌더링 기준 글자수 추정. mathlab
 * 과 동일 — `@@@@` (block) / `@@` (inline) 로 카운트 보정.
 */
export function estimateRenderedLength(text: string): number {
  return text.replace(/\$\$[^$]+\$\$/g, "@@@@").replace(/\$[^$]+\$/g, "@@").length;
}

/**
 * 보기 1열/2열 결정. choices 의 *원시 텍스트* (마커 제외) 의 최대 길이 25
 * 초과 → 1열 (긴 식). 25 이하 → 2열. mathlab `resolveChoiceCols` 동일.
 */
export function resolveChoiceCols(choices: string[] | undefined): 1 | 2 {
  if (!choices || choices.length === 0) return 2;
  const maxLen = Math.max(
    ...choices.map((c) => c.replace(/^[①②③④⑤]\s*/, "").length),
  );
  return maxLen > 25 ? 1 : 2;
}

interface SingleVariantEstimate {
  question: string;
  choices?: string[];
}

export interface MathgenEstimateInput {
  problem: ProblemReview;
  exportSource: ExportSource;
  template: PrintTemplate;
  columns: 1 | 2;
  spacing: number;
  /**
   * 원본에 OCRImage(bbox) 도형이 있고 exportSource 가 원본을 포함할 때 추가
   * 높이. variant 의 diagramSVG 는 본문 텍스트로 카운트되어 자동 포함.
   */
  hasOriginalDiagramCrop?: boolean;
}

/**
 * 한 ProblemReview 가 인쇄 시 차지할 대략 px 높이를 추정.
 *
 * exportSource 별 합산 로직:
 *   - "variant" → variant 본문 1 개
 *   - "original" → original 본문 1 개
 *   - "both" → 두 본문 + dashed 구분선 패딩
 */
export function estimateProblemHeight(input: MathgenEstimateInput): number {
  const { problem, exportSource, template, columns, spacing, hasOriginalDiagramCrop } =
    input;

  const variants: SingleVariantEstimate[] = [];
  if (exportSource === "original" || exportSource === "both") {
    variants.push({
      question: problem.original.question,
      choices: problem.original.choices,
    });
  }
  if (exportSource === "variant" || exportSource === "both") {
    variants.push({
      question: problem.variant.question,
      choices: problem.variant.choices,
    });
  }
  if (variants.length === 0) {
    return ITEM_VERTICAL_PADDING_PX + NUMBER_META_PX + Math.max(0, spacing);
  }

  let h = ITEM_VERTICAL_PADDING_PX + NUMBER_META_PX;

  // mathg-gen 은 mathlab 의 `large` template 을 채택하지 않음 → isLarge=false.
  // template 별 charsPerLine 차이는 large 외에는 동일이라 컬럼 수만 분기.
  const isLarge = (template as string) === "large";
  const charsPerLine = columns === 1 ? (isLarge ? 35 : 60) : (isLarge ? 20 : 30);
  const lineH = isLarge ? 34 : 24;
  const choiceRowH = isLarge ? 36 : 28;

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const lines = Math.ceil(estimateRenderedLength(v.question) / charsPerLine);
    h += Math.max(1, lines) * lineH;

    if (v.choices && v.choices.length > 0) {
      const cols = resolveChoiceCols(v.choices);
      const rows = Math.ceil(v.choices.length / cols);
      h += rows * choiceRowH + 10;
    }

    // "both" 시 첫 variant 다음에 구분선 패딩 추가.
    if (exportSource === "both" && i === 0 && variants.length > 1) {
      h += VARIANT_SEPARATOR_PX;
    }
  }

  if (
    hasOriginalDiagramCrop &&
    (exportSource === "original" || exportSource === "both")
  ) {
    h += ORIGINAL_DIAGRAM_AVG_PX;
  }

  h += Math.max(0, spacing);
  return h;
}

/**
 * 한 페이지의 layout. 1단이면 columns = [모든문제], 2단이면 [col0, col1].
 *
 * `startingNumber` 는 *전역 1-indexed 문항 번호* 의 시작. 페이지 N 의 첫
 * 문항 번호 = startingNumber.
 */
export interface PaginatedPage {
  columns: ProblemReview[][];
  startingNumber: number;
}

export interface PaginateInput {
  problems: ProblemReview[];
  exportSource: ExportSource;
  template: PrintTemplate;
  columns: 1 | 2;
  spacing: number;
  /** problem.id → hasOriginalDiagramCrop. Step5Export 에서 crop 완료 후 전달. */
  diagramMap?: Map<string, boolean>;
}

/**
 * 문항 배열을 페이지별로 분할. mathlab `paginateQuestions` (L82-117) 의
 * 알고리즘 그대로:
 *   - 한 문항이 페이지 경계 걸치지 않음 (들어가지 못하면 다음 컬럼/페이지)
 *   - 2단: 첫 컬럼 가득→두번째 컬럼, 둘 다 가득→새 페이지
 *   - 1단: 단일 컬럼만 사용
 */
export function paginateProblems(input: PaginateInput): PaginatedPage[] {
  const { problems, exportSource, template, columns, spacing, diagramMap } = input;
  if (problems.length === 0) return [];

  const pages: PaginatedPage[] = [];
  let currentPage: ProblemReview[][] = Array.from({ length: columns }, () => []);
  let currentColumnIdx = 0;
  let currentH = 0;
  let startingNumber = 1;
  let runningNumber = 1;
  // template 별 가용 높이 — 첫 페이지 vs 이후 페이지 분기.
  let pageH = getPageContentHeight(template, columns, /* isFirstPage */ true);

  for (const p of problems) {
    const qh = estimateProblemHeight({
      problem: p,
      exportSource,
      template,
      columns,
      spacing,
      hasOriginalDiagramCrop: diagramMap?.get(p.id) ?? false,
    });

    if (currentPage[currentColumnIdx].length > 0 && currentH + qh > pageH) {
      if (columns === 2 && currentColumnIdx === 0) {
        currentColumnIdx = 1;
        currentPage[1] = [p];
        currentH = qh;
      } else {
        pages.push({ columns: currentPage, startingNumber });
        startingNumber = runningNumber;
        currentPage = Array.from({ length: columns }, () => []);
        currentColumnIdx = 0;
        currentPage[0].push(p);
        currentH = qh;
        // 이후 페이지 — 헤더 없음 → 가용 높이 증가.
        pageH = getPageContentHeight(template, columns, /* isFirstPage */ false);
      }
    } else {
      currentPage[currentColumnIdx].push(p);
      currentH += qh;
    }
    runningNumber++;
  }
  if (currentPage[0].length > 0) {
    pages.push({ columns: currentPage, startingNumber });
  }
  return pages;
}

/**
 * 정답 + 해설 페이지 분할. 정답 페이지는 *CSS columns 자동 흐름* 을 쓰므로
 * mathlab 처럼 정밀하지 않게, 단순 휴리스틱 (entry 당 평균 px) 으로 split.
 *
 * 첫 정답 페이지에는 *빠른 정답 그리드* 영역 (~ 200px) 이 추가로 차지.
 */
const ANS_PAGE_H = PAGE_CONTENT_HEIGHT;
const QUICK_GRID_AVG_H = 200;
const ANS_ENTRY_AVG_H_QUICK = 28; // quickAnswerOnly true 일 때 한 entry
const ANS_ENTRY_AVG_H_FULL = 90; // 해설 포함 시

interface PaginateAnswerKeyInput {
  problems: ProblemReview[];
  exportSource: ExportSource;
  quickAnswerOnly: boolean;
  spacing: number;
}

/**
 * 정답 페이지 분할 결과. 각 entry 는 *원본 problems 배열의 1-indexed 번호*
 * 의 묶음. 첫 번째 페이지는 빠른 정답 그리드도 포함하므로 entries 가 더 적음.
 */
export interface PaginatedAnswerPage {
  /** problems 배열의 1-indexed 글로벌 번호. */
  questionNumbers: number[];
}

export function paginateAnswerKey({
  problems,
  exportSource: _exportSource,
  quickAnswerOnly,
  spacing,
}: PaginateAnswerKeyInput): PaginatedAnswerPage[] {
  if (problems.length === 0) return [];
  const entryH =
    (quickAnswerOnly ? ANS_ENTRY_AVG_H_QUICK : ANS_ENTRY_AVG_H_FULL) +
    Math.max(0, spacing) * 0.3;
  // 정답 + 해설 페이지는 CSS columns 2 단이라 가용 높이 2 배.
  const colsMultiplier = 2;

  const pages: PaginatedAnswerPage[] = [];
  let currentPage: number[] = [];
  let cumH = 0;

  for (let i = 0; i < problems.length; i++) {
    const isFirstPage = pages.length === 0;
    const pageAvail =
      (isFirstPage ? ANS_PAGE_H - QUICK_GRID_AVG_H : ANS_PAGE_H) * colsMultiplier;
    if (currentPage.length > 0 && cumH + entryH > pageAvail) {
      pages.push({ questionNumbers: currentPage });
      currentPage = [i + 1];
      cumH = entryH;
    } else {
      currentPage.push(i + 1);
      cumH += entryH;
    }
  }
  if (currentPage.length > 0) {
    pages.push({ questionNumbers: currentPage });
  }
  return pages;
}

/**
 * exportSource 에 따라 *문항의 출력용 본문* 만 추려서 GeneratedProblem 으로
 * 반환. PrintQuestionBlock 안에서 사용.
 *
 * `both` 일 때는 호출 측에서 두 본문을 동시 렌더해야 하므로 이 함수가 아닌
 * `problem.original` / `problem.variant` 를 직접 접근.
 */
export function pickProblemBody(
  problem: ProblemReview,
  exportSource: ExportSource,
): GeneratedProblem {
  if (exportSource === "original") return problem.original;
  return problem.variant;
}
