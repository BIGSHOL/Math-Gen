/* Hi-fi App shell — screen routing, animations, modal layer, keyboard shortcuts. */

function AppHF() {
  const [screen, setScreen] = React.useState("library");
  const [selectedTestId, setSelectedTestId] = React.useState(null);
  const [wizardStep, setWizardStep] = React.useState(0);
  const [modal, setModal] = React.useState(null);

  const selectedTest = React.useMemo(
    () => window.MOCK_TESTS_HF.find(t => t.id === selectedTestId) || null,
    [selectedTestId]
  );

  const goTo = React.useCallback((next, opts = {}) => {
    if (opts.testId !== undefined) setSelectedTestId(opts.testId);
    if (next === "wizard") setWizardStep(opts.step ?? 0);
    setScreen(next);
  }, []);

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

  // Keyboard shortcuts
  React.useEffect(() => {
    const onKey = (e) => {
      // Escape closes modal
      if (e.key === "Escape" && modal) { setModal(null); return; }
      if (screen !== "wizard") return;
      // Enter advances wizard
      if (e.key === "Enter" && !e.metaKey && document.activeElement?.tagName !== "INPUT") {
        if (wizardStep < 4) setWizardStep(s => s + 1);
      }
      if (e.key === "ArrowLeft" && e.metaKey) setWizardStep(s => Math.max(0, s - 1));
      if (e.key === "ArrowRight" && e.metaKey) setWizardStep(s => Math.min(4, s + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, wizardStep, modal]);

  return (
    <div className="app-root" style={{
      width: "100%", height: "100%", overflow: "hidden", position: "relative",
      background: HF.c.bg, color: HF.c.text,
      fontFamily: "Pretendard, -apple-system, 'Apple SD Gothic Neo', system-ui, sans-serif",
      fontSize: 13.5, lineHeight: 1.5,
    }}>
      <ScreenStackHF screen={screen} wizardStep={wizardStep} selectedTestId={selectedTestId} ctx={ctx} />
      <ModalLayer name={modal} ctx={ctx} />
    </div>
  );
}

function ScreenStackHF({ screen, wizardStep, selectedTestId, ctx }) {
  const [rendered, setRendered] = React.useState([{ key: screen + ":" + wizardStep, content: render(screen, ctx), exiting: false }]);
  const prevKey = React.useRef(screen);

  React.useEffect(() => {
    if (prevKey.current === screen) {
      // Same screen but state inside changed (e.g. wizard step) — replace in place
      setRendered([{ key: screen + ":" + wizardStep + ":" + selectedTestId, content: render(screen, ctx), exiting: false }]);
      return;
    }
    const oldKey = prevKey.current;
    prevKey.current = screen;
    setRendered([
      { key: oldKey + "-exit-" + Date.now(), content: render(oldKey, ctx), exiting: true },
      { key: screen + "-enter-" + Date.now(), content: render(screen, ctx), entering: true },
    ]);
    const t = setTimeout(() => {
      setRendered([{ key: screen, content: render(screen, ctx), exiting: false }]);
    }, 340);
    return () => clearTimeout(t);
  }, [screen, wizardStep, selectedTestId]);

  return (
    <>
      {rendered.map(r => (
        <div key={r.key} style={{
          position: "absolute", inset: 0,
          opacity: r.exiting ? 0 : 1,
          transform: r.exiting ? "translateY(-8px) scale(0.99)"
            : r.entering ? "translateY(0) scale(1)" : "translateY(0) scale(1)",
          transition: "opacity 320ms cubic-bezier(.2,.9,.3,1), transform 320ms cubic-bezier(.2,.9,.3,1)",
          pointerEvents: r.exiting ? "none" : "auto",
        }}>
          {r.content}
        </div>
      ))}
    </>
  );
}

function render(s, ctx) {
  if (s === "library") return <LibraryHF ctx={ctx} />;
  if (s === "detail") return <DetailHF ctx={ctx} />;
  if (s === "wizard") return <WizardHF ctx={ctx} />;
  return null;
}

function ModalLayer({ name, ctx }) {
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
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
        background: "rgba(15, 17, 23, 0.55)",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
        opacity: visible ? 1 : 0,
        transition: "opacity 220ms ease",
        display: "grid", placeItems: "center", padding: 20,
      }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        transform: visible ? "scale(1) translateY(0)" : "scale(0.96) translateY(8px)",
        opacity: visible ? 1 : 0,
        transition: "transform 260ms cubic-bezier(.2,.9,.3,1.1), opacity 260ms ease",
      }}>
        {name === "new-variant" && <NewVariantModalHF ctx={ctx} />}
      </div>
    </div>
  );
}

Object.assign(window, { AppHF });
