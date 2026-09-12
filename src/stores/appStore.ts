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
export type AppRoute = "app" | "admin" | "ui" | "legacy" | "bench" | "katex" | "croptest";
export type AuthMode = "login" | "signup" | "reset";
export type DetailTab = "problems" | "solutions" | "stats" | "history";

export interface AppState {
  screen: Screen;
  selectedTestId: string | null;
  modal: ModalKind;
  route: AppRoute;
  authMode: AuthMode;
  detailTab: DetailTab;
  detailPage: number;

  /** Move to a screen. Optional test id when entering detail/wizard. */
  openTest: (id: string) => void;
  backToLibrary: () => void;
  startWizard: (testId: string) => void;
  openModal: (kind: Exclude<ModalKind, null>) => void;
  closeModal: () => void;
  setRoute: (route: AppRoute) => void;
  setAuthMode: (mode: AuthMode) => void;
  setDetailTab: (tab: DetailTab) => void;
  setDetailPage: (page: number) => void;
}

export const useAppStore = create<AppState>((set) => ({
  screen: "library",
  selectedTestId: null,
  modal: null,
  route: "app",
  authMode: "login",
  detailTab: "problems",
  detailPage: 1,

  openTest: (id) => set({ route: "app", screen: "detail", selectedTestId: id, modal: null, detailTab: "problems", detailPage: 1 }),
  backToLibrary: () => set({ route: "app", screen: "library", selectedTestId: null, modal: null }),
  startWizard: (testId) => set({ route: "app", screen: "wizard", selectedTestId: testId, modal: null }),
  openModal: (kind) => set({ modal: kind }),
  closeModal: () => set({ modal: null }),
  setRoute: (route) => set({ route, modal: null }),
  setAuthMode: (authMode) => set({ authMode }),
  setDetailTab: (detailTab) => set({ detailTab }),
  setDetailPage: (detailPage) => set({ detailPage }),
}));
