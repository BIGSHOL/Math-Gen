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

export type WizardStepIndex = 0 | 1 | 2 | 3 | 4;
export type ConversionGoal = "digitize" | "similar" | "variant" | "targeted";
export type DifficultyShift = "easier" | "same" | "harder";
export type ExportFormat = "pdf" | "hwp" | "docx" | "online";

export interface WizardPage {
  id: string;
  /** IndexedDB ref id — the actual base64 image is stored there. */
  imageRef: string;
  ocrResult: OCRProblem[];
  /** Set true when this page's OCR call has resolved. */
  ocrComplete: boolean;
}

export interface OCRProblem {
  id: string;
  number: number;
  text: string; // markdown + LaTeX
  topic?: string;
  /** Confidence band — drives the OCRItem warning border. */
  status: "ok" | "warn" | "pending";
  /** True after the user has reviewed / edited this item. */
  reviewed: boolean;
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
        if (s < 4) set({ step: (s + 1) as WizardStepIndex });
      },
      prev: () => {
        const s = get().step;
        if (s > 0) set({ step: (s - 1) as WizardStepIndex });
      },

      setUploadedFile: (filename) => set({ uploadedFileName: filename, uploadProgress: 100 }),
      setPages: (pages) => set({ pages }),
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
        pages: s.pages, // imageRef only; bytes are in IndexedDB
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
