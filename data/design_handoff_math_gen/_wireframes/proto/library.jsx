/* Library screen — 보관함 그리드. 카드 클릭 → Detail. "새 변환" → Wizard. */

function Library({ ctx }) {
  const { WF, APP } = window;
  const [hoverId, setHoverId] = useState(null);
  const [collection, setCollection] = useState("전체");
  const [view, setView] = useState("grid");

  const collections = [
    ["전체", 47, true],
    ["모의평가", 12, false],
    ["수능 기출", 8, false],
    ["학교 시험", 18, false],
    ["내가 만든 변형", 9, false],
    ["휴지통", 3, false],
  ];

  return (
    <WF.Frame width="100%" height="100%" bg={WF.t.bg} style={{ position: "absolute", inset: 0 }}>
      <WF.AppBar
        tabs={["내 시험지", "변환 작업", "단원 자료"]}
        current="내 시험지"
        right={<>
          <WF.Btn kind="ghost" size="sm" icon="⌕">검색</WF.Btn>
          <Button onClick={() => ctx.startWizard(null)} kind="primary" size="sm" icon="+">새 변환</Button>
        </>}
      />

      <div style={{ display: "flex", height: "calc(100% - 56px)" }}>

        {/* Sidebar nav */}
        <div style={{ width: 220, borderRight: `1px solid ${WF.t.line}`, background: WF.t.surface, padding: 16, overflow: "auto", flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>컬렉션</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 24 }}>
            {collections.map(([t, n], i) => {
              const on = t === collection;
              return (
                <div key={i} onClick={() => setCollection(t)} style={{
                  padding: "7px 10px", borderRadius: 6, display: "flex", justifyContent: "space-between",
                  background: on ? WF.t.accentSoft : "transparent",
                  color: on ? WF.t.accentInk : WF.t.ink2,
                  fontSize: 12, fontWeight: on ? 600 : 500, cursor: "pointer",
                  transition: "background 120ms"
                }}>
                  <span>{t}</span>
                  <span style={{ fontSize: 10, color: WF.t.muted }}>{n}</span>
                </div>
              );
            })}
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>학년</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
            {["고1", "고2", "고3 · 재수"].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px", fontSize: 12, cursor: "pointer" }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${WF.t.line}`, background: i === 2 ? WF.t.accent : "white" }} />
                {t}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>태그</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {["미적분", "확통", "기하", "공통수학1", "수능 직전"].map((t, i) => <WF.Chip key={i}>#{t}</WF.Chip>)}
          </div>
        </div>

        {/* Main */}
        <div style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{collection}</div>
              <div style={{ fontSize: 12, color: WF.t.muted, marginTop: 2 }}>47개 · 최근 7일 12개 추가</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <WF.Btn kind="secondary" size="md">정렬: 최근순 ▾</WF.Btn>
              <div style={{ display: "flex", border: `1px solid ${WF.t.line}`, borderRadius: 6, overflow: "hidden" }}>
                {[["⊞", "grid"], ["≡", "list"]].map(([i, v]) => (
                  <div key={v} onClick={() => setView(v)} style={{
                    padding: "8px 10px", fontSize: 12, cursor: "pointer",
                    background: view === v ? WF.t.accentSoft : "white",
                    color: view === v ? WF.t.accentInk : WF.t.muted
                  }}>{i}</div>
                ))}
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
            {[
              ["변환 완료", "1,420", "문항", WF.t.ok],
              ["변형 시험지", "9", "개 생성", WF.t.accent],
              ["검토 대기", "23", "문항", WF.t.warn],
              ["이번 달 사용", "318 / 2,000", "크레딧", WF.t.ink],
            ].map(([l, v, u, c], i) => (
              <WF.Box key={i} pad={14}>
                <div style={{ fontSize: 11, color: WF.t.muted, marginBottom: 6 }}>{l}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: c }}>{v}</div>
                  <div style={{ fontSize: 11, color: WF.t.muted }}>{u}</div>
                </div>
              </WF.Box>
            ))}
          </div>

          {/* Grid */}
          <div style={{ fontSize: 12, fontWeight: 700, color: WF.t.ink2, marginBottom: 10 }}>최근 작업</div>
          {view === "grid" ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              {APP.MOCK_TESTS.map((t) => (
                <TestCard
                  key={t.id}
                  test={t}
                  hover={hoverId === t.id}
                  onHover={(v) => setHoverId(v ? t.id : null)}
                  onClick={() => ctx.openTest(t.id)}
                />
              ))}
            </div>
          ) : (
            <ListView tests={APP.MOCK_TESTS} onClick={(id) => ctx.openTest(id)} />
          )}
        </div>
      </div>
    </WF.Frame>
  );
}

