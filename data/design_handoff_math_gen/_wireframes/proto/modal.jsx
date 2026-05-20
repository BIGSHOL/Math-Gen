/* New Variant modal — Detail에서 진입. "변형 만들기" 시작 시 Wizard로 전환. */

function NewVariantModal({ ctx }) {
  const { WF } = window;
  const test = ctx.selectedTest;
  const [intensity, setIntensity] = useState(1); // 0,1,2
  const [count, setCount] = useState(3);
  const [opts, setOpts] = useState({
    shuffleProblems: true, shuffleChoices: true, withSolutions: true, redistPoints: false
  });

  const intensities = [
    ["숫자만 바꾸기", "거의 동일"],
    ["같은 유형·다른 문제", "변형 중"],
    ["새 문제 (개념만 유지)", "변형 강함"],
  ];

  return (
    <div style={{
      width: 960, maxWidth: "95vw", height: 680, maxHeight: "90vh",
      background: WF.t.surface, borderRadius: 16, overflow: "hidden",
      display: "flex", flexDirection: "column",
      boxShadow: "0 20px 60px rgba(0,0,0,0.3)"
    }}>
      <div style={{ padding: "18px 24px", borderBottom: `1px solid ${WF.t.line2}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>변형 시험지 만들기</div>
          <div style={{ fontSize: 11, color: WF.t.muted, marginTop: 2 }}>원본 1개 → 변형 {count}개 일괄 생성</div>
        </div>
        <Button onClick={ctx.closeModal} kind="ghost" size="sm">✕</Button>
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1.4fr", overflow: "hidden" }}>
        {/* Left */}
        <div style={{ padding: 24, borderRight: `1px solid ${WF.t.line2}`, overflow: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>1. 원본 선택</div>
          <div style={{ border: `1px solid ${WF.t.line}`, borderRadius: 8, padding: 12, display: "flex", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 50, height: 64, background: WF.t.bg, borderRadius: 3, display: "grid", placeItems: "center", fontSize: 9, fontWeight: 700, color: WF.t.accent }}>PDF</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{test?.title || "2024 6월 모의평가"}</div>
              <div style={{ fontSize: 11, color: WF.t.muted, marginTop: 2 }}>{test?.count || 30}문항 · {test?.subject || "공통+미적분"}</div>
              <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
                {(test?.tags || ["고3", "모의평가"]).map(t => <WF.Chip key={t}>{t}</WF.Chip>)}
              </div>
            </div>
          </div>
          <WF.Btn kind="ghost" size="sm" full>다른 시험지 선택</WF.Btn>

          <div style={{ fontSize: 11, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginTop: 28, marginBottom: 10 }}>2. 변형 강도</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {intensities.map(([t, s], i) => {
              const on = i === intensity;
              return (
                <div key={i} onClick={() => setIntensity(i)} style={{
                  padding: 10, borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center",
                  border: `1px solid ${on ? WF.t.accent : WF.t.line}`,
                  background: on ? WF.t.accentSoft : "transparent",
                  cursor: "pointer", transition: "all 120ms"
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{t}</div>
                    <div style={{ fontSize: 10, color: WF.t.muted, marginTop: 1 }}>{s}</div>
                  </div>
                  <div style={{
                    width: 14, height: 14, borderRadius: "50%",
                    border: `2px solid ${on ? WF.t.accent : WF.t.line}`,
                    background: on ? "white" : "transparent",
                    boxShadow: on ? `inset 0 0 0 2px ${WF.t.accent}` : "none"
                  }} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Right */}
        <div style={{ padding: 24, overflow: "auto", background: WF.t.bg }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>3. 생성할 시험지 수</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {[1, 2, 3, 5].map(n => {
              const on = n === count;
              return (
                <div key={n} onClick={() => setCount(n)} style={{
                  width: 56, height: 56, borderRadius: 8,
                  background: on ? WF.t.accent : WF.t.surface,
                  color: on ? "white" : WF.t.ink,
                  border: `1px solid ${on ? WF.t.accent : WF.t.line}`,
                  display: "grid", placeItems: "center", fontSize: 18, fontWeight: 700,
                  cursor: "pointer", transition: "all 120ms"
                }}>{n}</div>
              );
            })}
            <div style={{
              width: 80, height: 56, borderRadius: 8, background: WF.t.surface,
              border: `1px dashed ${WF.t.line}`, display: "grid", placeItems: "center",
              fontSize: 11, color: WF.t.muted, cursor: "pointer"
            }}>직접 입력</div>
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>4. 미리보기 (시험지 A · 1번)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
            {Array.from({ length: count }).slice(0, 3).map((_, i) => {
              const t = String.fromCharCode(65 + i);
              return (
                <div key={i} style={{
                  background: WF.t.surface, border: `1px solid ${i === 0 ? WF.t.accent : WF.t.line}`,
                  borderRadius: 6, padding: 10
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, marginBottom: 6 }}>시험지 {t}</div>
                  <WF.Line h={4} /><div style={{ height: 4 }} /><WF.Line h={4} w="80%" /><div style={{ height: 4 }} /><WF.Line h={4} w="60%" />
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                    {[1,2,3].map(j => <div key={j} style={{ display: "flex", gap: 4 }}><span style={{ fontSize: 8, color: WF.t.muted }}>{j}</span><WF.Line w={`${40 + j * 10}%`} h={3} /></div>)}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ padding: 12, background: WF.t.surface, borderRadius: 8, border: `1px solid ${WF.t.line2}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>옵션</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                ["shuffleProblems", "문항 순서 섞기"],
                ["shuffleChoices", "보기 순서 섞기"],
                ["withSolutions", "풀이·해설 함께 생성"],
                ["redistPoints", "배점 자동 재분배"],
              ].map(([k, t]) => {
                const on = opts[k];
                return (
                  <div key={k} onClick={() => setOpts(o => ({...o, [k]: !on}))} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                    <div style={{
                      width: 28, height: 16, borderRadius: 8, background: on ? WF.t.accent : WF.t.line,
                      position: "relative", transition: "background 160ms", flex: "0 0 28px"
                    }}>
                      <div style={{ position: "absolute", top: 2, left: on ? 14 : 2, width: 12, height: 12, borderRadius: "50%", background: "white", transition: "left 160ms" }} />
                    </div>
                    {t}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "14px 24px", borderTop: `1px solid ${WF.t.line2}`, background: WF.t.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 11, color: WF.t.muted }}>{count}개 시험지 × {test?.count || 30}문항 = <strong style={{ color: WF.t.ink }}>크레딧 {count * (test?.count || 30)}</strong> 사용</div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button onClick={ctx.closeModal} kind="ghost" size="md">취소</Button>
          <Button onClick={() => { ctx.closeModal(); ctx.startWizard(test?.id); }} kind="primary" size="md" icon="→">Wizard로 진행</Button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NewVariantModal });
