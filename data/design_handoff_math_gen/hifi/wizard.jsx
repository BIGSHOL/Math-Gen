/* Hi-fi Wizard — shell + Step 1 (Upload) + Step 2 (OCR Review) + Step 3 (Options) */

function WizardHF({ ctx }) {
  const steps = [
    { t: "업로드", ico: "upload-simple" },
    { t: "원본 확인", ico: "scan" },
    { t: "변형 옵션", ico: "sliders-horizontal" },
    { t: "문항 검토", ico: "check-square" },
    { t: "내보내기", ico: "download-simple" },
  ];
  const StepComp = [WizStep1HF, WizStep2HF, WizStep3HF, WizStep4HF, WizStep5HF][ctx.wizardStep];

  return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: HF.c.bg }}>
      <TopBar
        left={<>
          <Btn kind="ghost" size="sm" icon="arrow-left" onClick={ctx.backToLibrary}>보관함</Btn>
          <Divider vertical style={{ height: 18 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={20} />
            <Chip tone="accent" size="sm" icon="sparkle">새 변환 작업</Chip>
            {ctx.selectedTest && <Chip size="sm">{ctx.selectedTest.title}</Chip>}
          </div>
        </>}
        right={<>
          <Btn kind="ghost" size="sm" icon="floppy-disk">저장</Btn>
          <Btn kind="ghost" size="sm" icon="question">도움말</Btn>
        </>}
      />

      {/* Stepper */}
      <div style={{
        padding: "18px 56px", background: HF.c.surface, borderBottom: `1px solid ${HF.c.line}`,
      }}>
        <StepperHF steps={steps} current={ctx.wizardStep} onClick={(i) => i < ctx.wizardStep && ctx.setWizardStep(i)} />
      </div>

      <div style={{ flex: 1, overflow: "hidden", position: "relative", minHeight: 0 }}>
        <StepFrame step={ctx.wizardStep}>
          <StepComp ctx={ctx} />
        </StepFrame>
      </div>

      <WizardFooterHF ctx={ctx} steps={steps} />
    </div>
  );
}

function StepperHF({ steps, current, onClick }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, maxWidth: 920, margin: "0 auto" }}>
      {steps.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const future = i > current;
        return (
          <React.Fragment key={i}>
            <div
              onClick={() => onClick && !future && onClick(i)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                cursor: future ? "default" : "pointer",
                opacity: future ? 0.55 : 1,
              }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8,
                display: "grid", placeItems: "center",
                background: done ? HF.c.ok : active ? HF.c.accent : HF.c.surface,
                color: done || active ? "white" : HF.c.muted,
                border: done || active ? "none" : `1.5px solid ${HF.c.lineStrong}`,
                boxShadow: active ? HF.sh.accentGlow : "none",
                transition: "all 200ms",
                flexShrink: 0,
              }}>
                {done ? <Ico name="check" size={15} weight="bold" />
                  : <Ico name={s.ico} size={14} weight={active ? "fill" : "regular"} />}
              </div>
              <div style={{
                display: "flex", flexDirection: "column", gap: 1,
              }}>
                <div style={{ ...applyType("micro"), color: HF.c.muted }}>{String(i + 1).padStart(2, "0")}</div>
                <div style={{
                  ...applyType("body"), fontWeight: active ? 700 : 550,
                  color: active ? HF.c.text : done ? HF.c.text2 : HF.c.muted,
                  whiteSpace: "nowrap",
                }}>{s.t}</div>
              </div>
            </div>
            {i < steps.length - 1 && (
              <div style={{
                flex: 1, height: 2, margin: "0 14px",
                background: done ? HF.c.ok : HF.c.surface3,
                borderRadius: 2, minWidth: 28,
                transition: "background 280ms",
              }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function StepFrame({ step, children }) {
  const [renderedStep, setRenderedStep] = React.useState(step);
  const [direction, setDirection] = React.useState("none");
  const prevStepRef = React.useRef(step);

  React.useEffect(() => {
    if (prevStepRef.current === step) return;
    setDirection(step > prevStepRef.current ? "forward" : "backward");
    prevStepRef.current = step;
    setRenderedStep(step);
  }, [step]);

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "auto" }}>
      <div
        key={renderedStep}
        style={{
          minHeight: "100%",
          animation: direction === "forward"
            ? "wizSlideInRight 300ms cubic-bezier(.2,.9,.3,1) both"
            : direction === "backward" ? "wizSlideInLeft 300ms cubic-bezier(.2,.9,.3,1) both" : "none"
        }}>
        {children}
      </div>
    </div>
  );
}

