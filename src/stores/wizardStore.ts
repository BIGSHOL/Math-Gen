import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { GeneratedProblem } from "@app/types";
import type { GradeKey } from "@app/services/ai/mathDefense";
import { matchLegacyTemplate } from "@app/lib/printTemplateMigration";
import type { FontPackId } from "@app/lib/printFontPacks";

/**
 * 5-step Wizard state.
 *
 * Persistence strategy (per plan section 4.0):
 *   - zustand `persist` middleware + sessionStorage
 *   - File / Blob / large base64 page images are *not* persisted directly;
 *     instead they live in IndexedDB and we store only the ref id here
 *     (see `pages[].imageRef`)
 *   - `beforeunload` warning is wired up by `useWizardGuard` hook
 *
 * On Wizard mount we hydrate from sessionStorage and (if there's state
 * from a prior session) show a "이어하기 / 새로 시작" dialog.
 */

export type WizardStepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type ConversionGoal = "digitize" | "similar" | "variant" | "targeted";
export type DifficultyShift = "easier" | "same" | "harder";
export type ExportFormat = "pdf" | "hwp" | "docx" | "online";

/**
 * 시험 종류 — mathlab `ExamUploadForm.tsx` 의 examCategory 벤치마킹. 현재는
 * 메타데이터로만 저장. 후속 phase 에서 검증 프롬프트에 활용 예정 (예: 수능
 * 기출에 대해선 더 엄격한 표기 규칙).
 */
export type ExamCategory = "MIDTERM" | "FINAL" | "MOCK" | "OTHER";

/**
 * Step 5 (PDF 내보내기 + 인쇄) 의 layout 템플릿.
 *
 * design_handoff_print_templates 의 6 신규 디자인 (pyeongga / jeongtong /
 * modern / workbook / jaseup / yuhyung) 으로 *완전 교체*. 기존 4 (exam /
 * default / minimal / classic) 는 `matchLegacyTemplate` 헬퍼가 가까운 값으로
 * 자동 매핑. 정의 source: `@app/components/print/types`.
 */
export type { PrintTemplate } from "@app/components/print/types";
import type { PrintTemplate } from "@app/components/print/types";

/**
 * Step 5 의 출력 대상. 라디오 선택:
 *   - variant: 변형 문제만 (기본)
 *   - original: 원본 문제만
 *   - both: 한 카드에 원본 + 변형 둘 다 (검토 자료용)
 */
export type ExportSource = "variant" | "original" | "both";

/**
 * Step 5 의 인쇄 layout 옵션. mathlab `PrintOptions` 패턴 차용 (`showDivider`
 * 만 제거 — mathg-gen 카드 디자인 충돌).
 */
export interface PrintOptions {
  template: PrintTemplate;
  /** 강조 색상 (hex). default: mathg-gen accent (#0EA5E9). */
  color: string;
  columns: 1 | 2;
  /** 문항 간 세로 여백 (px). 0~150. */
  spacing: number;
  /** 정답 + 해설 페이지 포함 여부. */
  showAnswers: boolean;
  /** showAnswers true 일 때 — 해설 생략하고 빠른 정답만. */
  quickAnswerOnly: boolean;
  showDate: boolean;
  showChapter: boolean;
  showDifficulty: boolean;
  /** 2단 일 때 컬럼 사이 세로 구분선. 1단 이면 무시. */
  columnDivider: boolean;
  /** 한글 폰트 팩 (sans/serif 한 쌍). FONT_PACKS 의 id. */
  fontPack: FontPackId;
}

/**
 * 기본 PrintOptions — Step5 첫 진입 시 사용. mathlab 의 default 값에서
 * mathg-gen accent 색 + showChapter false (chapter 메타는 우리 데이터에서
 * 거의 비어 있어 노이즈).
 */
export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  template: "jeongtong", // 한국 학교 시험지 표 양식 — 가장 일반적
  color: "#1B2A4E", // navy — jeongtong / modern 의 default accent
  columns: 1, // jeongtong 기본 1단
  spacing: 18,
  showAnswers: false,
  quickAnswerOnly: false,
  showDate: true,
  showChapter: true, // 6 신규 template 의 chapter chip 도 표시 default 권장
  showDifficulty: true,
  columnDivider: false,
  fontPack: "system",
};

