import { useMemo } from "react";
import { DetailScreen } from "@app/components/detail";
import { LibraryScreen } from "@app/components/library";
import { ModalLayer } from "@app/components/modal";
import UIPlayground from "@app/components/ui/__playground__";
import { WizardScreen } from "@app/components/wizard";
import { LegacyScreen } from "@app/screens/LegacyScreen";
import { useAppStore } from "@app/stores/appStore";

/**
 * Top-level shell.
 *
 * URL gates (temporary — until Phase 5 introduces a real router):
 *   - `?ui`     → design system playground
 *   - `?legacy` → original single-page SelectionPanel / ProblemDisplay UI
 *   - (default) → new Library / Detail / Wizard screens, switched by the
 *                 appStore's `screen` state
 *
 * The screen value is read once at top level; nested screens drive their
 * own substate via Zustand selectors.
 */
const App = () => {
  const route = useMemo<"ui" | "legacy" | "app">(() => {
    if (typeof window === "undefined") return "app";
    const search = window.location.search;
    if (search.includes("ui")) return "ui";
    if (search.includes("legacy")) return "legacy";
    return "app";
  }, []);

  const screen = useAppStore((s) => s.screen);

  if (route === "ui") return <UIPlayground />;
  if (route === "legacy") return <LegacyScreen />;

  return (
    <div className="w-full h-screen overflow-hidden bg-bg text-text font-sans">
      {screen === "library" && <LibraryScreen />}
      {screen === "detail" && <DetailScreen />}
      {screen === "wizard" && <WizardScreen />}
      <ModalLayer />
    </div>
  );
};

export default App;