function WizardFooterHF({ ctx, steps }) {
  const isFirst = ctx.wizardStep === 0;
  const isLast = ctx.wizardStep === steps.length - 1;
  const nextLabel = isLast ? "라이브러리로" : `다음: ${steps[ctx.wizardStep + 1].t}`;

  return (
    <div style={{
      height: 64, padding: "0 32px",
      background: HF.c.surface, borderTop: `1px solid ${HF.c.line}`,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {!isFirst ? (
          <Btn kind="secondary" size="md" icon="arrow-left" onClick={ctx.prevStep}>이전</Btn>
        ) : <div style={{ width: 100 }} />}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ ...applyType("small"), color: HF.c.muted }}>{ctx.wizardStep + 1} / {steps.length}</span>
        <div style={{ display: "flex", gap: 3 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width: i <= ctx.wizardStep ? 18 : 8, height: 4,
              borderRadius: 2,
              background: i <= ctx.wizardStep ? HF.c.accent : HF.c.surface3,
              transition: "all 280ms cubic-bezier(.2,.9,.3,1)",
            }} />
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ ...applyType("caption"), color: HF.c.muted, display: "flex", alignItems: "center", gap: 4 }}>
          <Kbd>↵</Kbd> 다음
        </span>
        <Btn kind="accent" size="md" iconRight={isLast ? "check" : "arrow-right"}
          onClick={isLast ? ctx.finishWizard : ctx.nextStep}>{nextLabel}</Btn>
      </div>
    </div>
  );
}