function TestCard({ test, hover, onHover, onClick }) {
  const { WF } = window;
  return (
    <div
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onClick}
      style={{
        border: `1px solid ${hover ? WF.t.accent : WF.t.line}`,
        borderRadius: 10, overflow: "hidden", background: WF.t.surface,
        display: "flex", flexDirection: "column", cursor: "pointer",
        transition: "all 160ms ease",
        transform: hover ? "translateY(-2px)" : "translateY(0)",
        boxShadow: hover ? "0 6px 20px rgba(79, 70, 229, 0.12)" : "0 1px 2px rgba(0,0,0,0.02)"
      }}>
      <div style={{
        height: 110, background: WF.t.bg, position: "relative",
        borderBottom: `1px solid ${WF.t.line2}`,
        padding: 14, display: "flex", flexDirection: "column", gap: 4
      }}>
        <WF.Line h={5} w="80%" /><WF.Line h={3} /><WF.Line h={3} w="70%" />
        <div style={{ height: 30, background: WF.t.surface, border: `1px dashed ${WF.t.line}`, marginTop: 4, borderRadius: 3 }} />
        <WF.Line h={3} /><WF.Line h={3} w="55%" />
        <div style={{ position: "absolute", top: 8, right: 8 }}>
          <WF.Chip tone={test.status}>{test.statusText}</WF.Chip>
        </div>
      </div>
      <div style={{ padding: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{test.title}</div>
        <div style={{ fontSize: 11, color: WF.t.muted, display: "flex", justifyContent: "space-between" }}>
          <span>{test.count}문항</span><span>{test.time}</span>
        </div>
      </div>
    </div>
  );
}

function ListView({ tests, onClick }) {
  const { WF } = window;
  return (
    <div style={{ background: WF.t.surface, borderRadius: 10, border: `1px solid ${WF.t.line}`, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${WF.t.line2}`, display: "grid", gridTemplateColumns: "1fr 100px 120px 100px 80px", fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5 }}>
        <span>제목</span><span>문항 수</span><span>과목</span><span>상태</span><span>수정</span>
      </div>
      {tests.map(t => (
        <div key={t.id} onClick={() => onClick(t.id)} style={{
          padding: "12px 16px", borderBottom: `1px solid ${WF.t.line2}`,
          display: "grid", gridTemplateColumns: "1fr 100px 120px 100px 80px", alignItems: "center",
          cursor: "pointer", fontSize: 12, transition: "background 120ms"
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = WF.t.bg}
        onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
          <span style={{ fontWeight: 600 }}>{t.title}</span>
          <span style={{ color: WF.t.muted }}>{t.count}</span>
          <span style={{ color: WF.t.muted }}>{t.subject}</span>
          <WF.Chip tone={t.status}>{t.statusText}</WF.Chip>
          <span style={{ color: WF.t.muted, fontSize: 11 }}>{t.time}</span>
        </div>
      ))}
    </div>
  );
}

// Clickable button wrapper around WF.Btn
function Button({ children, onClick, ...props }) {
  return (
    <div onClick={onClick} style={{ cursor: "pointer" }}>
      <window.WF.Btn {...props}>{children}</window.WF.Btn>
    </div>
  );
}

Object.assign(window, { Library, Button });
