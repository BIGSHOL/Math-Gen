/* V5 — Card Stream
   문제 카드 세로 스트림. 각 카드마다 인라인 컨트롤. 노션·피그마 코멘트 같은 협업 느낌. */

const V5 = {};

V5.Stream = () => {
  const { WF } = window;
  return (
    <WF.Frame width={1280} height={900} label="V5 · 문제 카드 스트림">
      <WF.AppBar
        title="2024 6월 모의평가 변형 · 작업 중"
        right={<>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: WF.t.muted, marginRight: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: WF.t.ok }} />
            자동 저장됨 · 방금
          </div>
          <WF.Btn kind="secondary" size="sm" icon="👥">공유</WF.Btn>
          <WF.Btn kind="primary" size="sm" icon="↓">내보내기</WF.Btn>
        </>}
      />

      {/* Sticky toolbar */}
      <div style={{
        height: 56, background: WF.t.surface, borderBottom: `1px solid ${WF.t.line2}`,
        padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 12, color: WF.t.muted }}>전체 30 · 확정 24 · 검토 3 · 미생성 3</div>
          <div style={{ width: 1, height: 20, background: WF.t.line }} />
          <WF.Btn kind="ghost" size="sm">⌕ 문항 검색</WF.Btn>
          <WF.Btn kind="ghost" size="sm">⌂ 단원 점프</WF.Btn>
          <WF.Btn kind="ghost" size="sm">⥃ 일괄 재생성</WF.Btn>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {["전체", "검토 필요", "도형 포함"].map((t, i) => (
              <WF.Chip key={i} tone={i === 1 ? "warn" : "neutral"}>{t}</WF.Chip>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100% - 112px)" }}>

        {/* Mini-map / table of contents */}
        <div style={{ width: 200, borderRight: `1px solid ${WF.t.line2}`, background: WF.t.surface, padding: 14, overflow: "auto" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 8 }}>문항 인덱스</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 16 }}>
            {Array.from({ length: 30 }).map((_, i) => {
              const n = i + 1;
              const focus = n === 6;
              const status = n === 6 || n === 11 || n === 22 ? "warn" : n === 28 || n === 29 || n === 30 ? "neutral" : "ok";
              const cmap = { ok: WF.t.ok, warn: WF.t.warn, neutral: WF.t.line2 };
              return (
                <div key={n} style={{
                  height: 28, borderRadius: 4, display: "grid", placeItems: "center",
                  fontSize: 10, fontWeight: 700,
                  background: focus ? WF.t.accent : status === "neutral" ? WF.t.line2 : "white",
                  color: focus ? "white" : status === "warn" ? WF.t.warn : WF.t.ink2,
                  border: focus ? "none" : `1px solid ${status === "ok" ? cmap.ok + "55" : status === "warn" ? cmap.warn + "55" : WF.t.line}`,
                }}>{n}</div>
              );
            })}
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 8 }}>단원</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[
              ["다항식", 4], ["방정식·부등식", 5], ["도형의 방정식", 4],
              ["함수와 그래프", 6], ["수열·미적분", 8], ["통계", 3]
            ].map(([t, n], i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0" }}>
                <span style={{ color: WF.t.ink2 }}>{t}</span>
                <span style={{ color: WF.t.muted }}>{n}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stream */}
        <div style={{ flex: 1, overflow: "auto", padding: "24px 32px", background: WF.t.bg }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 820, margin: "0 auto" }}>

            {/* Section header */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
              <div style={{ width: 4, height: 18, background: WF.t.accent, borderRadius: 2 }} />
              <div style={{ fontSize: 14, fontWeight: 700 }}>함수와 그래프</div>
              <div style={{ fontSize: 11, color: WF.t.muted }}>문항 5–10 · 6개</div>
              <div style={{ flex: 1, height: 1, background: WF.t.line2, marginLeft: 6 }} />
              <WF.Chip>확정 4</WF.Chip><WF.Chip tone="warn">검토 1</WF.Chip>
            </div>

            {/* Card — confirmed */}
            <div style={{ background: WF.t.surface, borderRadius: 10, border: `1px solid ${WF.t.line}`, overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${WF.t.line2}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: WF.t.ink, color: "white", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>5</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>이차함수 평행이동</div>
                    <div style={{ fontSize: 10, color: WF.t.muted }}>중 · 3점 · 객관식</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <WF.Chip tone="ok">확정</WF.Chip>
                  <WF.Btn kind="ghost" size="sm">↺</WF.Btn>
                  <WF.Btn kind="ghost" size="sm">✎</WF.Btn>
                  <WF.Btn kind="ghost" size="sm">⋯</WF.Btn>
                </div>
              </div>
              <div style={{ padding: 18 }}>
                <WF.Para lines={2} last="75%" />
                <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <div style={{ width: 14, height: 14, borderRadius: "50%", border: `1px solid ${WF.t.line}`, fontSize: 9, color: WF.t.muted, display: "grid", placeItems: "center", flex: "0 0 14px" }}>{i}</div>
                      <WF.Line w="80%" h={5} />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Card — needs review (expanded) */}
            <div style={{ background: WF.t.surface, borderRadius: 10, border: `2px solid ${WF.t.warn}`, overflow: "hidden", boxShadow: "0 4px 14px rgba(217,119,6,0.12)" }}>
              <div style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${WF.t.line2}`, background: WF.t.warnSoft + "60" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: WF.t.warn, color: "white", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700 }}>6</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>합성함수 · 정의역 불일치</div>
                    <div style={{ fontSize: 10, color: WF.t.warn, fontWeight: 600 }}>⚠ 원본 vs 변환 정의역이 다름</div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <WF.Btn kind="secondary" size="sm" icon="↺">다시 생성</WF.Btn>
                  <WF.Btn kind="secondary" size="sm" icon="◧◨">원본과 비교</WF.Btn>
                  <WF.Btn kind="soft" size="sm" icon="✓">확정</WF.Btn>
                </div>
              </div>
              <div style={{ padding: 18 }}>
                <WF.Para lines={2} last="60%" />
                <div style={{ marginTop: 12, height: 100, background: WF.t.bg, border: `1px dashed ${WF.t.line}`, borderRadius: 6, display: "grid", placeItems: "center", fontSize: 10, color: WF.t.muted }}>합성함수 그래프</div>
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                  {[1,2,3,4,5].map(i => (
                    <div key={i} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <div style={{ width: 14, height: 14, borderRadius: "50%", border: `1px solid ${WF.t.line}`, fontSize: 9, color: WF.t.muted, display: "grid", placeItems: "center", flex: "0 0 14px" }}>{i}</div>
                      <WF.Line w="80%" h={5} />
                    </div>
                  ))}
                </div>

                {/* Inline tabs */}
                <div style={{ marginTop: 16, borderTop: `1px solid ${WF.t.line2}`, paddingTop: 12 }}>
                  <div style={{ display: "flex", gap: 4, marginBottom: 10 }}>
                    {["풀이", "해설", "원본", "변경 이력", "메모"].map((t, i) => (
                      <div key={i} style={{
                        padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 4,
                        background: i === 1 ? WF.t.accentSoft : "transparent",
                        color: i === 1 ? WF.t.accentInk : WF.t.muted
                      }}>{t}</div>
                    ))}
                  </div>
                  <WF.Para lines={3} last="50%" />
                </div>

                {/* Comment thread */}
                <div style={{ marginTop: 14, padding: 12, background: WF.t.bg, borderRadius: 6 }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: WF.t.accent, color: "white", fontSize: 10, display: "grid", placeItems: "center" }}>박</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11 }}><strong>박선생</strong> <span style={{ color: WF.t.muted }}>· 5분 전</span></div>
                      <div style={{ fontSize: 12, marginTop: 2 }}>그래프 좀 더 명확하게 그려주세요 — y축 단위 표시</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card — collapsed */}
            <div style={{ background: WF.t.surface, borderRadius: 10, border: `1px solid ${WF.t.line}`, padding: "10px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: 4, background: WF.t.line2, color: WF.t.ink2, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>7</div>
                <div style={{ fontSize: 12, color: WF.t.muted }}>로그함수 · 대소 비교</div>
                <WF.Chip tone="ok">확정</WF.Chip>
                <WF.Chip>중상 · 4점</WF.Chip>
              </div>
              <WF.Btn kind="ghost" size="sm">펼치기 ▾</WF.Btn>
            </div>

            <div style={{ background: WF.t.surface, borderRadius: 10, border: `1px solid ${WF.t.line}`, padding: "10px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 22, height: 22, borderRadius: 4, background: WF.t.line2, color: WF.t.ink2, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>8</div>
                <div style={{ fontSize: 12, color: WF.t.muted }}>지수함수 · 점근선</div>
                <WF.Chip tone="ok">확정</WF.Chip>
              </div>
              <WF.Btn kind="ghost" size="sm">펼치기 ▾</WF.Btn>
            </div>

            {/* Empty / pending */}
            <div style={{ background: "transparent", borderRadius: 10, border: `2px dashed ${WF.t.line}`, padding: 24, textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: WF.t.muted }}>9번 — 생성 대기 중</div>
              <WF.Btn kind="ghost" size="sm" style={{ marginTop: 8 }}>이 위치에 문항 만들기 +</WF.Btn>
            </div>
          </div>
        </div>

      </div>
    </WF.Frame>
  );
};

Object.assign(window, { V5 });