// ========== STEP 1: Upload ==========
function WizStep1HF({ ctx }) {
  const [hasFile, setHasFile] = React.useState(!!ctx.selectedTest);
  const [dragOver, setDragOver] = React.useState(false);

  return (
    <div style={{ padding: "48px 32px", display: "flex", flexDirection: "column", alignItems: "center", maxWidth: 760, margin: "0 auto" }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{
          width: 56, height: 56, borderRadius: HF.r.r3, margin: "0 auto 16px",
          background: `linear-gradient(135deg, ${HF.c.accentSoft}, ${HF.c.accentSoftStrong})`,
          color: HF.c.accentDark,
          display: "grid", placeItems: "center", boxShadow: HF.sh.s2,
        }}>
          <Ico name="upload-simple" size={26} weight="bold" />
        </div>
        <div style={{ ...applyType("display"), color: HF.c.text, marginBottom: 6 }}>변환할 시험지를 올려주세요</div>
        <div style={{ ...applyType("body"), color: HF.c.muted, maxWidth: 480, margin: "0 auto" }}>
          PDF·이미지·HWP 스캔 모두 지원합니다. AI가 자동으로 문제를 분리하고 디지털화합니다.
        </div>
      </div>

      <div
        onClick={() => setHasFile(true)}
        onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); setHasFile(true); }}
        style={{
          width: "100%", padding: 36,
          border: `2px dashed ${dragOver ? HF.c.accent : hasFile ? HF.c.line : HF.c.lineStrong}`,
          borderRadius: HF.r.r4,
          background: dragOver ? HF.c.accentSoft : hasFile ? HF.c.surface : `linear-gradient(180deg, ${HF.c.surface}, ${HF.c.bg})`,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
          cursor: "pointer", transition: "all 200ms ease",
          boxShadow: dragOver ? HF.sh.accentGlow : "none",
        }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: HF.c.surface,
          border: `2px solid ${HF.c.accent}`,
          color: HF.c.accent,
          display: "grid", placeItems: "center",
          boxShadow: HF.sh.s2,
        }}>
          <Ico name={dragOver ? "download" : "file-arrow-up"} size={28} weight="bold" />
        </div>
        <div style={{ ...applyType("h2"), color: HF.c.text }}>
          {dragOver ? "여기에 놓아주세요" : "파일을 끌어 놓거나 클릭하세요"}
        </div>
        <div style={{ ...applyType("small"), color: HF.c.muted }}>또는 <Kbd>⌘</Kbd> <Kbd>V</Kbd> 로 붙여넣기</div>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <Btn kind="accent" size="md" icon="folder-open">컴퓨터에서 선택</Btn>
          <Btn kind="secondary" size="md" icon="books">라이브러리</Btn>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
          {["PDF", "JPG · PNG", "HWP 스캔", "여러 페이지"].map(t => (
            <Chip key={t} size="sm" tone="soft">{t}</Chip>
          ))}
        </div>
      </div>

      {hasFile && (
        <Card pad={16} style={{ width: "100%", marginTop: 24, animation: "fadeIn 280ms ease both" }}>
          <Eyebrow style={{ marginBottom: 12 }}>업로드 완료 (1개)</Eyebrow>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: 44, height: 54, borderRadius: HF.r.r1,
              background: HF.c.surface2, border: `1px solid ${HF.c.line}`,
              display: "grid", placeItems: "center",
              flexShrink: 0,
            }}>
              <Ico name="file-pdf" size={22} color={HF.c.accent} weight="duotone" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ ...applyType("body"), fontWeight: 600, color: HF.c.text }}>
                {ctx.selectedTest?.title || "2024학년도 6월 모의평가_수학.pdf"}
              </div>
              <div style={{ ...applyType("small"), color: HF.c.muted, marginTop: 2 }}>
                8 페이지 · 2.4 MB · <span style={{ color: HF.c.ok }}>✓ 업로드 완료</span>
              </div>
              <div style={{ marginTop: 8 }}>
                <Progress value={100} tone="ok" height={3} />
              </div>
            </div>
            <Btn kind="ghost" size="sm" icon="x" onClick={() => setHasFile(false)}></Btn>
          </div>
        </Card>
      )}
    </div>
  );
}