/**
 * Step 1.5 검수 단계의 크롭 박스. ?croptest 의 cropDetect 가 자동 검출 →
 * 사용자가 Step 1.5 에서 검토/편집 → Step 2 의 cropped Pass 2 가 이 박스만
 * 잘라 GPT-5.5 재OCR.
 *
 *  - id      : crypto.randomUUID(). React stable key.
 *  - class   : 시각 분류 (색상 코딩) + Pass 2 트리거 판정. "problem" 만 Pass 2
 *              대상; "figure"/"table" 은 시각 참조용 메모 (후속 Phase K 에서 활용).
 *  - bbox    : [yMin, xMin, yMax, xMax] 0–1000 그리드 (cropDetect.ts 와 동일 contract).
 *  - verified: 사용자 명시적 OK 표시. Phase I 에서는 markAllCropInspected 가
 *              페이지 단위로 cropInspected=true 로 일괄 처리 — 박스별 verified
 *              플래그는 향후 per-box 워크플로 확장용 reserved.
 *  - source  : "ai" = cropDetect 결과 / "user" = 사용자가 새로 그림 / "edited" =
 *              AI 결과를 편집 (bbox 또는 class 변경 시 "ai"→"edited" 자동 전환).
 *  - number  : 인쇄된 문항 번호 — Pass 2 결과 merge 시 OCRProblem.number 매칭 key.
 */
export interface CropBox {
  id: string;
  class: "problem" | "figure" | "table";
  bbox: [number, number, number, number];
  verified: boolean;
  source: "ai" | "user" | "edited";
  number?: number;
}

export interface WizardPage {
  id: string;
  /** IndexedDB ref id for the hi-res image (pageImages store). */
  imageRef: string;
  /** IndexedDB ref id for the low-res thumbnail (pageThumbnails store). */
  thumbRef: string;
  /** PDF text layer for this page — used as OCR hint and skip heuristic. */
  textLayer: string;
  /** Pre-computed at Step 1 via `isProblemPage(textLayer)`. */
  isProblemPage: boolean;
  ocrResult: OCRProblem[];
  /** Set true when this page's OCR call has resolved (or was skipped). */
  ocrComplete: boolean;
  /** Per-page failure message — surfaces a retry banner in the OCR pane. */
  ocrError?: string;
  /** User opted-in to extract a page that the skip heuristic excluded. */
  forceOcr?: boolean;
  /**
   * Which model produced the current `ocrResult`. The UI surfaces this as
   * a small badge so the user knows whether they're looking at the fast
   * (1차) or precise (2차) transcription. As of the hybrid-routing change
   * pass-1 is Gemini Flash-Lite and pass-2 is Gemini 3.1 Pro, but legacy
   * Sonnet/Opus identifiers are kept here so older session results don't
   * lose their badge after the migration.
   */
  ocrModel?:
    | "gemini-3.1-flash-lite"
    | "gemini-3.1-pro-preview"
    | "claude-sonnet-4-6"
    | "claude-opus-4-7";
  /** True while the Opus precision second pass is in flight. */
  upgrading?: boolean;
  /**
   * 페이지 회전(rotation, 시계 방향, degrees). 일부 PDF가 가로 저장돼 있어
   * 정상 OCR 위해 회전이 필요. Step1Upload 가 `detectPageRotation` 으로
   * 자동 감지하고, 사용자가 *업로드 단계* 미리보기 그리드의 ⟲ 버튼으로
   * 수동 override (회전은 OCR 이전에만 — 이후 회전은 problems stale 유발).
   * 실제 이미지 변환은 OCR 호출 시점에만 `applyRotation(dataUrl, rotation)`
   * 으로 적용 — IndexedDB 의 원본 이미지는 그대로 둔다.
   */
  rotation: 0 | 90 | 180 | 270;
  /**
   * 현재 OCR 진행 중인 모델 id (체인 폴백 시 갱신됨). 비어 있으면 진행
   * 중인 호출이 없다는 뜻. `partialize` 에서 *제외* (휘발성 in-flight 상태).
   */
  ocrInflightModel?: string;
  /**
   * OCR worker 가 *호출을 시작한 시점* 의 timestamp (ms). PageThumbColumn 의
   * 경과 시간 표시 ("12s") 와 stuck 감지에 사용. `ocrInflightModel` set 직전에
   * set, unset 직후에 unset. `partialize` 에서 *제외* (휘발성).
   */
  ocrStartedAt?: number;
  /**
   * Phase I — Step 1.5 검수 단계의 박스 결과. undefined = 아직 cropDetect
   * 안 돈 상태 (useCropDetect 가 mount 시 트리거). 빈 배열 = 검출 시도했으나
   * 0박스 (사용자 수동 추가 필요).
   */
  cropBoxes?: CropBox[];
  /**
   * Step 1.5 통과 표시 — 사용자가 "다음 단계" 또는 "건너뛰기" 클릭 시 true.
   * Pass 2 (cropped) 트리거 조건: cropInspected && cropBoxes.length > 0.
   */
  cropInspected?: boolean;
  /** useCropDetect in-flight 플래그. `partialize` 에서 *제외* (휘발성). */
  cropDetectInflight?: boolean;
  /** cropDetect 호출 실패 메시지 — Step 1.5 재시도 배너용. */
  cropDetectError?: string;
}

