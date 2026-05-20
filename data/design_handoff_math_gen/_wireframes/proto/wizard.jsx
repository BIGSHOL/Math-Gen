/* Wizard — 5단계 마법사. 가로 슬라이드 전환. */

function Wizard({ ctx }) {
  const { WF } = window;
  const steps = ["업로드", "원본 확인", "변형 옵션", "문항 검토", "내보내기"];
  const StepComp = [WizStep1, WizStep2, WizStep3, WizStep4, WizStep5][ctx.wizardStep];

  return (
    <WF.Frame width="100%" height="100%" bg={WF.t.bg} style={{ position: "absolute", inset: 0 }}>
      <div style={{
        height: 56, background: WF.t.surface, borderBottom: `1px solid ${WF.t.line}`,
        padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button onClick={ctx.backToLibrary} kind="ghost" size="sm" icon="←">보관함</Button>
          <div style={{ width: 1, height: 18, background: WF.t.line2 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 24, height: 24, borderRadius: 6, background: WF.t.accent, color: "white", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>∑</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>새 변환 작업</div>
            <WF.Chip>{ctx.selectedTest?.title || "새 시험지"}</WF.Chip>
          </div>
        </div>
        <WF.Btn kind="ghost" size="sm">저장 후 종료</WF.Btn>
      </div>

      <div style={{ padding: "20px 80px 14px", background: WF.t.surface, borderBottom: `1px solid ${WF.t.line2}` }}>
        <WF.Stepper steps={steps} current={ctx.wizardStep} />
      </div>

      <div style={{ height: "calc(100% - 56px - 65px - 65px)", overflow: "hidden", position: "relative" }}>
        <StepFrame step={ctx.wizardStep}>
          <StepComp ctx={ctx} />
        </StepFrame>
      </div>

      <WizardFooter ctx={ctx} steps={steps} />
    </WF.Frame>
  );
}

function StepFrame({ step, children }) {
  const [renderedStep, setRenderedStep] = useState(step);
  const [direction, setDirection] = useState("none");
  const prevStepRef = useRef(step);

  useEffect(() => {
    if (prevStepRef.current === step) return;
    setDirection(step > prevStepRef.current ? "forward" : "backward");
    prevStepRef.current = step;
    setRenderedStep(step);
  }, [step]);

  // We use key on inner to trigger re-mount + animation
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "auto" }}>
      <div
        key={renderedStep}
        style={{
          minHeight: "100%",
          animation: direction === "forward"
            ? "wizSlideInRight 280ms ease both"
            : direction === "backward" ? "wizSlideInLeft 280ms ease both" : "none"
        }}>
        {children}
      </div>
    </div>
  );
}

function WizardFooter({ ctx, steps }) {
  const { WF } = window;
  const isFirst = ctx.wizardStep === 0;
  const isLast = ctx.wizardStep === steps.length - 1;
  const nextLabel = isLast ? "라이브러리로 → " : `다음: ${steps[ctx.wizardStep + 1]} →`;
  return (
    <div style={{
      height: 65, padding: "0 80px",
      background: WF.t.surface, borderTop: `1px solid ${WF.t.line}`,
      display: "flex", justifyContent: "space-between", alignItems: "center"
    }}>
      <div style={{ width: 130 }}>
        {!isFirst && <Button onClick={ctx.prevStep} kind="ghost" size="lg">← 이전</Button>}
      </div>
      <div style={{ fontSize: 11, color: WF.t.muted }}>{ctx.wizardStep + 1} / {steps.length} 단계</div>
      <div style={{ width: 200, display: "flex", justifyContent: "flex-end" }}>
        <Button
          onClick={isLast ? ctx.finishWizard : ctx.nextStep}
          kind="primary" size="lg" icon={isLast ? "✓" : null}
        >{nextLabel}</Button>
      </div>
    </div>
  );
}

// ========== STEP 1: Upload ==========
function WizStep1({ ctx }) {
  const { WF } = window;
  const [hasFile, setHasFile] = useState(!!ctx.selectedTest);

  return (
    <div style={{ padding: "40px 80px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>변환할 시험지를 올려주세요</div>
        <div style={{ fontSize: 13, color: WF.t.muted }}>PDF, 이미지, 한글파일 스캔 모두 지원합니다. AI가 자동으로 문제를 분리합니다.</div>
      </div>

      <div
        onClick={() => setHasFile(true)}
        style={{
          width: "100%", maxWidth: 720,
          border: `2px dashed ${hasFile ? WF.t.line : WF.t.accent}`,
          borderRadius: 16, padding: 40,
          background: hasFile ? WF.t.surface : WF.t.accentSoft + "60",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
          cursor: "pointer", transition: "all 200ms"
        }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%", background: "white",
          border: `2px solid ${WF.t.accent}`, display: "grid", placeItems: "center",
          fontSize: 24, color: WF.t.accent, fontWeight: 700
        }}>↑</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>파일을 여기로 끌어 놓거나 클릭하세요</div>
        <div style={{ fontSize: 12, color: WF.t.muted }}>또는 Ctrl+V로 붙여넣기</div>
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <WF.Btn kind="primary" size="md" icon="📁">컴퓨터에서 선택</WF.Btn>
          <WF.Btn kind="secondary" size="md" icon="📚">라이브러리</WF.Btn>
        </div>
      </div>

      {hasFile && (
        <div style={{ marginTop: 24, width: "100%", maxWidth: 720, animation: "fadeIn 240ms ease both" }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: WF.t.ink2, marginBottom: 8 }}>업로드된 파일</div>
          <div style={{
            border: `1px solid ${WF.t.line}`, borderRadius: 8, padding: 14,
            background: WF.t.surface, display: "flex", alignItems: "center", gap: 14
          }}>
            <div style={{ width: 36, height: 44, background: WF.t.bg, border: `1px solid ${WF.t.line}`, borderRadius: 3, display: "grid", placeItems: "center", fontSize: 9, fontWeight: 700, color: WF.t.accent }}>PDF</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{ctx.selectedTest?.title || "2024학년도 6월 모의평가_수학.pdf"}</div>
              <div style={{ fontSize: 11, color: WF.t.muted, marginTop: 2 }}>8 페이지 · 2.4 MB · 업로드 완료</div>
              <div style={{ marginTop: 6, height: 4, background: WF.t.line2, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: "100%", height: "100%", background: WF.t.ok }} />
              </div>
            </div>
            <Button onClick={() => setHasFile(false)} kind="ghost" size="sm">✕</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== STEP 2: OCR Review ==========
function WizStep2({ ctx }) {
  const { WF } = window;
  const [activePage, setActivePage] = useState(2);

  return (
    <div style={{ padding: "24px 40px", display: "flex", gap: 20, height: "100%", minHeight: 600 }}>
      {/* Page nav */}
      <div style={{ width: 100, display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 4 }}>페이지</div>
        {[1,2,3,4,5,6,7,8].map(p => (
          <div key={p} onClick={() => setActivePage(p)} style={{
            height: 64, borderRadius: 5, padding: 6,
            border: `1px solid ${p === activePage ? WF.t.accent : WF.t.line}`,
            background: p === activePage ? WF.t.accentSoft : WF.t.surface,
            display: "flex", flexDirection: "column", gap: 2, cursor: "pointer",
            position: "relative", transition: "all 120ms"
          }}>
            <WF.Line h={2} w="80%" /><WF.Line h={2} /><WF.Line h={2} w="60%" />
            <div style={{ height: 8, background: WF.t.bg, border: `1px dashed ${WF.t.line}`, borderRadius: 2 }} />
            <WF.Line h={2} /><WF.Line h={2} w="55%" />
            <div style={{ position: "absolute", top: 2, right: 4, fontSize: 9, fontWeight: 700, color: WF.t.muted }}>p.{p}</div>
          </div>
        ))}
      </div>

      {/* Original */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <WF.Chip>원본 스캔</WF.Chip>
          <div style={{ fontSize: 11, color: WF.t.muted }}>p.{activePage} / 8</div>
        </div>
        <div style={{
          flex: 1, background: "white", border: `1px solid ${WF.t.line}`, borderRadius: 8,
          padding: 22, overflow: "auto", minHeight: 0
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: WF.t.muted }}>수학영역</div>
            <div style={{ fontSize: 10, color: WF.t.muted }}>{activePage}</div>
          </div>
          {[5, 6, 7].map(n => (
            <div key={n} style={{ marginBottom: 16, position: "relative" }}>
              {n === 6 && <div style={{ position: "absolute", top: -4, left: -12, width: 4, height: "calc(100% + 8px)", background: WF.t.warn, borderRadius: 2 }} />}
              <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{n}.</div>
                <WF.Line h={6} w="90%" />
              </div>
              <WF.Para lines={2} last="70%" style={{ marginLeft: 14 }} />
              {n === 6 && <div style={{ height: 50, marginTop: 6, marginLeft: 14, background: WF.t.bg, border: `1px dashed ${WF.t.line}`, borderRadius: 3 }} />}
              <div style={{ marginTop: 6, marginLeft: 14, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {[1,2,3,4,5].map(i => <div key={i} style={{ fontSize: 10, color: WF.t.muted }}>{`(${i})`} <span style={{ display: "inline-block", width: 28, height: 4, background: WF.t.line2, verticalAlign: "middle", borderRadius: 2 }} /></div>)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* OCR result */}
      <div style={{ flex: 1.1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <WF.Chip tone="accent">디지털화 결과</WF.Chip>
            <span style={{ fontSize: 11, color: WF.t.muted }}>3 문항 · 정확도 96%</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <WF.Btn kind="ghost" size="sm">↺ 페이지 재인식</WF.Btn>
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
          {[5, 6, 7].map(n => (
            <div key={n} style={{
              background: WF.t.surface, border: `1px solid ${n === 6 ? WF.t.warn : WF.t.line}`,
              borderRadius: 8, padding: 12
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 4, background: WF.t.ink, color: "white", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{n}</div>
                  <WF.Chip tone={n === 6 ? "warn" : "ok"}>{n === 6 ? "인식 검토" : "확정"}</WF.Chip>
                  <WF.Chip>합성함수</WF.Chip>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <WF.Btn kind="ghost" size="sm">✎</WF.Btn>
                </div>
              </div>
              <WF.Para lines={2} last="75%" />
              {n === 6 && (
                <>
                  <div style={{ height: 55, marginTop: 8, background: WF.t.bg, border: `1px dashed ${WF.t.line}`, borderRadius: 4, display: "grid", placeItems: "center", fontSize: 10, color: WF.t.muted }}>그래프 인식 완료</div>
                  <div style={{ marginTop: 8, padding: 8, background: WF.t.warnSoft, borderRadius: 4, fontSize: 10, color: WF.t.warn }}>⚠ 함수식의 정의역 기호 확인 필요</div>
                </>
              )}
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                {[1,2,3,4,5].map(i => (
                  <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", border: `1px solid ${WF.t.line}`, fontSize: 8, color: WF.t.muted, display: "grid", placeItems: "center", flex: "0 0 12px" }}>{i}</div>
                    <WF.Line w={`${45 + (i * 8) % 35}%`} h={5} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ========== STEP 3: Variation options ==========
function WizStep3({ ctx }) {
  const { WF } = window;
  const [goal, setGoal] = useState(1);
  const [diff, setDiff] = useState(0);
  const [extras, setExtras] = useState({ solutions: true, answers: true, oapNote: false, stats: true });

  const goals = [
    { t: "디지털화만", d: "텍스트·수식으로 변환", ico: "Aa" },
    { t: "유사 문제 생성", d: "같은 개념 다른 문제", ico: "≈" },
    { t: "변형 시험지", d: "난이도 미세 조정", ico: "✦" },
    { t: "맞춤 보충", d: "단원별 약점 강화", ico: "◎" },
  ];

  return (
    <div style={{ padding: "28px 60px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 28 }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>어떻게 변형할까요?</div>
        <div style={{ fontSize: 12, color: WF.t.muted, marginBottom: 24 }}>30개 문항 전체에 적용됩니다. 다음 단계에서 개별 조정 가능합니다.</div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>변환 목표</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {goals.map((o, i) => {
              const on = i === goal;
              return (
                <div key={i} onClick={() => setGoal(i)} style={{
                  padding: 14, borderRadius: 8, cursor: "pointer",
                  border: `1px solid ${on ? WF.t.accent : WF.t.line}`,
                  background: on ? WF.t.accentSoft : WF.t.surface,
                  position: "relative", transition: "all 120ms"
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: on ? WF.t.accent : WF.t.ink2, marginBottom: 6 }}>{o.ico}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: on ? WF.t.accentInk : WF.t.ink }}>{o.t}</div>
                  <div style={{ fontSize: 11, color: WF.t.muted, marginTop: 2 }}>{o.d}</div>
                  {on && <div style={{ position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: "50%", background: WF.t.accent, color: "white", fontSize: 11, display: "grid", placeItems: "center" }}>✓</div>}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>난이도 조정</div>
          <div style={{ display: "flex", gap: 6 }}>
            {["원본 유지", "약간 쉽게", "약간 어렵게", "최상위권용"].map((t, i) => (
              <div key={i} onClick={() => setDiff(i)} style={{ cursor: "pointer" }}>
                <WF.Chip tone={i === diff ? "accent" : "neutral"}>{t}</WF.Chip>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 22 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>함께 만들 자료</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              ["solutions", "풀이·해설지"],
              ["answers", "정답지 (분리 출력)"],
              ["oapNote", "오답노트 템플릿"],
              ["stats", "단원·유형 통계"],
            ].map(([k, t]) => {
              const on = extras[k];
              return (
                <div key={k} onClick={() => setExtras(o => ({...o, [k]: !on}))} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "6px 10px",
                  border: `1px solid ${WF.t.line2}`, borderRadius: 6, cursor: "pointer"
                }}>
                  <div style={{
                    width: 32, height: 18, borderRadius: 10, background: on ? WF.t.accent : WF.t.line,
                    position: "relative", flex: "0 0 32px", transition: "background 160ms"
                  }}>
                    <div style={{ position: "absolute", top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: "50%", background: "white", transition: "left 160ms" }} />
                  </div>
                  <div style={{ fontSize: 12 }}>{t}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>미리보기 (1번 문항)</div>
        <div style={{ background: WF.t.surface, border: `1px solid ${WF.t.line}`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ padding: 14, borderRight: `1px solid ${WF.t.line2}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, marginBottom: 8 }}>원본</div>
              <WF.ProblemMock num={1} dense />
            </div>
            <div style={{ padding: 14, background: WF.t.accentSoft + "30" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.accentInk, marginBottom: 8 }}>변환 결과 (예상)</div>
              <WF.ProblemMock num={1} dense />
            </div>
          </div>
        </div>
        <WF.Note style={{ marginTop: 12 }}>옵션을 바꿀 때마다 1번 문항으로 즉시 미리보기</WF.Note>

        <div style={{ marginTop: 22, padding: 16, background: WF.t.bg, borderRadius: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>예상 소요</div>
          {[
            ["변환 시간", "약 2분 30초"],
            ["변환 문항", "30개"],
            ["크레딧 사용", "30 / 잔여 1,240"],
          ].map(([k, v], i) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: i < 2 ? 6 : 0 }}>
              <span style={{ color: WF.t.muted }}>{k}</span>
              <span style={{ fontWeight: 600, color: i === 2 ? WF.t.accent : WF.t.ink }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Wizard, WizStep1, WizStep2, WizStep3 });
