/* Wizard Step 4 (문항 검토) + Step 5 (내보내기) */

// ========== STEP 4: Per-problem review ==========
function WizStep4({ ctx }) {
  const { WF } = window;
  const [selectedNum, setSelectedNum] = useState(6);
  const [filter, setFilter] = useState("all");

  // Status map
  const allProblems = Array.from({ length: 30 }).map((_, i) => {
    const n = i + 1;
    let status = "ok";
    if ([6, 11, 22].includes(n)) status = "warn";
    else if ([28, 29, 30].includes(n)) status = "pending";
    return { num: n, status };
  });

  const filtered = filter === "all" ? allProblems
    : filter === "warn" ? allProblems.filter(p => p.status === "warn")
    : allProblems.filter(p => p.status === "pending");

  const selected = allProblems.find(p => p.num === selectedNum);

  return (
    <div style={{ display: "flex", height: "100%", minHeight: 600 }}>

      {/* Index sidebar */}
      <div style={{ width: 220, borderRight: `1px solid ${WF.t.line2}`, background: WF.t.surface, padding: 16, overflow: "auto", flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5 }}>문항 30개</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[["all", "전체"], ["warn", "검토"], ["pending", "대기"]].map(([v, l]) => (
              <div key={v} onClick={() => setFilter(v)} style={{
                fontSize: 10, padding: "2px 6px", borderRadius: 4, cursor: "pointer",
                background: filter === v ? WF.t.accentSoft : WF.t.bg,
                color: filter === v ? WF.t.accentInk : WF.t.muted, fontWeight: 600
              }}>{l}</div>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 16 }}>
          {allProblems.map(p => {
            const focus = p.num === selectedNum;
            const hidden = filter !== "all" && !filtered.includes(p);
            return (
              <div key={p.num} onClick={() => setSelectedNum(p.num)} style={{
                height: 30, borderRadius: 4, display: "grid", placeItems: "center",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
                background: focus ? WF.t.accent
                  : p.status === "pending" ? WF.t.line2 : "white",
                color: focus ? "white"
                  : p.status === "warn" ? WF.t.warn
                  : p.status === "pending" ? WF.t.muted
                  : WF.t.ink2,
                border: focus ? "none" : `1px solid ${
                  p.status === "ok" ? WF.t.ok + "44"
                  : p.status === "warn" ? WF.t.warn + "66"
                  : WF.t.line
                }`,
                opacity: hidden ? 0.25 : 1, transition: "all 140ms"
              }}>{p.num}</div>
            );
          })}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 18, fontSize: 11 }}>
          {[
            ["확정", 24, WF.t.ok],
            ["검토 필요", 3, WF.t.warn],
            ["생성 대기", 3, WF.t.muted],
          ].map(([l, n, c]) => (
            <div key={l} style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
                {l}
              </span>
              <span style={{ color: WF.t.muted }}>{n}</span>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 8 }}>단원별 점프</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {[
            ["다항식", "1–4"],
            ["방정식·부등식", "5–9"],
            ["도형의 방정식", "10–13"],
            ["함수와 그래프", "14–19"],
            ["수열·미적분", "20–27"],
            ["통계", "28–30"],
          ].map(([t, r], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, color: WF.t.ink2, cursor: "pointer" }}>
              <span>{t}</span><span style={{ color: WF.t.muted }}>{r}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main work area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Toolbar */}
        <div style={{
          padding: "12px 28px", borderBottom: `1px solid ${WF.t.line2}`,
          background: WF.t.surface, display: "flex", justifyContent: "space-between", alignItems: "center"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Button onClick={() => setSelectedNum(Math.max(1, selectedNum - 1))} kind="ghost" size="md">←</Button>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedNum} / 30</div>
            <Button onClick={() => setSelectedNum(Math.min(30, selectedNum + 1))} kind="ghost" size="md">→</Button>
            <WF.Chip tone={selected?.status === "warn" ? "warn" : selected?.status === "pending" ? "neutral" : "ok"}>
              {selected?.status === "warn" ? "검토 필요" : selected?.status === "pending" ? "생성 대기" : "확정"}
            </WF.Chip>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <WF.Btn kind="secondary" size="md" icon="↺">다시 생성</WF.Btn>
            <WF.Btn kind="secondary" size="md" icon="✎">직접 편집</WF.Btn>
            <WF.Btn kind="soft" size="md" icon="✓">확정</WF.Btn>
          </div>
        </div>

        {/* Compare panes */}
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, padding: 22, overflow: "auto", minHeight: 0 }}>
          <div style={{ background: WF.t.surface, border: `1px solid ${WF.t.line}`, borderRadius: 10, padding: 18, overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <WF.Chip>원본 · {selectedNum}번</WF.Chip>
              <div style={{ fontSize: 10, color: WF.t.muted }}>3점</div>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.7 }}>
              <p>함수 <span style={{ background: WF.t.warnSoft, padding: "1px 4px" }}>f(x) = x² − 4x + 3</span>에 대하여…</p>
              <WF.Para lines={3} last="70%" style={{ marginTop: 8 }} />
              <div style={{ marginTop: 10, height: 90, background: WF.t.bg, border: `1px dashed ${WF.t.line}`, borderRadius: 4, display: "grid", placeItems: "center", fontSize: 10, color: WF.t.muted }}>함수 그래프</div>
              <WF.Para lines={4} last="40%" style={{ marginTop: 10 }} />
            </div>
          </div>

          <div style={{
            background: WF.t.surface,
            border: `2px solid ${selected?.status === "warn" ? WF.t.warn : WF.t.accent}`,
            borderRadius: 10, padding: 18, overflow: "auto",
            boxShadow: `0 4px 12px ${selected?.status === "warn" ? "rgba(217,119,6,0.12)" : WF.t.accentSoft}`
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <WF.Chip tone="accent">변환 결과</WF.Chip>
              <div style={{ fontSize: 10, color: WF.t.muted }}>3점 · 합성함수</div>
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.7 }}>
              <p>함수 <span style={{ background: WF.t.okSoft, padding: "1px 4px", color: WF.t.ok, fontWeight: 600 }}>g(x) = 2x² − 6x + 1</span>에 대하여…</p>
              <WF.Para lines={3} last="70%" style={{ marginTop: 8 }} />
              <div style={{ marginTop: 10, height: 90, background: WF.t.bg, border: `1px dashed ${WF.t.accent}`, borderRadius: 4, display: "grid", placeItems: "center", fontSize: 10, color: WF.t.accentInk }}>그래프 · 새로 생성</div>
              <WF.Para lines={4} last="40%" style={{ marginTop: 10 }} />
            </div>

            {selected?.status === "warn" && (
              <div style={{ marginTop: 12, padding: 10, background: WF.t.warnSoft, borderRadius: 6, fontSize: 11, color: WF.t.warn }}>
                ⚠ 원본과 정의역이 다릅니다. 함수식을 확인해 주세요.
              </div>
            )}
          </div>
        </div>

        {/* Bottom — tabs (solution/notes) */}
        <div style={{ borderTop: `1px solid ${WF.t.line2}`, background: WF.t.surface, padding: "10px 28px" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
            {["풀이", "해설", "변경 이력", "메모"].map((t, i) => (
              <div key={i} style={{
                padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 4, cursor: "pointer",
                background: i === 0 ? WF.t.accentSoft : "transparent",
                color: i === 0 ? WF.t.accentInk : WF.t.muted
              }}>{t}</div>
            ))}
          </div>
          <WF.Para lines={2} last="40%" />
        </div>
      </div>
    </div>
  );
}

