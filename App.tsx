import { useMemo } from "react";
import { AuthGate } from "@app/components/auth";
import { DetailScreen } from "@app/components/detail";
import { LibraryScreen } from "@app/components/library";
import { ModalLayer } from "@app/components/modal";
import UIPlayground from "@app/components/ui/__playground__";
import { WizardScreen } from "@app/components/wizard";
import { LegacyScreen } from "@app/screens/LegacyScreen";
import { ModelBenchScreen } from "@app/screens/ModelBenchScreen";
import { KatexTestScreen } from "@app/screens/KatexTestScreen";
import { useAppStore } from "@app/stores/appStore";

/**
 * Top-level shell.
 *
 * URL gates (temporary — until Phase 5 introduces a real router):
 *   - `?ui`     → design system playground
 *   - `?legacy` → original single-page SelectionPanel / ProblemDisplay UI
 *   - `?bench`  → model comparison bench: drop an image, run every
 *                 vision-capable model in parallel, compare side-by-side
 *   - (default) → new Library / Detail / Wizard screens, switched by the
 *                 appStore's `screen` state
 *
 * The screen value is read once at top level; nested screens drive their
 * own substate via Zustand selectors.
 */
const App = () => {
  const route = useMemo<"ui" | "legacy" | "bench" | "katex" | "app">(() => {
    if (typeof window === "undefined") return "app";
    const search = window.location.search;
    if (search.includes("katex")) return "katex";
    if (search.includes("ui")) return "ui";
    if (search.includes("legacy")) return "legacy";
    if (search.includes("bench")) return "bench";
    return "app";
  }, []);

  const screen = useAppStore((s) => s.screen);

  if (route === "katex") return <KatexTestScreen />;
  if (route === "ui") return <UIPlayground />;
  if (route === "legacy") return <LegacyScreen />;
  if (route === "bench") return <ModelBenchScreen />;

  return (
    <AuthGate>
      <div className="w-full h-screen overflow-hidden bg-bg text-text font-sans">
        {screen === "library" && <LibraryScreen />}
        {screen === "detail" && <DetailScreen />}
        {screen === "wizard" && <WizardScreen />}
        <ModalLayer />
      </div>
    </AuthGate>
  );
};

export default App;