// ========== STEP 2: OCR Review ==========
function WizStep2HF({ ctx }) {
  const [activePage, setActivePage] = React.useState(2);

  return (
    <div style={{ padding: "20px 24px", display: "flex", gap: 16, height: "100%", minHeight: 580 }}>
      {/* Page thumbnails */}
      <div style={{ width: 92, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <Eyebrow style={{ marginBottom: 4 }}>페이지</Eyebrow>
        {[1,2,3,4,5,6,7,8].map(p => (
          <div key={p}
            onClick={() => setActivePage(p)}
            style={{
              height: 64, padding: 6,
              border: `1.5px solid ${p === activePage ? HF.c.accent : HF.c.line}`,
              background: "white", borderRadius: HF.r.r1,
              cursor: "pointer", position: "relative",
              boxShadow: p === activePage ? HF.sh.accentGlow : HF.sh.s1,
              transition: "all 140ms",
            }}>
            <div style={{ fontSize: 6, fontWeight: 700, borderBottom: `0.6px solid ${HF.c.text}`, paddingBottom: 1, marginBottom: 2, display: "flex", justifyContent: "space-between" }}>
              <span>수학영역</span><span>{p}</span>
            </div>
            {[1, 2].map(n => (
              <div key={n} style={{ marginTop: 2 }}>
                <div style={{ display: "flex", gap: 1, alignItems: "baseline" }}>
                  <span style={{ fontSize: 5, fontWeight: 700 }}>{n}</span>
                  <div style={{ flex: 1, height: 1.2, background: HF.c.surface3 }} />
                </div>
              </div>
            ))}
            <div style={{ position: "absolute", bottom: 3, right: 4, fontSize: 8, color: HF.c.muted, fontFamily: HF.t.mono.family, fontWeight: 600 }}>p.{p}</div>
          </div>
        ))}
      </div>

      {/* Original */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Chip size="sm" icon="image">원본 스캔</Chip>
            <span style={{ ...applyType("small"), color: HF.c.muted }}>p.{activePage} / 8 · 100%</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <Btn kind="ghost" size="sm" icon="magnifying-glass-plus"></Btn>
            <Btn kind="ghost" size="sm" icon="magnifying-glass-minus"></Btn>
          </div>
        </div>
        <Card pad={24} style={{ flex: 1, overflow: "auto", background: "white" }}>
          <PaperFrame page={activePage} small>
            <div style={{ ...applyType("body"), color: HF.c.text }}>
              {[5, 6, 7].map(n => (
                <div key={n} style={{ marginBottom: 18, position: "relative" }}>
                  {n === 6 && (
                    <div style={{ position: "absolute", left: -16, top: -2, width: 4, height: "calc(100% + 4px)", background: HF.c.warn, borderRadius: 2 }} />
                  )}
                  <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
                    <span style={{ fontWeight: 700 }}>{n}.</span>
                    <div style={{ flex: 1 }}>
                      {n === 5 && <span>두 다항식 <Formula tex="A = 2x^2 + 3x" />와 <Formula tex="B = x^2 - 4x + 1" />에 대하여 <Formula tex="A + B" />를 구하시오.</span>}
                      {n === 6 && <span>함수 <Formula tex="f(x) = x^2 - 4x + 3" />에 대하여 합성함수 <Formula tex="(f \\circ f)(x)" />의 그래프가 <Formula tex="x" />축과 만나는 점의 개수를 구하시오.</span>}
                      {n === 7 && <span>수열 <Formula tex="\\{a_n\\}" />이 <Formula tex="a_{n+1} = 2a_n + 1, a_1 = 1" />를 만족할 때 <Formula tex="a_5" />의 값은?</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </PaperFrame>
        </Card>
      </div>

      {/* OCR result */}
      <div style={{ flex: 1.1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Chip tone="accent" size="sm" icon="scan">디지털화 결과</Chip>
            <span style={{ ...applyType("small"), color: HF.c.muted }}>정확도 96%</span>
          </div>
          <Btn kind="ghost" size="sm" icon="arrow-clockwise">페이지 재인식</Btn>
        </div>
        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 4 }}>
          <OCRItem num={5} status="ok">
            <ProblemBody>
              <p>두 다항식 <Formula tex="A = 2x^2 + 3x" />와 <Formula tex="B = x^2 - 4x + 1" />에 대하여 <Formula tex="A + B" />를 구하시오.</p>
            </ProblemBody>
          </OCRItem>
          <OCRItem num={6} status="warn" hint="함수식의 정의역 기호를 확인해 주세요.">
            {PROBLEMS.p6.render("full", "orig")}
          </OCRItem>
          <OCRItem num={7} status="ok">
            <ProblemBody>
              <p>수열 <Formula tex="\\{a_n\\}" />이 <Formula tex="a_{n+1} = 2a_n + 1, \\; a_1 = 1" />를 만족할 때 <Formula tex="a_5" />의 값은?</p>
              <Choices items={[{tex:"31"},{tex:"33"},{tex:"35"},{tex:"63"},{tex:"127"}]} />
            </ProblemBody>
          </OCRItem>
        </div>
      </div>
    </div>
  );
}

function OCRItem({ num, status, hint, children }) {
  return (
    <Card pad={14} style={{
      borderColor: status === "warn" ? HF.c.warn : HF.c.line,
      boxShadow: status === "warn" ? "0 0 0 3px rgba(245, 158, 11, 0.10)" : HF.sh.s1,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{
          width: 24, height: 24, borderRadius: HF.r.r1,
          background: HF.c.ink, color: "white",
          display: "grid", placeItems: "center",
          fontSize: 11, fontWeight: 700, fontFamily: HF.t.mono.family,
        }}>{num}</div>
        <Chip tone={status} size="sm" dot>{status === "warn" ? "인식 검토" : "확정"}</Chip>
        <Chip size="sm">합성함수</Chip>
        <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
          <Btn kind="ghost" size="xs" icon="pencil-simple"></Btn>
        </div>
      </div>
      {children}
      {hint && (
        <div style={{
          marginTop: 10, padding: "8px 10px",
          background: HF.c.warnSoft, borderRadius: HF.r.r1,
          display: "flex", alignItems: "center", gap: 6,
          ...applyType("small"), color: HF.c.warnInk,
        }}>
          <Ico name="warning" size={13} weight="fill" color={HF.c.warn} />
          {hint}
        </div>
      )}
    </Card>
  );
}

// ========== STEP 3: Options ==========
function WizStep3HF({ ctx }) {
  const [goal, setGoal] = React.useState(1);
  const [diff, setDiff] = React.useState(0);
  const [extras, setExtras] = React.useState({ solutions: true, answers: true, oapNote: false, stats: true });

  const goals = [
    { t: "디지털화만", d: "텍스트·수식으로 변환", ico: "text-aa" },
    { t: "유사 문제 생성", d: "같은 개념·다른 문제", ico: "approximately-equals" },
    { t: "변형 시험지", d: "난이도·유형 미세 조정", ico: "sparkle" },
    { t: "맞춤 보충", d: "단원별 약점 강화", ico: "target" },
  ];

  return (
    <div style={{ padding: "32px 48px", display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 32, maxWidth: 1200, margin: "0 auto" }}>

      <div>
        <Heading level="h1" sub="30개 문항 전체에 적용됩니다. 다음 단계에서 개별 조정 가능합니다." style={{ marginBottom: 24 }}>
          어떻게 변형할까요?
        </Heading>

        <div style={{ marginBottom: 24 }}>
          <Eyebrow style={{ marginBottom: 10 }}>변환 목표</Eyebrow>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {goals.map((o, i) => {
              const on = i === goal;
              return (
                <div key={i} onClick={() => setGoal(i)} style={{
                  padding: 16, borderRadius: HF.r.r3, cursor: "pointer",
                  border: `1.5px solid ${on ? HF.c.accent : HF.c.line}`,
                  background: on ? HF.c.accentSoft : HF.c.surface,
                  boxShadow: on ? HF.sh.accentGlow : HF.sh.s1,
                  position: "relative", transition: "all 140ms",
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: HF.r.r1,
                    background: on ? "white" : HF.c.surface2,
                    color: on ? HF.c.accent : HF.c.muted,
                    display: "grid", placeItems: "center",
                    marginBottom: 10,
                  }}>
                    <Ico name={o.ico} size={18} weight={on ? "bold" : "regular"} />
                  </div>
                  <div style={{ ...applyType("h3"), color: on ? HF.c.accentInk : HF.c.text }}>{o.t}</div>
                  <div style={{ ...applyType("small"), color: HF.c.muted, marginTop: 2 }}>{o.d}</div>
                  {on && (
                    <div style={{
                      position: "absolute", top: 10, right: 10,
                      width: 20, height: 20, borderRadius: "50%",
                      background: HF.c.accent, color: "white",
                      display: "grid", placeItems: "center",
                    }}>
                      <Ico name="check" size={12} weight="bold" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <Eyebrow style={{ marginBottom: 10 }}>난이도 조정</Eyebrow>
          <Segmented value={["keep", "easy", "hard", "top"][diff]} onChange={(v) => setDiff(["keep", "easy", "hard", "top"].indexOf(v))} options={[
            { value: "keep", label: "원본 유지", icon: "equals" },
            { value: "easy", label: "쉽게", icon: "arrow-down" },
            { value: "hard", label: "어렵게", icon: "arrow-up" },
            { value: "top", label: "최상위권", icon: "crown" },
          ]} size="md" full />
        </div>

        <div>
          <Eyebrow style={{ marginBottom: 10 }}>함께 만들 자료</Eyebrow>
          <Card pad={4}>
            {[
              ["solutions", "풀이·해설지", "각 문제별 단계별 풀이", "book-open"],
              ["answers", "정답지 (분리 PDF)", "객관식 + 주관식 답", "list-checks"],
              ["oapNote", "오답노트 템플릿", "학생용 빈 양식", "notebook"],
              ["stats", "단원·유형 통계", "엑셀 + 차트", "chart-bar"],
            ].map(([k, t, h, ico], i, arr) => {
              const on = extras[k];
              return (
                <div key={k} onClick={() => setExtras(o => ({...o, [k]: !on}))} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                  borderBottom: i < arr.length - 1 ? `1px solid ${HF.c.line}` : "none",
                  cursor: "pointer",
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: HF.r.r1,
                    background: on ? HF.c.accentSoft : HF.c.surface2,
                    color: on ? HF.c.accent : HF.c.muted,
                    display: "grid", placeItems: "center",
                  }}><Ico name={ico} size={15} weight={on ? "bold" : "regular"} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...applyType("body"), color: HF.c.text, fontWeight: 550 }}>{t}</div>
                    <div style={{ ...applyType("caption"), color: HF.c.muted, marginTop: 1 }}>{h}</div>
                  </div>
                  <Toggle value={on} onChange={() => {}} size="sm" />
                </div>
              );
            })}
          </Card>
        </div>
      </div>

      <div>
        <Eyebrow style={{ marginBottom: 10 }}>실시간 미리보기 · 1번 문항</Eyebrow>
        <Card pad={0} style={{ overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ padding: 16, borderRight: `1px solid ${HF.c.line}` }}>
              <Chip size="sm" style={{ marginBottom: 10 }}>원본</Chip>
              {PROBLEMS.p1.render()}
            </div>
            <div style={{ padding: 16, background: HF.c.accentSoft + "33" }}>
              <Chip tone="accent" size="sm" style={{ marginBottom: 10 }}>변환 예상</Chip>
              <ProblemBody>
                <p>두 다항식</p>
                <Formula tex="A = 3x^2 - 2x + 5, \\quad B = x^2 + 4x - 2" displayMode />
                <p>에 대하여 <Formula tex="A + B" />의 값을 구한 식으로 옳은 것은?</p>
                <Choices items={[
                  {tex:"4x^2 + 2x + 3"},{tex:"4x^2 + 2x + 7"},
                  {tex:"4x^2 + 6x + 3"},{tex:"4x^2 - 2x + 7"},{tex:"3x^2 + 2x + 7"},
                ]} answer={1} />
              </ProblemBody>
            </div>
          </div>
        </Card>
        <div style={{
          marginTop: 10, padding: "8px 12px",
          background: HF.c.warnSoft, borderRadius: HF.r.r2,
          ...applyType("small"), color: HF.c.warnInk,
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <Ico name="info" size={13} weight="fill" color={HF.c.warn} />
          옵션을 바꿀 때마다 1번 문항으로 즉시 미리보기됩니다.
        </div>

        <Card pad={16} style={{ marginTop: 22, background: HF.c.surface2, borderColor: HF.c.line }}>
          <Eyebrow style={{ marginBottom: 12 }}>예상 결과</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              ["변환 시간", "약 2분 30초", "clock"],
              ["변환 문항", "30개", "list-numbers"],
              ["함께 생성될 자료", "풀이지 + 정답지 + 통계", "files"],
              ["크레딧 사용", "30 / 잔여 1,240", "lightning", HF.c.accent],
            ].map(([k, v, ico, color]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", ...applyType("body") }}>
                <span style={{ color: HF.c.text2, display: "flex", alignItems: "center", gap: 6 }}>
                  <Ico name={ico} size={14} />
                  {k}
                </span>
                <span style={{ color: color || HF.c.text, fontWeight: 600, fontFamily: typeof v === "string" && v.includes("크") ? "inherit" : HF.t.mono.family }}>{v}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { WizardHF, WizStep1HF, WizStep2HF, WizStep3HF });