export interface OCRImage {
  /** Normalized 0–1000 bbox: [yMin, xMin, yMax, xMax]. */
  box: [number, number, number, number];
  /** Short Korean label (e.g. "정사각형 ABCD", "거북이 이동 경로"). */
  label: string;
}

export interface OCRProblem {
  id: string;
  number: number;
  text: string; // markdown + LaTeX
  topic?: string;
  /** Diagrams / figures embedded in this problem — cropped from the page on render. */
  images?: OCRImage[];
  /** Confidence band — drives the OCRItem warning border. */
  status: "ok" | "warn" | "pending";
  /** True after the user has reviewed / edited this item. */
  reviewed: boolean;
  /**
   * 모델이 본문(body) 추출에 실패해 옵션·짧은 단편만 emit한 케이스 마커.
   * UI에서 카드 상단에 명시적 경고 배너를 띄워 사용자가 인지하도록 한다.
   * `normalizeResponse` 내부의 `isBodyTooShort` 휴리스틱으로 설정됨.
   */
  bodyMissing?: boolean;
  /**
   * 객관식 발문(`?` / `구하시오` / `옳은 것은` 등)인데 ①②③④⑤ 마커가
   * 빠진 케이스 마커. 모델이 본문만 추출하고 보기를 누락한 상황.
   * `isChoicesMissing` 휴리스틱으로 설정됨. bodyMissing 과 별도 배너로 표시.
   */
  choicesMissing?: boolean;
  // ── Step 3 (해설·정답 생성) 필드 ─────────────────────────────
  /**
   * 단계별 풀이 — markdown + LaTeX. `[1단계: 조건 정리]` 같은 헤더로
   * 분리된 학원/문제집 스타일. `generateSolution` 으로 채워지고
   * 사용자가 편집 모드에서 수정 가능.
   */
  solution?: string;
  /**
   * 짧은 정답. 객관식이면 `"③ 5"` 형태, 주관식이면 최종 값만
   * (`"5"` / `"$\\frac{4\\pi}{3}$"` / `"x=2"`).
   */
  answer?: string;
  /** 해설 생성 in-flight 플래그 — UI 에서 spinner 표시용. dispatched 직후 즉시
   *  true 가 됨 (limit 큐 대기 포함). 실제 *진행* 인지 *대기* 인지 구분하려면
   *  `solutionStartedAt` 도 같이 확인. */
  solutionGenerating?: boolean;
  /**
   * 해설 생성의 *실제 호출 시작* timestamp (ms). useSolutionGen 의 limit() async
   * fn 첫 줄에서 set. 큐 대기 중에는 undefined → SolutionItem 의 "대기 중"
   * vs "생성 중 · 12s" 구분에 사용. 완료/실패 시 unset. partialize 에서 제외.
   */
  solutionStartedAt?: number;
  /** 해설 생성 실패 메시지 (친화적 한국어). 재시도 버튼과 함께 표시. */
  solutionError?: string;
  /** 어떤 모델이 해설을 만들었는지 (디버그·UI 배지). */
  solutionModel?: string;
  /**
   * 정확도 휴리스틱 검증 결과 — `lib/solutionValidator.ts` 가 검출한 *구조적
   * 오류 가능성* (예: "서로 다른 N 개" 조건 위반 튜플). UI 의 SolutionItem 이
   * warning banner 로 노출 + 재생성 권장. 답을 *무효화하지 않음* (false
   * positive 위험 때문).
   */
  solutionWarnings?: Array<{
    rule: string;
    summary: string;
    detail: string;
  }>;
  /**
   * Phase G: validator warning 검출 시 자동 재생성 1회 시행 여부. true 면 더
   * 이상 자동 retry 안 함 (수동 재시도는 별개 — `solution=undefined` 로 reset
   * 하면 동일 cycle 에서 한 번 더 시도하되 *자동 retry 는 발동 X*).
   */
  solutionAutoRetried?: boolean;
  /**
   * 이 문항을 OCR 한 모델 (디버그·UI 배지). 같은 페이지 안의 모든 item 은
   * 기본적으로 동일 (페이지 단위 호출이라). task #41 (item 별 재실행) 도입
   * 시 item 마다 다른 모델 가능 — 그 때 자연스럽게 분기.
   *
   * `usePageOcr` 가 페이지 OCR 성공 시 각 item 에 페이지 모델을 복사.
   */
  ocrModel?: string;
  /**
   * Phase F (OCR Tier 2): vision 모델이 추출한 vector 도형 spec. 있으면
   * `renderDiagram` 으로 SVG 생성 → MarkdownRenderer 의 `[그림N]` 치환.
   * 없으면 `images` (bbox crop) fallback. 본문의 `[그림N]` 마커 순서와 매핑.
   */
  diagramParams?: import("@app/lib/diagram").DiagramParams[] | null;
}

