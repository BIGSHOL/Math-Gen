/* V4 — Library-First Dashboard
   '내 시험지' 컬렉션이 1급 시민. 카드 그리드로 보고, 클릭해서 변형 실행. */

const V4 = {};

V4.Library = () => {
  const { WF } = window;
  return (
    <WF.Frame width={1280} height={820} label="V4 · 라이브러리 대시보드">
      <WF.AppBar
        tabs={["내 시험지", "변환 작업", "단원 자료"]}
        current="내 시험지"
        right={<>
          <WF.Btn kind="ghost" size="sm" icon="⌕">검색</WF.Btn>
          <WF.Btn kind="primary" size="sm" icon="+">새 변환</WF.Btn>
        </>}
      />

      <div style={{ display: "flex", height: "calc(100% - 56px)" }}>
        {/* Sidebar nav */}
        <div style={{ width: 220, borderRight: `1px solid ${WF.t.line}`, background: WF.t.surface, padding: 16, overflow: "auto" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>컬렉션</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 24 }}>
            {[
              ["전체", 47, true],
              ["모의평가", 12, false],
              ["수능 기출", 8, false],
              ["학교 시험", 18, false],
              ["내가 만든 변형", 9, false],
              ["휴지통", 3, false],
            ].map(([t, n, on], i) => (
              <div key={i} style={{
                padding: "7px 10px", borderRadius: 6, display: "flex", justifyContent: "space-between",
                background: on ? WF.t.accentSoft : "transparent",
                color: on ? WF.t.accentInk : WF.t.ink2,
                fontSize: 12, fontWeight: on ? 600 : 500
              }}>
                <span>{t}</span>
                <span style={{ fontSize: 10, color: WF.t.muted }}>{n}</span>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>학년</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
            {["고1", "고2", "고3 · 재수"].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 4px", fontSize: 12 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, border: `1px solid ${WF.t.line}`, background: i === 2 ? WF.t.accent : "white" }} />
                {t}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>태그</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {["미적분", "확통", "기하", "공통수학1", "수능 직전"].map((t, i) => <WF.Chip key={i}>#{t}</WF.Chip>)}
          </div>

          <div style={{ marginTop: "auto" }} />
        </div>

        {/* Main */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>내 시험지</div>
              <div style={{ fontSize: 12, color: WF.t.muted, marginTop: 2 }}>47개 · 최근 7일 12개 추가</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <WF.Btn kind="secondary" size="md">정렬: 최근순 ▾</WF.Btn>
              <div style={{ display: "flex", border: `1px solid ${WF.t.line}`, borderRadius: 6, overflow: "hidden" }}>
                <div style={{ padding: "8px 10px", background: WF.t.accentSoft, color: WF.t.accentInk, fontSize: 12 }}>⊞</div>
                <div style={{ padding: "8px 10px", color: WF.t.muted, fontSize: 12 }}>≡</div>
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
            {[
              ["2024 6월 모의평가", "30문항", "검토 중", "warn", "오늘"],
              ["3월 학평 변형 ver.2", "30문항", "확정", "ok", "어제"],
              ["수능 미적분 클론", "8문항", "확정", "ok", "2일 전"],
              ["내신 대비 모의 1차", "25문항", "초안", "neutral", "3일 전"],
              ["2023 9월 모의평가", "30문항", "확정", "ok", "1주 전"],
              ["기출 변형 (확통)", "12문항", "확정", "ok", "1주 전"],
              ["10월 학평 + 변형", "30문항", "확정", "ok", "2주 전"],
              ["여름방학 보충 세트", "40문항", "초안", "neutral", "3주 전"],
            ].map(([t, n, s, tone, time], i) => (
              <div key={i} style={{
                border: `1px solid ${WF.t.line}`, borderRadius: 10, overflow: "hidden",
                background: WF.t.surface, display: "flex", flexDirection: "column"
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
                    <WF.Chip tone={tone}>{s}</WF.Chip>
                  </div>
                </div>
                <div style={{ padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t}</div>
                  <div style={{ fontSize: 11, color: WF.t.muted, display: "flex", justifyContent: "space-between" }}>
                    <span>{n}</span><span>{time}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${WF.t.line2}` }}>
                    <WF.Btn kind="ghost" size="sm">열기</WF.Btn>
                    <WF.Btn kind="ghost" size="sm">↺ 변형</WF.Btn>
                    <WF.Btn kind="ghost" size="sm" style={{ marginLeft: "auto" }}>⋯</WF.Btn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WF.Frame>
  );
};

V4.NewVariant = () => {
  const { WF } = window;
  return (
    <WF.Frame width={1280} height={820} label="V4 · 변형 시험지 만들기" bg="rgba(15,18,30,0.55)">
      {/* Backdrop: faded library */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.25 }}>
        <V4.Library />
      </div>

      {/* Modal */}
      <div style={{
        position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
        width: 960, height: 680, background: WF.t.surface, borderRadius: 16,
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column",
        overflow: "hidden"
      }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${WF.t.line2}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>변형 시험지 만들기</div>
            <div style={{ fontSize: 11, color: WF.t.muted, marginTop: 2 }}>원본 1개 → 변형 N개 일괄 생성</div>
          </div>
          <WF.Btn kind="ghost" size="sm">✕</WF.Btn>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1.4fr", overflow: "hidden" }}>
          {/* Left: source */}
          <div style={{ padding: 24, borderRight: `1px solid ${WF.t.line2}`, overflow: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>1. 원본 선택</div>
            <div style={{ border: `1px solid ${WF.t.line}`, borderRadius: 8, padding: 12, display: "flex", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 50, height: 64, background: WF.t.bg, borderRadius: 3, display: "grid", placeItems: "center", fontSize: 9, fontWeight: 700, color: WF.t.accent }}>PDF</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>2024 6월 모의평가</div>
                <div style={{ fontSize: 11, color: WF.t.muted, marginTop: 2 }}>30문항 · 공통+미적분</div>
                <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
                  <WF.Chip>고3</WF.Chip><WF.Chip>모의평가</WF.Chip>
                </div>
              </div>
            </div>
            <WF.Btn kind="ghost" size="sm" full>다른 시험지 선택</WF.Btn>

            <div style={{ fontSize: 11, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginTop: 28, marginBottom: 10 }}>2. 변형 강도</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                ["숫자만 바꾸기", "거의 동일", false],
                ["같은 유형·다른 문제", "변형 중", true],
                ["새 문제 (개념만 유지)", "변형 강함", false],
              ].map(([t, s, on], i) => (
                <div key={i} style={{
                  padding: 10, borderRadius: 6, display: "flex", justifyContent: "space-between",
                  border: `1px solid ${on ? WF.t.accent : WF.t.line}`,
                  background: on ? WF.t.accentSoft : "transparent",
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{t}</div>
                    <div style={{ fontSize: 10, color: WF.t.muted, marginTop: 1 }}>{s}</div>
                  </div>
                  <div style={{
                    width: 14, height: 14, borderRadius: "50%",
                    border: `2px solid ${on ? WF.t.accent : WF.t.line}`,
                    background: on ? "white" : "transparent",
                    boxShadow: on ? `inset 0 0 0 2px ${WF.t.accent}` : "none", marginTop: 2
                  }} />
                </div>
              ))}
            </div>
          </div>

          {/* Right: details */}
          <div style={{ padding: 24, overflow: "auto", background: WF.t.bg }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>3. 생성할 시험지 수</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
              {[1, 2, 3, 5].map(n => (
                <div key={n} style={{
                  width: 56, height: 56, borderRadius: 8,
                  background: n === 3 ? WF.t.accent : WF.t.surface,
                  color: n === 3 ? "white" : WF.t.ink,
                  border: `1px solid ${n === 3 ? WF.t.accent : WF.t.line}`,
                  display: "grid", placeItems: "center", fontSize: 18, fontWeight: 700
                }}>{n}</div>
              ))}
              <div style={{
                width: 80, height: 56, borderRadius: 8, background: WF.t.surface,
                border: `1px dashed ${WF.t.line}`, display: "grid", placeItems: "center",
                fontSize: 11, color: WF.t.muted
              }}>직접 입력</div>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 10 }}>4. 미리보기 (시험지 A · 1번)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {["A", "B", "C"].map((t, i) => (
                <div key={i} style={{
                  background: WF.t.surface, border: `1px solid ${i === 0 ? WF.t.accent : WF.t.line}`,
                  borderRadius: 6, padding: 10, position: "relative"
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, marginBottom: 6 }}>시험지 {t}</div>
                  <WF.Line h={4} /><div style={{ height: 4 }} /><WF.Line h={4} w="80%" /><div style={{ height: 4 }} /><WF.Line h={4} w="60%" />
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 2 }}>
                    {[1,2,3].map(j => <div key={j} style={{ display: "flex", gap: 4 }}><span style={{ fontSize: 8, color: WF.t.muted }}>{j}</span><WF.Line w={`${40 + j * 10}%`} h={3} /></div>)}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ padding: 12, background: WF.t.surface, borderRadius: 8, border: `1px solid ${WF.t.line2}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8 }}>옵션</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  ["문항 순서 섞기", true],
                  ["보기 순서 섞기", true],
                  ["풀이·해설 함께 생성", true],
                  ["배점 자동 재분배", false],
                ].map(([t, on], i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <div style={{
                      width: 28, height: 16, borderRadius: 8, background: on ? WF.t.accent : WF.t.line,
                      position: "relative"
                    }}>
                      <div style={{ position: "absolute", top: 2, left: on ? 14 : 2, width: 12, height: 12, borderRadius: "50%", background: "white" }} />
                    </div>
                    {t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "14px 24px", borderTop: `1px solid ${WF.t.line2}`, background: WF.t.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: WF.t.muted }}>3개 시험지 × 30문항 = <strong style={{ color: WF.t.ink }}>크레딧 90</strong> 사용</div>
          <div style={{ display: "flex", gap: 8 }}>
            <WF.Btn kind="ghost" size="md">취소</WF.Btn>
            <WF.Btn kind="primary" size="md" icon="✦">3개 시험지 만들기</WF.Btn>
          </div>
        </div>
      </div>
    </WF.Frame>
  );
};

Object.assign(window, { V4 });
