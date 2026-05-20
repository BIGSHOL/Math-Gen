/* App shell — top-level state, screen routing, transition animations.
   Screens: library → detail → wizard(0..4) → library
   Modal: new-variant on top of detail. */

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ---------- Mock data ----------
const MOCK_TESTS = [
  { id: "t1", title: "2024학년도 6월 모의평가", count: 30, status: "warn", statusText: "검토 중", time: "오늘", subject: "공통+미적분", tags: ["고3", "모의평가"], cover: "warn" },
  { id: "t2", title: "3월 학평 변형 ver.2", count: 30, status: "ok", statusText: "확정", time: "어제", subject: "공통+미적분", tags: ["고3", "학평", "변형"], cover: "ok" },
  { id: "t3", title: "수능 미적분 클론", count: 8, status: "ok", statusText: "확정", time: "2일 전", subject: "미적분", tags: ["고3", "변형"] },
  { id: "t4", title: "내신 대비 모의 1차", count: 25, status: "neutral", statusText: "초안", time: "3일 전", subject: "공통수학1", tags: ["고2", "내신"] },
  { id: "t5", title: "2023 9월 모의평가", count: 30, status: "ok", statusText: "확정", time: "1주 전", subject: "공통+미적분", tags: ["고3", "모의평가"] },
  { id: "t6", title: "기출 변형 (확통)", count: 12, status: "ok", statusText: "확정", time: "1주 전", subject: "확률과 통계", tags: ["고3", "변형"] },
  { id: "t7", title: "10월 학평 + 변형", count: 30, status: "ok", statusText: "확정", time: "2주 전", subject: "공통+미적분", tags: ["고3"] },
  { id: "t8", title: "여름방학 보충 세트", count: 40, status: "neutral", statusText: "초안", time: "3주 전", subject: "공통수학1·2", tags: ["고2"] },
];

const APP = {
  MOCK_TESTS,
};

// ---------- Root ----------
function App() {
  const [screen, setScreen] = useState("library"); // library | detail | wizard
  const [prevScreen, setPrevScreen] = useState(null);
  const [selectedTestId, setSelectedTestId] = useState(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [modal, setModal] = useState(null); // null | "new-variant"
  const [transitioning, setTransitioning] = useState(false);

  const selectedTest = useMemo(
    () => MOCK_TESTS.find(t => t.id === selectedTestId) || null,
    [selectedTestId]
  );

  const goTo = useCallback((next, opts = {}) => {
    setPrevScreen(screen);
    setTransitioning(true);
    setTimeout(() => setTransitioning(false), 280);
    if (opts.testId !== undefined) setSelectedTestId(opts.testId);
    if (next === "wizard") setWizardStep(opts.step ?? 0);
    setScreen(next);
  }, [screen]);

  const ctx = {
    screen, selectedTestId, selectedTest, wizardStep,
    setWizardStep,
    openTest: (id) => goTo("detail", { testId: id }),
    backToLibrary: () => goTo("library"),
    startWizard: (testId) => goTo("wizard", { testId, step: 0 }),
    openModal: (name) => setModal(name),
    closeModal: () => setModal(null),
    nextStep: () => setWizardStep(s => Math.min(s + 1, 4)),
    prevStep: () => setWizardStep(s => Math.max(s - 1, 0)),
    finishWizard: () => { setModal(null); goTo("library"); },
  };

  return (
    <div className="app-root" style={{
      width: "100vw", height: "100vh", overflow: "hidden", position: "relative",
      background: window.WF.t.bg,
      fontFamily: "Pretendard, -apple-system, 'Apple SD Gothic Neo', sans-serif",
      color: window.WF.t.ink, fontSize: 13, lineHeight: 1.45
    }}>
      <ScreenStack screen={screen} ctx={ctx} />
      <Modal name={modal} ctx={ctx} />
    </div>
  );
}

// ---------- Screen stack with crossfade ----------
function ScreenStack({ screen, ctx }) {
  const [rendered, setRendered] = useState([{ key: screen, content: renderScreen(screen, ctx), exiting: false }]);
  const prevScreenRef = useRef(screen);

  useEffect(() => {
    if (prevScreenRef.current === screen) {
      // Same screen — re-render content (wizard step changed etc.)
      setRendered([{ key: screen, content: renderScreen(screen, ctx), exiting: false }]);
      return;
    }
    const oldKey = prevScreenRef.current;
    prevScreenRef.current = screen;
    // Push new screen, mark old as exiting
    setRendered([
      { key: oldKey + "-exit-" + Date.now(), content: renderScreen(oldKey, ctx), exiting: true },
      { key: screen, content: renderScreen(screen, ctx), exiting: false, entering: true }
    ]);
    // Remove exiting after transition
    const t = setTimeout(() => {
      setRendered([{ key: screen, content: renderScreen(screen, ctx), exiting: false }]);
    }, 320);
    return () => clearTimeout(t);
  }, [screen, ctx.wizardStep, ctx.selectedTestId]);

  return (
    <>
      {rendered.map((r, i) => (
        <div key={r.key} style={{
          position: "absolute", inset: 0,
          opacity: r.exiting ? 0 : 1,
          transform: r.exiting ? "translateX(-30px)" : r.entering ? "translateX(0)" : "translateX(0)",
          transition: "opacity 280ms ease, transform 280ms ease",
          pointerEvents: r.exiting ? "none" : "auto",
        }}>
          {r.content}
        </div>
      ))}
    </>
  );
}

function renderScreen(s, ctx) {
  if (s === "library") return <Library ctx={ctx} />;
  if (s === "detail") return <Detail ctx={ctx} />;
  if (s === "wizard") return <Wizard ctx={ctx} />;
  return null;
}

// ---------- Modal layer ----------
function Modal({ name, ctx }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (name) {
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [name]);

  if (!name) return null;

  return (
    <div
      onClick={ctx.closeModal}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(15, 18, 30, 0.5)",
        opacity: visible ? 1 : 0,
        transition: "opacity 200ms ease",
        display: "grid", placeItems: "center",
      }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        transform: visible ? "scale(1)" : "scale(0.96)",
        opacity: visible ? 1 : 0,
        transition: "transform 220ms cubic-bezier(.2,.9,.3,1.1), opacity 220ms ease",
      }}>
        {name === "new-variant" && <NewVariantModal ctx={ctx} />}
      </div>
    </div>
  );
}

Object.assign(window, { App, APP });
