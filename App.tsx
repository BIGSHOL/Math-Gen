import { lazy, Suspense, useEffect } from "react";
import { AuthGate } from "@app/components/auth";
import { ToastContainer } from "@app/components/ui";
import { installGlobalErrorHandlers } from "@app/lib/errorReporter";
import { DetailScreen } from "@app/components/detail";
import { LibraryScreen } from "@app/components/library";
import { ModalLayer } from "@app/components/modal";
import { WizardScreen } from "@app/components/wizard";
import { useAppStore } from "@app/stores/appStore";

type Route = "ui" | "legacy" | "bench" | "katex" | "croptest" | "admin" | "app";

const DEV_TOOL_ROUTES = ["ui", "legacy", "bench", "katex", "croptest"] as const;
const DEV_TOOL_ROUTE_SET = new Set<Route>(DEV_TOOL_ROUTES);

const UIPlayground = lazy(() => import("@app/components/ui/__playground__"));
const LegacyScreen = lazy(() =>
  import("@app/screens/LegacyScreen").then((m) => ({ default: m.LegacyScreen })),
);
const ModelBenchScreen = lazy(() =>
  import("@app/screens/ModelBenchScreen").then((m) => ({ default: m.ModelBenchScreen })),
);
const KatexTestScreen = lazy(() =>
  import("@app/screens/KatexTestScreen").then((m) => ({ default: m.KatexTestScreen })),
);
const CropTestScreen = lazy(() =>
  import("@app/screens/CropTestScreen").then((m) => ({ default: m.CropTestScreen })),
);
const AdminScreen = lazy(() =>
  import("@app/screens/AdminScreen").then((m) => ({ default: m.AdminScreen })),
);

const RouteFallback = () => (
  <div className="w-full h-screen bg-bg text-text font-sans" aria-busy="true" />
);

/**
 * Top-level shell.
 *
 * URL routes (browserNavigation keeps URL and store state synchronized):
 *   - `?ui`     → design system playground
 *   - `?legacy` → original single-page SelectionPanel / ProblemDisplay UI
 *   - `?bench`  → model comparison bench: drop an image, run every
 *                 vision-capable model in parallel, compare side-by-side
 *   - `?katex`  → KaTeX 렌더링 스모크 테스트
 *   - `?croptest` → cropped Pass 2 크롭 정확도 테스트
 *   - (default) → new Library / Detail / Wizard screens, switched by the
 *                 appStore's `screen` state
 *
 * Dev-tool routes stay outside AuthGate so local diagnostics keep working when
 * Supabase auth is enabled. App/admin routes remain protected.
 *
 * The screen value is read once at top level; nested screens drive their
 * own substate via Zustand selectors.
 */
const App = () => {
  // Phase B — 글로벌 에러 핸들러 1회 설치. window.onerror / unhandledrejection
  // → reportError → error_logs upsert. 클라이언트의 *모든 uncaught* 자동 수집.
  useEffect(() => {
    installGlobalErrorHandlers();
  }, []);

  const route = useAppStore((s) => s.route);

  const screen = useAppStore((s) => s.screen);
  const selectedTestId = useAppStore((s) => s.selectedTestId);
  const devToolsEnabled =
    import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEV_TOOLS === "true";
  const effectiveRoute =
    DEV_TOOL_ROUTE_SET.has(route) && !devToolsEnabled ? "app" : route;

  const routeNode =
    effectiveRoute === "admin" ? (
      <AdminScreen />
    ) : effectiveRoute === "katex" ? (
      <KatexTestScreen />
    ) : effectiveRoute === "croptest" ? (
      <CropTestScreen />
    ) : effectiveRoute === "ui" ? (
      <UIPlayground />
    ) : effectiveRoute === "legacy" ? (
      <LegacyScreen />
    ) : effectiveRoute === "bench" ? (
      <ModelBenchScreen />
    ) : (
      <div className="w-full h-screen overflow-hidden bg-bg text-text font-sans">
        {screen === "library" && <LibraryScreen />}
        {screen === "detail" && <DetailScreen key={selectedTestId} />}
        {screen === "wizard" && <WizardScreen />}
        <ModalLayer />
        <ToastContainer />
      </div>
    );

  if (DEV_TOOL_ROUTE_SET.has(effectiveRoute)) {
    return <Suspense fallback={<RouteFallback />}>{routeNode}</Suspense>;
  }

  return (
    <AuthGate>
      <Suspense fallback={<RouteFallback />}>{routeNode}</Suspense>
    </AuthGate>
  );
};

export default App;