export interface ProblemReview {
  id: string;
  original: GeneratedProblem;
  variant: GeneratedProblem;
  status: "confirmed" | "review" | "pending";
  /**
   * 변형 생성 실패 시 친화적 한국어 메시지. UI 의 재시도 배너에서 표시.
   * `useVariantGen` 이 generateVariant throw 시 set, 성공 시 clear.
   */
  genError?: string;
  /**
   * 어떤 모델이 변형을 만들었는지 (UI 배지·디버그). `OCRProblem.ocrModel` /
   * `solutionModel` 과 같은 패턴. task #41 (item 별 재실행) 도입 시 item 마다
   * 다를 수 있음.
   */
  genModel?: string;
  /** 변형 생성 in-flight 플래그 — UI spinner 표시용. dispatched 직후 즉시 true.
   *  실제 *진행* vs *큐 대기* 는 `generatingStartedAt` 으로 구분. */
  generating?: boolean;
  /**
   * 변형 생성의 *실제 호출 시작* timestamp (ms). useVariantGen 의 limit()
   * async fn 첫 줄에서 set. `solutionStartedAt` 과 동일 패턴 — VariantItem 의
   * "대기 중" vs "생성 중 · 12s" 구분에 사용.
   */
  generatingStartedAt?: number;
}

/**
 * "이어서 작업" — 저장된 시험지로부터 wizardStore 를 재구성할 때 `hydrateFromTest`
 * 에 넘기는 스냅샷. `initialState` 위에 얹혀 위자드 state 를 복원한다.
 */
export interface WizardHydrateSnapshot {
  testId: string;
  step: WizardStepIndex;
  pages: WizardPage[];
  problems: ProblemReview[];
  selectedGrade: GradeKey | null;
  examCategory: ExamCategory | null;
  uploadedFileName: string | null;
}

export interface WizardState {
  testId: string | null;
  step: WizardStepIndex;
  /**
   * "이어서 작업" hydrate 직후 1회만 true. WizardScreen 의 resume 다이얼로그가
   * 이 플래그를 보면 skip — 이미 명시적으로 불러온 시험지라 재차 묻지 않는다.
   * `partialize` 제외 (휘발성) — 새로고침 후엔 일반 resume 흐름.
   */
  justHydrated: boolean;

