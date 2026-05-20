/* V3 — Side-by-Side
   원본 시험지 vs 변환 결과를 페이지 단위로 나란히. 동기 스크롤. 교사 검토용 최적. */

const V3 = {};

V3.Compare = () => {
  const { WF } = window;
  return (
    <WF.Frame width={1280} height={820} label="V3 · 원본 vs 변환">
      <WF.AppBar
        title="2024 6월 모의평가 · 변환 검토"
        right={<>
          <WF.Btn kind="ghost" size="sm">초안 저장</WF.Btn>
          <WF.Btn kind="secondary" size="sm" icon="↺">전체 재생성</WF.Btn>
          <WF.Btn kind="primary" size="sm" icon="↓">내보내기</WF.Btn>
        </>}
      />

      {/* Page navigator */}
      <div style={{
        height: 48, background: WF.t.surface, borderBottom: `1px solid ${WF.t.line2}`,
        display: "flex", alignItems: "center", padding: "0 16px", gap: 12
      }}>
        <WF.Btn kind="ghost" size="sm">◀</WF.Btn>
        <div style={{ display: "flex", gap: 4 }}>
          {[1,2,3,4,5,6,7,8].map(p => (
            <div key={p} style={{
              width: 38, height: 30, borderRadius: 4, display: "grid", placeItems: "center",
              fontSize: 11, fontWeight: 600, cursor: "default",
              background: p === 2 ? WF.t.accent : "transparent",
              color: p === 2 ? "white" : WF.t.ink2,
              border: p === 2 ? "none" : `1px solid ${WF.t.line2}`
            }}>p.{p}</div>
          ))}
        </div>
        <WF.Btn kind="ghost" size="sm">▶</WF.Btn>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <WF.Chip tone="ok">확정 6</WF.Chip>
            <WF.Chip tone="warn">검토 2</WF.Chip>
            <WF.Chip>총 8 / 페이지 2</WF.Chip>
          </div>
          <div style={{ width: 1, height: 24, background: WF.t.line2 }} />
          <div style={{ display: "flex", gap: 4 }}>
            <WF.Btn kind="secondary" size="sm">⇆ 동기 스크롤</WF.Btn>
            <WF.Btn kind="ghost" size="sm">⊞ 그리드</WF.Btn>
          </div>
        </div>
      </div>

      {/* Split */}
      <div style={{ display: "flex", height: "calc(100% - 104px)" }}>

        {/* LEFT — Original */}
        <div style={{ flex: 1, borderRight: `2px solid ${WF.t.line}`, background: WF.t.bg, overflow: "auto" }}>
          <div style={{ padding: "12px 20px", background: WF.t.surface, borderBottom: `1px solid ${WF.t.line2}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <WF.Chip>원본</WF.Chip>
              <div style={{ fontSize: 12, color: WF.t.muted }}>스캔 · 페이지 2</div>
            </div>
            <div style={{ fontSize: 11, color: WF.t.muted }}>100%</div>
          </div>
          <div style={{ padding: 24, display: "flex", justifyContent: "center" }}>
            <div style={{
              width: 380, background: "white", boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
              padding: 28, border: `1px solid ${WF.t.line}`
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ fontSize: 10, color: WF.t.muted }}>수학영역</div>
                <div style={{ fontSize: 10, color: WF.t.muted }}>2</div>
              </div>
              {[5, 6, 7, 8].map(n => (
                <div key={n} style={{ marginBottom: 18, position: "relative" }}>
                  {n === 6 && (
                    <div style={{ position: "absolute", top: -4, left: -16, width: 8, height: "calc(100% + 8px)", background: WF.t.accent, borderRadius: 2 }} />
                  )}
                  <div style={{ display: "flex", gap: 6, marginBottom: 4, alignItems: "baseline" }}>
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{n}.</div>
                    <WF.Line h={6} w="90%" />
                  </div>
                  <WF.Para lines={2} last="70%" style={{ marginLeft: 14 }} />
                  {n === 6 && <div style={{ height: 50, marginTop: 6, marginLeft: 14, background: WF.t.bg, border: `1px dashed ${WF.t.line}`, borderRadius: 3 }} />}
                  <div style={{ marginTop: 6, marginLeft: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[1,2,3,4,5].map(i => <div key={i} style={{ fontSize: 9, color: WF.t.muted }}>{`(${i})`} <span style={{ display: "inline-block", width: 30, height: 4, background: WF.t.line2, verticalAlign: "middle", borderRadius: 2 }} /></div>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT — Converted */}
        <div style={{ flex: 1, background: WF.t.bg, overflow: "auto" }}>
          <div style={{ padding: "12px 20px", background: WF.t.surface, borderBottom: `1px solid ${WF.t.line2}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <WF.Chip tone="accent">변환 결과</WF.Chip>
              <div style={{ fontSize: 12, color: WF.t.muted }}>유사 문제 · 변형 강도 보통</div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <WF.Btn kind="ghost" size="sm">↺ 페이지 재생성</WF.Btn>
            </div>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {[5, 6, 7, 8].map(n => {
              const isFocus = n === 6;
              return (
                <div key={n} style={{
                  background: WF.t.surface, border: `1px solid ${isFocus ? WF.t.accent : WF.t.line}`,
                  borderRadius: 8, padding: 14, position: "relative",
                  boxShadow: isFocus ? `0 0 0 3px ${WF.t.accentSoft}` : "none"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 22, height: 22, borderRadius: 4, background: WF.t.ink, color: "white", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{n}</div>
                      <WF.Chip tone={n === 6 ? "warn" : "ok"}>{n === 6 ? "검토 필요" : "확정"}</WF.Chip>
                      <WF.Chip>합성함수</WF.Chip>
                    </div>
                    <div style={{ display: "flex", gap: 4 }}>
                      <WF.Btn kind="ghost" size="sm">↺</WF.Btn>
                      <WF.Btn kind="ghost" size="sm">✎</WF.Btn>
                      <WF.Btn kind="ghost" size="sm">⋯</WF.Btn>
                    </div>
                  </div>
                  <WF.Para lines={2} last="80%" />
                  {n === 6 && (
                    <>
                      <div style={{ height: 60, marginTop: 8, background: WF.t.bg, border: `1px dashed ${WF.t.line}`, borderRadius: 4, display: "grid", placeItems: "center", fontSize: 10, color: WF.t.muted }}>그래프 · 자동 생성</div>
                      <div style={{ marginTop: 8, padding: 8, background: WF.t.warnSoft, borderRadius: 4, fontSize: 11, color: WF.t.warn, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>⚠ 원본과 정의역이 다름 · 확인 필요</span>
                        <span style={{ fontWeight: 600 }}>차이 보기 →</span>
                      </div>
                    </>
                  )}
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                    {[1,2,3,4,5].map(i => (
                      <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <div style={{ width: 12, height: 12, borderRadius: "50%", border: `1px solid ${WF.t.line}`, fontSize: 8, color: WF.t.muted, display: "grid", placeItems: "center", flex: "0 0 12px" }}>{i}</div>
                        <WF.Line w={`${45 + (i * 9) % 30}%`} h={5} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </WF.Frame>
  );
};

V3.Diff = () => {
  const { WF } = window;
  return (
    <WF.Frame width={1280} height={820} label="V3 · 단일 문항 변경점 비교">
      <WF.AppBar title="6번 문항 · 변경점 검토" right={<WF.Btn kind="ghost" size="sm">✕ 닫기</WF.Btn>} />

      <div style={{ padding: 24, height: "calc(100% - 56px)", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <WF.Btn kind="ghost" size="md">← 이전 문항</WF.Btn>
            <div style={{ fontSize: 14, fontWeight: 700 }}>6 / 30</div>
            <WF.Btn kind="ghost" size="md">다음 문항 →</WF.Btn>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <WF.Btn kind="secondary" size="md" icon="↺">다시 생성</WF.Btn>
            <WF.Btn kind="secondary" size="md" icon="✎">직접 편집</WF.Btn>
            <WF.Btn kind="soft" size="md" icon="✓">이대로 확정</WF.Btn>
          </div>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, minHeight: 0 }}>
          {/* Original */}
          <div style={{ background: WF.t.surface, border: `1px solid ${WF.t.line}`, borderRadius: 10, padding: 20, overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <WF.Chip>원본 · 2024 6모 6번</WF.Chip>
              <div style={{ fontSize: 11, color: WF.t.muted }}>3점</div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <p>함수 <span style={{ background: WF.t.warnSoft, padding: "1px 4px" }}>f(x) = x² − 4x + 3</span>에 대하여…</p>
              <WF.Para lines={3} last="70%" style={{ marginTop: 10 }} />
              <div style={{ marginTop: 14, height: 100, background: WF.t.bg, border: `1px dashed ${WF.t.line}`, borderRadius: 4, display: "grid", placeItems: "center", fontSize: 10, color: WF.t.muted }}>함수 그래프</div>
              <WF.Para lines={5} last="40%" style={{ marginTop: 14 }} />
            </div>
          </div>
          {/* New */}
          <div style={{ background: WF.t.surface, border: `2px solid ${WF.t.accent}`, borderRadius: 10, padding: 20, overflow: "auto", boxShadow: `0 4px 12px ${WF.t.accentSoft}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
              <WF.Chip tone="accent">변환 결과</WF.Chip>
              <div style={{ fontSize: 11, color: WF.t.muted }}>3점 · 합성함수</div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <p>함수 <span style={{ background: WF.t.okSoft, padding: "1px 4px", color: WF.t.ok, fontWeight: 600 }}>g(x) = 2x² − 6x + 1</span>에 대하여…</p>
              <WF.Para lines={3} last="70%" style={{ marginTop: 10 }} />
              <div style={{ marginTop: 14, height: 100, background: WF.t.bg, border: `1px dashed ${WF.t.accent}`, borderRadius: 4, display: "grid", placeItems: "center", fontSize: 10, color: WF.t.accentInk }}>그래프 · 새로 생성</div>
              <WF.Para lines={5} last="40%" style={{ marginTop: 14 }} />
            </div>
          </div>
        </div>

        <div style={{ background: WF.t.surface, border: `1px solid ${WF.t.line}`, borderRadius: 8, padding: 14, display: "flex", gap: 24 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: WF.t.muted, marginBottom: 4 }}>변경 요약</div>
            <div style={{ fontSize: 12 }}>함수 f → g, 계수·상수항 재구성, 그래프 자동 재생성. 풀이 흐름 동일.</div>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            <div><div style={{ fontSize: 10, color: WF.t.muted }}>난이도</div><div style={{ fontSize: 12, fontWeight: 600 }}>중상 → 중상</div></div>
            <div><div style={{ fontSize: 10, color: WF.t.muted }}>핵심 개념</div><div style={{ fontSize: 12, fontWeight: 600 }}>이차함수 그래프</div></div>
            <div><div style={{ fontSize: 10, color: WF.t.muted }}>예상 정답률</div><div style={{ fontSize: 12, fontWeight: 600 }}>62%</div></div>
          </div>
        </div>
      </div>
    </WF.Frame>
  );
};

Object.assign(window, { V3 });
