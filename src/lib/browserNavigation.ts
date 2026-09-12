import { useAppStore, type AppRoute, type AuthMode, type DetailTab } from "../stores/appStore";
import { useWizardStore, type WizardStepIndex } from "../stores/wizardStore";
import { useAdminStore, type AdminSection } from "../stores/adminStore";

const ROUTES: AppRoute[] = ["admin", "ui", "legacy", "bench", "katex", "croptest"];
const TABS: DetailTab[] = ["problems", "solutions", "stats", "history"];
const SECTIONS: AdminSection[] = ["usage", "users", "tenants", "tests", "errors", "monitoring", "feedback", "ocr_scraps"];
const AUTH_MODES: AuthMode[] = ["login", "signup", "reset"];
const KEYS = [...ROUTES, "screen", "test", "step", "tab", "page", "auth", "modal"];

let installed = false;
let restoring = false;
let queued = false;

function currentUrl() {
  const app = useAppStore.getState(), wizard = useWizardStore.getState();
  const url = new URL(window.location.href);
  for (const key of KEYS) url.searchParams.delete(key);
  if (app.route !== "app") {
    url.searchParams.set(app.route, app.route === "admin" ? useAdminStore.getState().section : "");
  } else if (app.screen !== "library") {
    url.searchParams.set("screen", app.screen);
    const id = app.screen === "wizard" ? wizard.testId : app.selectedTestId;
    if (id) url.searchParams.set("test", id);
    if (app.screen === "wizard") url.searchParams.set("step", String(wizard.step + 1));
    else {
      if (app.detailTab !== "problems") url.searchParams.set("tab", app.detailTab);
      if (app.detailPage !== 1) url.searchParams.set("page", String(app.detailPage));
    }
  }
  if (app.authMode !== "login") url.searchParams.set("auth", app.authMode);
  if (app.modal) url.searchParams.set("modal", app.modal);
  return url.pathname + url.search + url.hash;
}

const locationUrl = () => window.location.pathname + window.location.search + window.location.hash;

function writeHistory(replace: boolean) {
  const url = currentUrl();
  if (!replace && url === locationUrl()) return;
  // 방문 기록에는 화면 위치만 저장한다. 문제 내용과 인증 정보는 넣지 않는다.
  const state = { ...window.history.state, mathgenNavigation: true };
  if (replace) window.history.replaceState(state, "", url);
  else window.history.pushState(state, "", url);
}

function restoreLocation(initial = false) {
  restoring = true;
  try {
    const params = new URLSearchParams(window.location.search);
    const route = ROUTES.find(value => params.has(value)) ?? "app";
    const testId = params.get("test");
    const requestedScreen = params.get("screen");
    let screen = requestedScreen === "wizard" ? "wizard" as const : requestedScreen === "detail" && testId ? "detail" as const : "library" as const;
    let selectedTestId = testId;
    if (screen === "wizard") {
      const wizard = useWizardStore.getState();
      if (testId && wizard.testId !== testId) {
        // 다른 시험지의 현재 작업을 덮어쓰지 않는다. 저장본의 상세에서 재개하도록 안내.
        screen = "detail";
      } else {
        const requestedStep = Number(params.get("step") ?? wizard.step + 1) - 1;
        const step = Math.min(wizard.furthestStep, Math.max(0, Number.isInteger(requestedStep) ? requestedStep : 0)) as WizardStepIndex;
        useWizardStore.setState({ step, ...(!initial ? { justHydrated: true } : {}) });
        selectedTestId = wizard.testId;
      }
    }
    const page = Number(params.get("page") ?? 1);
    useAppStore.setState({ route, screen, selectedTestId: screen === "library" ? null : selectedTestId,
      detailTab: TABS.find(value => value === params.get("tab")) ?? "problems",
      detailPage: Number.isInteger(page) && page > 0 ? page : 1,
      authMode: AUTH_MODES.find(value => value === params.get("auth")) ?? "login",
      modal: params.get("modal") === "new-variant" ? "new-variant" : null });
    if (route === "admin") useAdminStore.setState({ section: SECTIONS.find(value => value === params.get("admin")) ?? "usage" });
    writeHistory(true);
  } finally { restoring = false; }
}

/** 연속 store 갱신을 한 번의 이동으로 묶고, 뒤로/앞으로가기에는 기록을 추가하지 않는다. */
export function installBrowserNavigation() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  restoreLocation(true);
  const record = () => {
    if (restoring || queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (!restoring) writeHistory(false); });
  };
  useAppStore.subscribe(record);
  useWizardStore.subscribe((next, previous) => {
    if (useAppStore.getState().screen !== "wizard" || (next.step === previous.step && next.testId === previous.testId)) return;
    // 업로드로 ID가 처음 발급되면 같은 단계의 주소만 교체한다.
    if (next.testId !== previous.testId && next.step === previous.step && !restoring) writeHistory(true);
    else record();
  });
  useAdminStore.subscribe((next, previous) => { if (next.section !== previous.section) record(); });
  window.addEventListener("popstate", () => restoreLocation());
}