  // Step 1 — Upload
  uploadedFileName: string | null;
  uploadProgress: number;
  /**
   * 사용자가 PDF 업로드 시 선택한 학년·과목 (mathDefense fragment key).
   * 해설 생성 시 buildSolutionPrompt 에 전달돼 학년별 단원 함정 fragment
   * 가 prompt 에 inject 됨. null 이면 공통 fragment 만.
   */
  selectedGrade: GradeKey | null;
  /** 시험 종류 — 현재는 메타데이터, 후속 phase 에서 prompt 활용 예정. */
  examCategory: ExamCategory | null;

  // Step 2 — OCR Review
  pages: WizardPage[];
  activePageIndex: number;

  // Step 3 — Options
  goal: ConversionGoal;
  difficulty: DifficultyShift;
  extras: {
    solutions: boolean;
    answers: boolean;
    oapNote: boolean;
    stats: boolean;
  };

  // Step 4 — Per-Problem Review
  problems: ProblemReview[];
  selectedProblemIdx: number;
  reviewFilter: "all" | "review" | "pending";

  // Step 5 — Export
  format: ExportFormat;
  bundle: { problems: boolean; answers: boolean; solutions: boolean; stats: boolean };
  filename: string;
  /**
   * Step 5 의 인쇄 layout 옵션. 미리보기 / 인쇄 / PDF 가 모두 이 옵션을 공유.
   * Step3 옵션 (`bundle.answers`) 가 켜져 있으면 Step5 mount 시 1회 자동으로
   * `showAnswers: true` 로 seed.
   */
  printOptions: PrintOptions;
  /** Step 5 출력 대상: 변형 / 원본 / 둘 다. */
  exportSource: ExportSource;

  // Actions
  setStep: (step: WizardStepIndex) => void;
  next: () => void;
  prev: () => void;
  setUploadedFile: (filename: string) => void;
  setSelectedGrade: (grade: GradeKey | null) => void;
  setExamCategory: (cat: ExamCategory | null) => void;
  setPages: (pages: WizardPage[]) => void;
  setPageOCR: (
    pageId: string,
    patch: Partial<
      Pick<
        WizardPage,
        | "ocrResult"
        | "ocrComplete"
        | "ocrError"
        | "forceOcr"
        | "ocrModel"
        | "upgrading"
        | "ocrInflightModel"
        | "ocrStartedAt"
        | "imageRef"
      >
    >,
  ) => void;
  setPageRotation: (pageId: string, rotation: WizardPage["rotation"]) => void;
  updateOCRItem: (pageId: string, itemId: string, patch: Partial<OCRProblem>) => void;
  setOptions: (patch: Partial<Pick<WizardState, "goal" | "difficulty" | "extras">>) => void;
  setProblems: (problems: ProblemReview[]) => void;
  updateProblem: (id: string, patch: Partial<ProblemReview>) => void;
  setExport: (
    patch: Partial<
      Pick<WizardState, "format" | "bundle" | "filename" | "printOptions" | "exportSource">
    >,
  ) => void;

  // Step 1.5 — Crop inspect (Phase I)
  /** boxes=undefined → cropDetect 재트리거 (useCropDetect 가 undefined 보고 재실행). */
  setPageCropBoxes: (pageId: string, boxes: CropBox[] | undefined) => void;
  addCropBox: (pageId: string, box: Omit<CropBox, "id">) => void;
  updateCropBox: (pageId: string, boxId: string, patch: Partial<CropBox>) => void;
  deleteCropBox: (pageId: string, boxId: string) => void;
  markCropInspected: (pageId: string) => void;
  markAllCropInspected: () => void;
  setCropDetectInflight: (pageId: string, value: boolean) => void;
  setCropDetectError: (pageId: string, error: string | undefined) => void;

  startWizard: (testId: string) => void;
  /** "이어서 작업" — 저장된 시험지 스냅샷으로 위자드 state 재구성. */
  hydrateFromTest: (snapshot: WizardHydrateSnapshot) => void;
  reset: () => void;
}

