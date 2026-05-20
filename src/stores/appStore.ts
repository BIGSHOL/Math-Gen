import { create } from "zustand";

/**
 * App-level shell state: which screen is mounted, which test is selected,
 * and which modal (if any) is open.
 *
 * Wizard step state lives in `wizardStore` so that it can be persisted
 * independently of the navigation shell.
 */

export type Screen = "library" | "detail" | "wizard";
export type ModalKind = null | "new-variant";

export interface AppState {
  screen: Screen;
  selectedTestId: string | null;
  modal: ModalKind;

  /** Move to a screen. Optional test id when entering detail/wizard. */
  openTest: (id: string) => void;
  backToLibrary: () => void;
  startWizard: (testId: string) => void;
  openModal: (kind: Exclude<ModalKind, null>) => void;
  closeModal: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: "library",
  selectedTestId: null,
  modal: null,

  openTest: (id) => set({ screen: "detail", selectedTestId: id, modal: null }),
  backToLibrary: () => set({ screen: "library", modal: null }),
  startWizard: (testId) => set({ screen: "wizard", selectedTestId: testId, modal: null }),
  openModal: (kind) => set({ modal: kind }),
  closeModal: () => set({ modal: null }),
}));
