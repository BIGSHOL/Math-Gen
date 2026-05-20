/* V6 — Mobile / Compact
   모바일 우선. 빠른 사진 → 즉시 변환 → 스와이프 검토. 학원·과외 현장 즉석 활용. */

const V6 = {};

const Phone = ({ children, label }) => {
  const { WF } = window;
  return (
    <div style={{ position: "relative" }}>
      <div style={{
        width: 390, height: 800, background: "#0a0c14", borderRadius: 44,
        padding: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)"
      }}>
        <div style={{
          width: "100%", height: "100%", background: WF.t.surface, borderRadius: 36,
          overflow: "hidden", position: "relative",
          fontFamily: "Pretendard, sans-serif", color: WF.t.ink, fontSize: 13,
        }}>
          {/* Status bar */}
          <div style={{
            height: 38, padding: "0 24px", display: "flex", justifyContent: "space-between",
            alignItems: "center", fontSize: 12, fontWeight: 600
          }}>
            <span>9:41</span>
            <div style={{ width: 100, height: 24, background: "#0a0c14", borderRadius: 14 }} />
            <span style={{ fontSize: 10 }}>●●●● 100%</span>
          </div>
          {children}
        </div>
      </div>
      <div style={{ position: "absolute", top: -32, left: 0, right: 0, textAlign: "center" }}>
        <div style={{ display: "inline-block", background: WF.t.ink, color: "white", fontSize: 10, fontWeight: 600, padding: "4px 10px", borderRadius: 4, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</div>
      </div>
    </div>
  );
};

V6.Phones = () => {
  const { WF } = window;
  return (
    <WF.Frame width={1320} height={920} bg={WF.t.bg}>
      <div style={{ display: "flex", gap: 60, justifyContent: "center", alignItems: "center", height: "100%", padding: "60px 40px 40px" }}>

        {/* 1. Capture */}
        <Phone label="V6 · 촬영 → 즉시 변환">
          <div style={{ padding: "0 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
              <WF.Btn kind="ghost" size="sm">←</WF.Btn>
              <div style={{ fontSize: 13, fontWeight: 700 }}>기출지 변환</div>
              <WF.Btn kind="ghost" size="sm">⋯</WF.Btn>
            </div>
            <div style={{ marginTop: 6 }}>
              <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                {[1,2,3,4].map(i => (
                  <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i === 1 ? WF.t.accent : WF.t.line }} />
                ))}
              </div>
              <div style={{ fontSize: 11, color: WF.t.muted, textAlign: "center", marginTop: 6 }}>1 / 4 · 페이지를 모두 찍어주세요</div>
            </div>
          </div>

          {/* Camera viewport */}
          <div style={{ margin: "16px 20px", borderRadius: 16, overflow: "hidden", background: "#1a1d28", position: "relative", height: 380 }}>
            <div style={{
              position: "absolute", top: 30, left: 30, right: 30, bottom: 30,
              border: `2px solid white`, borderRadius: 6,
              background: "rgba(255,255,255,0.04)"
            }}>
              {/* Corner crops */}
              {[[0,0],[1,0],[0,1],[1,1]].map(([x,y], i) => (
                <div key={i} style={{
                  position: "absolute",
                  top: y ? "auto" : -2, bottom: y ? -2 : "auto",
                  left: x ? "auto" : -2, right: x ? -2 : "auto",
                  width: 16, height: 16,
                  borderTop: y ? "none" : `3px solid ${WF.t.accent}`,
                  borderBottom: y ? `3px solid ${WF.t.accent}` : "none",
                  borderLeft: x ? "none" : `3px solid ${WF.t.accent}`,
                  borderRight: x ? `3px solid ${WF.t.accent}` : "none",
                }} />
              ))}
              <div style={{
                position: "absolute", top: 20, left: 20, right: 20, bottom: 20,
                display: "flex", flexDirection: "column", gap: 6
              }}>
                <div style={{ fontSize: 9, color: "white", opacity: 0.6 }}>수학영역 1</div>
                <div style={{ height: 1, background: "white", opacity: 0.15 }} />
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3, opacity: 0.7 }}>
                    <div style={{ height: 4, background: "white", opacity: 0.4, width: `${60 + (i*9)%30}%` }} />
                    <div style={{ height: 4, background: "white", opacity: 0.25, width: `${75 + (i*5)%20}%` }} />
                  </div>
                ))}
              </div>
            </div>
            <div style={{
              position: "absolute", bottom: 12, left: 12, background: "rgba(0,0,0,0.6)",
              color: "white", fontSize: 10, padding: "4px 8px", borderRadius: 4
            }}>↻ 자동 정렬 중…</div>
          </div>

          {/* Thumbnails */}
          <div style={{ padding: "0 20px", display: "flex", gap: 6 }}>
            {[1,2].map(i => (
              <div key={i} style={{ width: 44, height: 56, borderRadius: 4, background: WF.t.bg, border: `1px solid ${WF.t.line}`, position: "relative" }}>
                <div style={{ position: "absolute", inset: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                  <WF.Line h={2} /><WF.Line h={2} w="80%" /><WF.Line h={2} w="60%" />
                </div>
              </div>
            ))}
            <div style={{ width: 44, height: 56, borderRadius: 4, border: `2px dashed ${WF.t.line}`, display: "grid", placeItems: "center", fontSize: 18, color: WF.t.muted }}>+</div>
            <div style={{ flex: 1 }} />
            <WF.Btn kind="primary" size="md">완료</WF.Btn>
          </div>

          {/* Shutter */}
          <div style={{ position: "absolute", bottom: 30, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 30 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: WF.t.line2, display: "grid", placeItems: "center", fontSize: 14 }}>🖼</div>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "white", border: `4px solid ${WF.t.accent}`, padding: 4 }}>
              <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: WF.t.accent }} />
            </div>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: WF.t.line2, display: "grid", placeItems: "center", fontSize: 14 }}>⤺</div>
          </div>
        </Phone>

        {/* 2. Swipe review */}
        <Phone label="V6 · 스와이프 검토">
          <div style={{ padding: "8px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <WF.Btn kind="ghost" size="sm">← 종료</WF.Btn>
            <div style={{ fontSize: 12, fontWeight: 700 }}>6 / 30</div>
            <WF.Btn kind="ghost" size="sm">⋯</WF.Btn>
          </div>

          {/* Progress bar */}
          <div style={{ margin: "0 20px 12px", height: 3, background: WF.t.line2, borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: "20%", height: "100%", background: WF.t.accent }} />
          </div>

          {/* Problem card */}
          <div style={{ margin: "0 20px", border: `1px solid ${WF.t.line}`, borderRadius: 12, padding: 16, background: WF.t.surface }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: WF.t.ink, color: "white", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>6</div>
                <WF.Chip tone="warn">검토 필요</WF.Chip>
              </div>
              <div style={{ fontSize: 10, color: WF.t.muted }}>합성함수 · 3점</div>
            </div>
            <WF.Para lines={3} last="60%" />
            <div style={{ marginTop: 12, height: 100, background: WF.t.bg, border: `1px dashed ${WF.t.line}`, borderRadius: 6, display: "grid", placeItems: "center", fontSize: 10, color: WF.t.muted }}>함수 그래프</div>
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <div style={{ width: 16, height: 16, borderRadius: "50%", border: `1px solid ${WF.t.line}`, fontSize: 10, color: WF.t.muted, display: "grid", placeItems: "center", flex: "0 0 16px" }}>{i}</div>
                  <WF.Line w={`${50 + (i*7)%30}%`} h={6} />
                </div>
              ))}
            </div>
          </div>

          {/* Swipe hints */}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 28px", fontSize: 10, color: WF.t.muted }}>
            <span>← 다시 생성</span>
            <span>확정 →</span>
          </div>

          {/* Bottom sheet preview */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            background: WF.t.surface, borderTop: `1px solid ${WF.t.line}`,
            borderRadius: "20px 20px 0 0", padding: "12px 20px 24px",
            boxShadow: "0 -4px 16px rgba(0,0,0,0.06)"
          }}>
            <div style={{ width: 36, height: 4, background: WF.t.line, borderRadius: 2, margin: "0 auto 12px" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
              {[["↺", "재생성"], ["✎", "수정"], ["◧◨", "원본"], ["✓", "확정"]].map(([i, t], k) => (
                <div key={k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 0", border: `1px solid ${WF.t.line2}`, borderRadius: 8, background: k === 3 ? WF.t.accentSoft : "white" }}>
                  <div style={{ fontSize: 16, color: k === 3 ? WF.t.accentInk : WF.t.ink }}>{i}</div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: k === 3 ? WF.t.accentInk : WF.t.ink2 }}>{t}</div>
                </div>
              ))}
            </div>
            <WF.Btn kind="primary" size="lg" full icon="↓">전체 PDF 내보내기</WF.Btn>
          </div>
        </Phone>

        {/* 3. Library */}
        <Phone label="V6 · 시험지 보관함">
          <div style={{ padding: "8px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>내 시험지</div>
            <div style={{ display: "flex", gap: 8 }}>
              <WF.Btn kind="ghost" size="sm">⌕</WF.Btn>
              <WF.Btn kind="primary" size="sm">+ 새로</WF.Btn>
            </div>
          </div>

          {/* Filter chips */}
          <div style={{ padding: "8px 20px", display: "flex", gap: 6, overflow: "auto" }}>
            <WF.Chip tone="accent">전체</WF.Chip>
            <WF.Chip>최근</WF.Chip>
            <WF.Chip>검토 중</WF.Chip>
            <WF.Chip>변형</WF.Chip>
          </div>

          {/* Quick action banner */}
          <div style={{ margin: "8px 20px", padding: 14, borderRadius: 10, background: `linear-gradient(135deg, ${WF.t.accent}, #6366F1)`, color: "white" }}>
            <div style={{ fontSize: 11, opacity: 0.8 }}>지금 작업 중</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>2024 6월 모의평가</div>
            <div style={{ fontSize: 11, opacity: 0.85, marginTop: 4 }}>27 / 30 확정 · 3개 검토 필요</div>
            <div style={{ marginTop: 8, height: 4, background: "rgba(255,255,255,0.25)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: "90%", height: "100%", background: "white" }} />
            </div>
          </div>

          {/* List */}
          <div style={{ padding: "8px 20px", display: "flex", flexDirection: "column", gap: 8, overflow: "auto" }}>
            {[
              ["3월 학평 변형 ver.2", "30문항 · 확정", "어제", "ok"],
              ["수능 미적분 클론", "8문항 · 확정", "2일 전", "ok"],
              ["내신 대비 모의 1차", "25문항 · 초안", "3일 전", "neutral"],
              ["2023 9월 모의평가", "30문항 · 확정", "1주 전", "ok"],
              ["기출 변형 (확통)", "12문항", "1주 전", "ok"],
            ].map(([t, s, time, tone], i) => (
              <div key={i} style={{ display: "flex", gap: 12, padding: 10, border: `1px solid ${WF.t.line2}`, borderRadius: 10, background: "white" }}>
                <div style={{ width: 40, height: 50, background: WF.t.bg, borderRadius: 4, padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                  <WF.Line h={2} /><WF.Line h={2} w="80%" /><WF.Line h={2} /><WF.Line h={2} w="60%" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{t}</div>
                  <div style={{ fontSize: 10, color: WF.t.muted, marginTop: 2 }}>{s}</div>
                  <div style={{ fontSize: 10, color: WF.t.muted, marginTop: 2 }}>{time}</div>
                </div>
                <WF.Chip tone={tone}>{tone === "ok" ? "확정" : "초안"}</WF.Chip>
              </div>
            ))}
          </div>

          {/* Bottom nav */}
          <div style={{
            position: "absolute", bottom: 0, left: 0, right: 0, height: 70,
            background: WF.t.surface, borderTop: `1px solid ${WF.t.line2}`,
            display: "grid", gridTemplateColumns: "repeat(4, 1fr)", padding: "8px 0 16px"
          }}>
            {[["📚", "보관함", true], ["📷", "촬영"], ["⊕", "단원"], ["⚙", "설정"]].map(([i, t, on], k) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 18, color: on ? WF.t.accent : WF.t.muted }}>{i}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: on ? WF.t.accent : WF.t.muted }}>{t}</div>
              </div>
            ))}
          </div>
        </Phone>

      </div>
    </WF.Frame>
  );
};

Object.assign(window, { V6 });