const initialState = {
  testId: null,
  step: 0 as WizardStepIndex,
  justHydrated: false,
  uploadedFileName: null,
  uploadProgress: 0,
  selectedGrade: null as GradeKey | null,
  examCategory: null as ExamCategory | null,
  pages: [] as WizardPage[],
  activePageIndex: 0,
  goal: "similar" as ConversionGoal,
  difficulty: "same" as DifficultyShift,
  extras: { solutions: true, answers: true, oapNote: false, stats: false },
  problems: [] as ProblemReview[],
  selectedProblemIdx: 0,
  reviewFilter: "all" as const,
  format: "pdf" as ExportFormat,
  bundle: { problems: true, answers: true, solutions: false, stats: false },
  filename: "변형시험지",
  printOptions: DEFAULT_PRINT_OPTIONS,
  exportSource: "variant" as ExportSource,
};

export const useWizardStore = create<WizardState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setStep: (step) => set({ step }),
      next: () => {
        const s = get().step;
        // Step 0~6 — Step 1.5 (검수) 가 1 로 삽입돼 총 7 단계. next() clamp 6.
        if (s < 6) set({ step: (s + 1) as WizardStepIndex });
      },
      prev: () => {
        const s = get().step;
        if (s > 0) set({ step: (s - 1) as WizardStepIndex });
      },

      setUploadedFile: (filename) => set({ uploadedFileName: filename, uploadProgress: 100 }),
      setSelectedGrade: (grade) => set({ selectedGrade: grade }),
      setExamCategory: (cat) => set({ examCategory: cat }),
      setPages: (pages) => set({ pages }),
      setPageOCR: (pageId, patch) =>
        set((state) => ({
          pages: state.pages.map((p) => (p.id === pageId ? { ...p, ...patch } : p)),
        })),
      setPageRotation: (pageId, rotation) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  rotation,
                  // 회전 변경 시 OCR 결과 무효화 — 새 방향으로 재추출 필요.
                  ocrComplete: false,
                  ocrResult: [],
                  ocrError: undefined,
                  ocrModel: undefined,
                  ocrInflightModel: undefined,
                  upgrading: false,
                }
              : p,
          ),
        })),
      updateOCRItem: (pageId, itemId, patch) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  ocrResult: p.ocrResult.map((it) => (it.id === itemId ? { ...it, ...patch } : it)),
                }
              : p,
          ),
        })),

      // ── Step 1.5 — Crop inspect (Phase I) ─────────────────────────────────
      setPageCropBoxes: (pageId, boxes) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? { ...p, cropBoxes: boxes, cropDetectError: undefined }
              : p,
          ),
        })),
      addCropBox: (pageId, box) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  cropBoxes: [
                    ...(p.cropBoxes ?? []),
                    { ...box, id: crypto.randomUUID() },
                  ],
                }
              : p,
          ),
        })),
      updateCropBox: (pageId, boxId, patch) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id !== pageId
              ? p
              : {
                  ...p,
                  cropBoxes: (p.cropBoxes ?? []).map((b) =>
                    b.id !== boxId
                      ? b
                      : {
                          ...b,
                          ...patch,
                          // bbox/class 편집 시 source 자동 전환 (ai → edited).
                          source:
                            b.source === "ai" && (patch.bbox || patch.class)
                              ? "edited"
                              : (patch.source ?? b.source),
                        },
                  ),
                },
          ),
        })),
      deleteCropBox: (pageId, boxId) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  cropBoxes: (p.cropBoxes ?? []).filter((b) => b.id !== boxId),
                }
              : p,
          ),
        })),
      markCropInspected: (pageId) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId ? { ...p, cropInspected: true } : p,
          ),
        })),
      markAllCropInspected: () =>
        set((state) => ({
          pages: state.pages.map((p) => ({ ...p, cropInspected: true })),
        })),
      setCropDetectInflight: (pageId, value) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId ? { ...p, cropDetectInflight: value } : p,
          ),
        })),
      setCropDetectError: (pageId, error) =>
        set((state) => ({
          pages: state.pages.map((p) =>
            p.id === pageId ? { ...p, cropDetectError: error } : p,
          ),
        })),

      setOptions: (patch) => set((state) => ({ ...state, ...patch })),

      setProblems: (problems) => set({ problems }),
      updateProblem: (id, patch) =>
        set((state) => ({
          problems: state.problems.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      setExport: (patch) => set((state) => ({ ...state, ...patch })),

      startWizard: (testId) => set({ ...initialState, testId }),
      hydrateFromTest: (snapshot) =>
        set({ ...initialState, ...snapshot, justHydrated: true }),
      reset: () => set(initialState),
    }),
    {
      // v3 bump (Phase I-6): Step 1.5 (검수) 가 step 1 로 삽입 → 옛 step 1+
      // 는 +1 shift 필요. CropBox / cropInspected 등 새 필드는 v2 session 에서
      // undefined 로 hydrate 돼 자연 fallback.
      name: "mathgen-wizard-v3",
      version: 3,
      migrate: (persistedState, fromVersion) => {
        // v2 → v3: step >= 1 이면 +1 shift (Step 1.5 가 신규 step 1 으로 삽입).
        // step 0 (업로드) 는 그대로.
        if (fromVersion < 3 && persistedState && typeof persistedState === "object") {
          const s = persistedState as { step?: number };
          if (typeof s.step === "number" && s.step >= 1 && s.step <= 5) {
            s.step = (s.step + 1) as WizardStepIndex;
          }
        }
        return persistedState as WizardState;
      },
      storage: createJSONStorage(() => sessionStorage),
      // Skip large fields and transient UI state.
      partialize: (s) => ({
        testId: s.testId,
        step: s.step,
        uploadedFileName: s.uploadedFileName,
        selectedGrade: s.selectedGrade,
        examCategory: s.examCategory,
        // 페이지/문항별 휘발성 필드 (in-flight 모델명, 업그레이드 진행 플래그,
        // 호출 시작 timestamp, 해설 생성 in-flight 플래그) 는 새로고침 후 살아
        // 있어 봤자 의미 없으므로 stripping. rotation / solution / answer 등
        // 사용자가 명시적으로 정해 둔 값이나 결과물은 그대로 persist.
        pages: s.pages.map((p) => ({
          ...p,
          ocrInflightModel: undefined,
          ocrStartedAt: undefined,
          upgrading: false,
          cropDetectInflight: false,
          ocrResult: p.ocrResult.map((item) => ({
            ...item,
            solutionGenerating: false,
            solutionStartedAt: undefined,
          })),
        })),
        activePageIndex: s.activePageIndex,
        goal: s.goal,
        difficulty: s.difficulty,
        extras: s.extras,
        // problems 의 in-flight 마커도 stripping — 새로고침 후 spinner 가 stuck
        // 으로 남는 버그 방지. genError 는 *지속성 있는* 정보 (재시도 버튼 표시
        // 위해 필요) 라 그대로 persist.
        problems: s.problems.map((r) => ({
          ...r,
          generating: false,
          generatingStartedAt: undefined,
        })),
        selectedProblemIdx: s.selectedProblemIdx,
        format: s.format,
        bundle: s.bundle,
        filename: s.filename,
        printOptions: s.printOptions,
        exportSource: s.exportSource,
      }),
      // 신규 필드 (printOptions / exportSource) 가 이전 session 에 없으면
      // hydration 후 undefined → crash. version bump 대신 fallback 으로 안전
      // 처리 — Resume dialog 의 기존 sessionStorage 도 살림.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!state.printOptions) {
          state.printOptions = DEFAULT_PRINT_OPTIONS;
        } else {
          state.printOptions = { ...DEFAULT_PRINT_OPTIONS, ...state.printOptions };
        }
        // legacy template 값 정상화 (exam → pyeongga, default → jeongtong 등).
        // VALID 6 union 에 없으면 fallback "jeongtong".
        state.printOptions.template = matchLegacyTemplate(state.printOptions.template);
        if (!state.exportSource) {
          state.exportSource = "variant";
        }
      },
    },
  ),
);
