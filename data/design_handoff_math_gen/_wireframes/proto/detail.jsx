/* Detail screen — 시험지 상세. 메타데이터, 문항 미리보기, 변형 만들기 진입점. */

function Detail({ ctx }) {
  const { WF } = window;
  const test = ctx.selectedTest;
  if (!test) return null;

  const sampleProblems = [
    { num: 1, topic: "다항식 연산", diff: "하", points: 2, status: "ok", figure: false },
    { num: 2, topic: "복소수", diff: "하", points: 2, status: "ok", figure: false },
    { num: 3, topic: "이차방정식", diff: "중", points: 3, status: "ok", figure: false },
    { num: 4, topic: "함수 그래프", diff: "중", points: 3, status: "ok", figure: true },
    { num: 5, topic: "삼각함수", diff: "중", points: 3, status: "ok", figure: false },
    { num: 6, topic: "합성함수", diff: "중상", points: 3, status: "warn", figure: true },
  ];

  const topics = [
    ["다항식", 4, 0.85],
    ["방정식·부등식", 5, 0.72],
    ["도형의 방정식", 4, 0.6],
    ["함수와 그래프", 6, 0.5],
    ["수열·미적분", 8, 0.4],
    ["통계", 3, 0.92],
  ];

  return (
    <WF.Frame width="100%" height="100%" bg={WF.t.bg} style={{ position: "absolute", inset: 0 }}>

      {/* Top bar with back */}
      <div style={{
        height: 56, background: WF.t.surface, borderBottom: `1px solid ${WF.t.line}`,
        padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Button onClick={ctx.backToLibrary} kind="ghost" size="sm" icon="←">보관함</Button>
          <div style={{ width: 1, height: 18, background: WF.t.line2 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontSize: 11, color: WF.t.muted }}>내 시험지 ›</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{test.title}</div>
            <WF.Chip tone={test.status}>{test.statusText}</WF.Chip>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <WF.Btn kind="ghost" size="sm" icon="↗">공유</WF.Btn>
          <WF.Btn kind="secondary" size="sm" icon="↓">PDF 내보내기</WF.Btn>
          <Button onClick={() => ctx.openModal("new-variant")} kind="primary" size="sm" icon="✦">변형 만들기</Button>
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100% - 56px)", overflow: "hidden" }}>

        {/* Left — page thumbnails */}
        <div style={{ width: 180, borderRight: `1px solid ${WF.t.line2}`, background: WF.t.surface, padding: "16px 14px", overflow: "auto", flexShrink: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>페이지 (8)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[1,2,3,4,5,6,7,8].map(p => (
              <div key={p} style={{
                aspectRatio: "3 / 4", border: `1px solid ${p === 1 ? WF.t.accent : WF.t.line}`,
                borderRadius: 4, background: WF.t.bg, padding: 6,
                display: "flex", flexDirection: "column", gap: 3,
                position: "relative", cursor: "pointer",
                boxShadow: p === 1 ? `0 0 0 2px ${WF.t.accentSoft}` : "none"
              }}>
                <WF.Line h={2} w="80%" /><WF.Line h={2} /><WF.Line h={2} w="60%" />
                <div style={{ height: 14, background: WF.t.surface, border: `1px dashed ${WF.t.line}`, borderRadius: 2 }} />
                <WF.Line h={2} /><WF.Line h={2} w="70%" />
                <div style={{
                  position: "absolute", bottom: 4, right: 4,
                  background: WF.t.ink, color: "white", fontSize: 8, fontWeight: 700,
                  padding: "1px 4px", borderRadius: 2
                }}>{p}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Center — problem stream */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>
          {/* Hero */}
          <div style={{
            background: WF.t.surface, borderRadius: 12, border: `1px solid ${WF.t.line}`,
            padding: 22, marginBottom: 20, display: "flex", gap: 22
          }}>
            <div style={{
              width: 110, height: 142, background: WF.t.bg, borderRadius: 6,
              border: `1px solid ${WF.t.line}`, padding: 12, display: "flex", flexDirection: "column", gap: 3
            }}>
              <WF.Line h={3} /><WF.Line h={3} w="70%" /><WF.Line h={3} />
              <div style={{ height: 28, background: WF.t.surface, border: `1px dashed ${WF.t.line}`, borderRadius: 2 }} />
              <WF.Line h={3} /><WF.Line h={3} w="55%" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                {test.tags.map(tag => <WF.Chip key={tag}>{tag}</WF.Chip>)}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{test.title}</div>
              <div style={{ fontSize: 12, color: WF.t.muted, marginBottom: 14 }}>
                {test.subject} · {test.count}문항 · 업로드 {test.time}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, maxWidth: 540 }}>
                {[
                  ["문항", test.count, ""],
                  ["확정", test.count - 3, "/" + test.count],
                  ["검토 필요", 3, ""],
                  ["변형본", 2, "개"],
                ].map(([l, v, u], i) => (
                  <div key={i}>
                    <div style={{ fontSize: 10, color: WF.t.muted, marginBottom: 2 }}>{l}</div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>{v}<span style={{ fontSize: 11, color: WF.t.muted, fontWeight: 500 }}>{u}</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Problems */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>문항 미리보기</div>
            <div style={{ display: "flex", gap: 6 }}>
              <WF.Btn kind="ghost" size="sm">전체 보기 ↗</WF.Btn>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
            {sampleProblems.map(p => (
              <div key={p.num} style={{
                background: WF.t.surface, border: `1px solid ${WF.t.line}`,
                borderRadius: 8, padding: 12, fontSize: 11
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, background: WF.t.ink, color: "white", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700 }}>{p.num}</div>
                  <WF.Chip tone={p.status}>{p.status === "ok" ? "확정" : "검토"}</WF.Chip>
                  <span style={{ color: WF.t.muted, fontSize: 10, marginLeft: "auto" }}>{p.diff}·{p.points}점</span>
                </div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.topic}</div>
                <WF.Para lines={2} last="60%" />
                {p.figure && <div style={{ marginTop: 8, height: 50, background: WF.t.bg, border: `1px dashed ${WF.t.line}`, borderRadius: 4, display: "grid", placeItems: "center", fontSize: 9, color: WF.t.muted }}>그래프</div>}
              </div>
            ))}
          </div>

          {/* Action card */}
          <div style={{
            background: `linear-gradient(135deg, ${WF.t.accentSoft}, white)`,
            border: `1px solid ${WF.t.accent}`,
            borderRadius: 12, padding: 22, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 22
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: WF.t.accent, color: "white", display: "grid", placeItems: "center", fontSize: 14 }}>✦</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: WF.t.accentInk }}>이 시험지로 변형 시험지 만들기</div>
              </div>
              <div style={{ fontSize: 12, color: WF.t.ink2 }}>난이도·유형·문항을 미세 조정해서 새 시험지 N개를 한 번에 생성합니다.</div>
            </div>
            <Button onClick={() => ctx.openModal("new-variant")} kind="primary" size="lg" icon="→">변형 만들기</Button>
          </div>
        </div>

        {/* Right — metadata */}
        <div style={{ width: 280, borderLeft: `1px solid ${WF.t.line2}`, background: WF.t.surface, padding: "20px 18px", overflow: "auto", flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>정보</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22, fontSize: 12 }}>
            {[
              ["과목", test.subject],
              ["문항", test.count + "개"],
              ["업로드", "2025.05.18"],
              ["변환 방식", "OCR + 유사 문제"],
              ["크기", "2.4 MB"],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: WF.t.muted }}>{k}</span>
                <span style={{ fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>단원별 분포</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
            {topics.map(([t, n, acc]) => (
              <div key={t}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                  <span>{t}</span>
                  <span style={{ color: WF.t.muted }}>{n} · 정답률 {Math.round(acc * 100)}%</span>
                </div>
                <div style={{ height: 4, background: WF.t.line2, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ width: `${acc * 100}%`, height: "100%", background: acc < 0.5 ? WF.t.warn : WF.t.accent, transition: "width 400ms" }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>변형 이력</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              ["ver.1", "5/15 · 박선생"],
              ["ver.2", "5/18 · 박선생"],
            ].map(([v, m]) => (
              <div key={v} style={{ padding: 8, background: WF.t.bg, borderRadius: 6, display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                <span style={{ fontWeight: 600 }}>{v}</span>
                <span style={{ color: WF.t.muted }}>{m}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WF.Frame>
  );
}

Object.assign(window, { Detail });
