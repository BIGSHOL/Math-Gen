import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { GeneratedProblem } from "@app/types";

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

export type WizardStepIndex = 0 | 1 | 2 | 3 | 4 | 5;
export type ConversionGoal = "digitize" | "similar" | "variant" | "targeted";
export type DifficultyShift = "easier" | "same" | "harder";
export type ExportFormat = "pdf" | "hwp" | "docx" | "online";

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
   * 자동 감지하고, 사용자가 PageThumbColumn 의 ⟲ 버튼으로 수동 override.
   * 실제 이미지 변환은 OCR 호출 시점에만 `applyRotation(dataUrl, rotation)`
   * 으로 적용 — IndexedDB 의 원본 이미지는 그대로 둔다.
   */
  rotation: 0 | 90 | 180 | 270;
  /**
   * 현재 OCR 진행 중인 모델 id (체인 폴백 시 갱신됨). 비어 있으면 진행
   * 중인 호출이 없다는 뜻. DEV 빌드에서만 UI 배지로 노출 — 프로덕션엔
   * 안 보임. `partialize` 에서 *제외* (휘발성 in-flight 상태).
   */
  ocrInflightModel?: string;
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
  /** 해설 생성 in-flight 플래그 — UI 에서 spinner 표시용. */
  solutionGenerating?: boolean;
  /** 해설 생성 실패 메시지 (친화적 한국어). 재시도 버튼과 함께 표시. */
  solutionError?: string;
  /** 어떤 모델이 해설을 만들었는지 (디버그·UI 배지). */
  solutionModel?: string;
}

export interface ProblemReview {
  id: string;
  original: GeneratedProblem;
  variant: GeneratedProblem;
  status: "confirmed" | "review" | "pending";
}

export interface WizardState {
  testId: string | null;
  step: WizardStepIndex;

  // Step 1 — Upload
  uploadedFileName: string | null;
  uploadProgress: number;

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

  // Actions
  setStep: (step: WizardStepIndex) => void;
  next: () => void;
  prev: () => void;
  setUploadedFile: (filename: string) => void;
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
      >
    >,
  ) => void;
  setPageRotation: (pageId: string, rotation: WizardPage["rotation"]) => void;
  updateOCRItem: (pageId: string, itemId: string, patch: Partial<OCRProblem>) => void;
  setOptions: (patch: Partial<Pick<WizardState, "goal" | "difficulty" | "extras">>) => void;
  setProblems: (problems: ProblemReview[]) => void;
  updateProblem: (id: string, patch: Partial<ProblemReview>) => void;
  setExport: (patch: Partial<Pick<WizardState, "format" | "bundle" | "filename">>) => void;
  startWizard: (testId: string) => void;
  reset: () => void;
}

const initialState = {
  testId: null,
  step: 0 as WizardStepIndex,
  uploadedFileName: null,
  uploadProgress: 0,
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
};

export const useWizardStore = create<WizardState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setStep: (step) => set({ step }),
      next: () => {
        const s = get().step;
        if (s < 5) set({ step: (s + 1) as WizardStepIndex });
      },
      prev: () => {
        const s = get().step;
        if (s > 0) set({ step: (s - 1) as WizardStepIndex });
      },

      setUploadedFile: (filename) => set({ uploadedFileName: filename, uploadProgress: 100 }),
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

      setOptions: (patch) => set((state) => ({ ...state, ...patch })),

      setProblems: (problems) => set({ problems }),
      updateProblem: (id, patch) =>
        set((state) => ({
          problems: state.problems.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        })),

      setExport: (patch) => set((state) => ({ ...state, ...patch })),

      startWizard: (testId) => set({ ...initialState, testId }),
      reset: () => set(initialState),
    }),
    {
      name: "mathgen-wizard-v1",
      storage: createJSONStorage(() => sessionStorage),
      // Skip large fields and transient UI state.
      partialize: (s) => ({
        testId: s.testId,
        step: s.step,
        uploadedFileName: s.uploadedFileName,
        // 페이지별 휘발성 필드 (in-flight 모델명, 업그레이드 진행 플래그)는
        // 새로고침 후 살아 있어 봤자 의미 없으므로 stripping. rotation 은
        // 사용자가 명시적으로 정해 둔 값이라 persist.
        pages: s.pages.map((p) => ({
          ...p,
          ocrInflightModel: undefined,
          upgrading: false,
        })),
        activePageIndex: s.activePageIndex,
        goal: s.goal,
        difficulty: s.difficulty,
        extras: s.extras,
        problems: s.problems,
        selectedProblemIdx: s.selectedProblemIdx,
        format: s.format,
        bundle: s.bundle,
        filename: s.filename,
      }),
    },
  ),
);