// ========== STEP 5: Export ==========
function WizStep5({ ctx }) {
  const { WF } = window;
  const [format, setFormat] = useState("pdf");
  const [bundle, setBundle] = useState({ problems: true, answers: true, solutions: true, stats: false });

  const formats = [
    { v: "pdf", t: "인쇄용 PDF", d: "학교 시험지 레이아웃", ico: "📄" },
    { v: "hwp", t: "한글 (HWP)", d: "직접 편집 가능", ico: "ᄀ" },
    { v: "docx", t: "MS Word", d: "표·수식 호환", ico: "W" },
    { v: "online", t: "온라인 시험지", d: "링크로 학생 배포", ico: "🌐" },
  ];

  return (
    <div style={{ padding: "32px 60px", display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 32 }}>

      <div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>어떻게 내보낼까요?</div>
        <div style={{ fontSize: 12, color: WF.t.muted, marginBottom: 22 }}>형식을 선택하면 미리보기가 즉시 갱신됩니다.</div>

        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>출력 형식</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 24 }}>
          {formats.map(f => {
            const on = f.v === format;
            return (
              <div key={f.v} onClick={() => setFormat(f.v)} style={{
                padding: 14, borderRadius: 8, cursor: "pointer",
                border: `1px solid ${on ? WF.t.accent : WF.t.line}`,
                background: on ? WF.t.accentSoft : WF.t.surface,
                position: "relative", transition: "all 120ms"
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: on ? WF.t.accent : WF.t.ink2, marginBottom: 4 }}>{f.ico}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: on ? WF.t.accentInk : WF.t.ink }}>{f.t}</div>
                <div style={{ fontSize: 10, color: WF.t.muted, marginTop: 2 }}>{f.d}</div>
                {on && <div style={{ position: "absolute", top: 8, right: 8, width: 16, height: 16, borderRadius: "50%", background: WF.t.accent, color: "white", fontSize: 10, display: "grid", placeItems: "center" }}>✓</div>}
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>함께 내보낼 자료</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 24 }}>
          {[
            ["problems", "문제지", "30 문항 · 8 페이지"],
            ["answers", "정답지", "분리 PDF"],
            ["solutions", "해설지", "풀이 포함"],
            ["stats", "단원·유형 통계", "엑셀"],
          ].map(([k, t, sub]) => {
            const on = bundle[k];
            return (
              <div key={k} onClick={() => setBundle(o => ({...o, [k]: !on}))} style={{
                display: "flex", alignItems: "center", gap: 10, padding: 10,
                border: `1px solid ${on ? WF.t.accent : WF.t.line2}`, borderRadius: 6, cursor: "pointer",
                background: on ? WF.t.accentSoft + "30" : "transparent", transition: "all 120ms"
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: 4,
                  background: on ? WF.t.accent : "white",
                  border: `1px solid ${on ? WF.t.accent : WF.t.line}`,
                  display: "grid", placeItems: "center", color: "white", fontSize: 11, flex: "0 0 18px"
                }}>{on ? "✓" : ""}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{t}</div>
                  <div style={{ fontSize: 10, color: WF.t.muted }}>{sub}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>파일명</div>
        <WF.Input value={`${ctx.selectedTest?.title || "변형 시험지"} · ${new Date().toLocaleDateString("ko-KR")}`} suffix=".pdf" />
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>미리보기</div>
        <div style={{ background: "#e8eaef", borderRadius: 10, padding: 24, display: "flex", justifyContent: "center", gap: 14 }}>
          {/* Mock PDF preview */}
          {[1, 2].map(p => (
            <div key={p} style={{
              width: 200, aspectRatio: "3 / 4.2", background: "white",
              boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
              padding: 16, display: "flex", flexDirection: "column", gap: 4
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, marginBottom: 4 }}>2024 6월 모의평가 · 변형</div>
              <div style={{ height: 1, background: WF.t.line, marginBottom: 6 }} />
              {[1, 2, 3].map(n => (
                <div key={n} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 3 }}>
                    <span style={{ fontSize: 8, fontWeight: 700 }}>{n + (p - 1) * 3}.</span>
                    <WF.Line h={3} w="85%" />
                  </div>
                  <div style={{ marginLeft: 9, marginTop: 3 }}>
                    <WF.Line h={3} w="60%" />
                  </div>
                  <div style={{ marginLeft: 9, marginTop: 5, display: "flex", flexDirection: "column", gap: 2 }}>
                    {[1,2,3,4,5].map(i => <div key={i} style={{ display: "flex", gap: 3 }}><span style={{ fontSize: 7, color: WF.t.muted }}>({i})</span><WF.Line w="50%" h={2} /></div>)}
                  </div>
                </div>
              ))}
              <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 7, color: WF.t.muted }}>수학영역</span>
                <span style={{ fontSize: 7, color: WF.t.muted }}>{p}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, display: "flex", justifyContent: "center", gap: 4 }}>
          {[1,2,3,4,5,6,7,8].map(p => (
            <div key={p} style={{ width: 24, height: 24, borderRadius: 3, background: p === 1 ? WF.t.accent : WF.t.line2, color: p === 1 ? "white" : WF.t.muted, fontSize: 10, fontWeight: 600, display: "grid", placeItems: "center", cursor: "pointer" }}>{p}</div>
          ))}
        </div>

        <div style={{ marginTop: 24, padding: 18, background: WF.t.surface, border: `1px solid ${WF.t.line}`, borderRadius: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>최종 점검</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              ["전체 문항", "30 / 30 확정", "ok"],
              ["검토 필요", "0", "ok"],
              ["풀이·해설", "포함", "ok"],
              ["출력 형식", format === "pdf" ? "PDF" : format === "hwp" ? "HWP" : format === "docx" ? "Word" : "Online", "ok"],
            ].map(([k, v, t]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: WF.t.muted, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ color: WF.t.ok }}>✓</span>{k}
                </span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${WF.t.line2}`, display: "flex", gap: 8 }}>
            <WF.Btn kind="secondary" size="md" full icon="👁">미리보기 열기</WF.Btn>
            <WF.Btn kind="primary" size="md" full icon="↓">{format === "pdf" ? "PDF 다운로드" : "내보내기"}</WF.Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { WizStep4, WizStep5 });
