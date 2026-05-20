/* V1 — Classic Workbench
   기존 Math-Gen 사이드바 패턴을 계승하되, 좌측 패널을 '기출지 업로드 + 변환 옵션'으로 재구성.
   우측은 변환된 문제 스트림. 한 화면에서 모든 작업. */

const V1 = {};

V1.Upload = () => {
  const { WF } = window;
  return (
    <WF.Frame width={1280} height={820} label="V1 · 업로드 시작">
      <WF.AppBar
        tabs={["기출지 변환", "단원별 생성", "내 라이브러리"]}
        current="기출지 변환"
        right={<WF.Btn kind="ghost" size="sm">도움말</WF.Btn>}
      />
      <div style={{ display: "flex", height: "calc(100% - 56px)" }}>

        {/* LEFT — Settings */}
        <div style={{ width: 320, borderRight: `1px solid ${WF.t.line}`, background: WF.t.surface, overflow: "auto" }}>
          <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: WF.t.muted, marginBottom: 10 }}>01. 시험지 정보</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <WF.Input label="시험지 이름" value="2024학년도 6월 모의평가 수학" />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <WF.Select label="학년" value="고3" />
                  <WF.Select label="과목" value="공통수학" />
                </div>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: WF.t.muted, marginBottom: 10 }}>02. 변환 방식</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  { t: "원문 그대로 (OCR)", d: "수식·도형 디지털화", on: false },
                  { t: "유사 문제로 재생성", d: "전체 문항 변형", on: true },
                  { t: "변형 시험지 클론", d: "난이도·유형 미세 조정", on: false },
                ].map((o, i) => (
                  <div key={i} style={{
                    padding: 10, borderRadius: 6, display: "flex", gap: 10,
                    border: `1px solid ${o.on ? WF.t.accent : WF.t.line}`,
                    background: o.on ? WF.t.accentSoft : WF.t.surface,
                  }}>
                    <div style={{
                      width: 14, height: 14, borderRadius: "50%", marginTop: 2,
                      border: `2px solid ${o.on ? WF.t.accent : WF.t.line}`,
                      background: o.on ? WF.t.accent : "transparent",
                      boxShadow: o.on ? `inset 0 0 0 2px white` : "none", flex: "0 0 14px"
                    }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: o.on ? WF.t.accentInk : WF.t.ink }}>{o.t}</div>
                      <div style={{ fontSize: 11, color: WF.t.muted, marginTop: 1 }}>{o.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: WF.t.muted, marginBottom: 10 }}>03. 변형 강도</div>
              <div style={{ height: 28, position: "relative", padding: "0 4px" }}>
                <div style={{ position: "absolute", top: 13, left: 4, right: 4, height: 3, background: WF.t.line2, borderRadius: 2 }} />
                <div style={{ position: "absolute", top: 13, left: 4, width: "55%", height: 3, background: WF.t.accent, borderRadius: 2 }} />
                <div style={{ position: "absolute", top: 7, left: "calc(55% - 6px)", width: 16, height: 16, borderRadius: "50%", background: "white", border: `2px solid ${WF.t.accent}` }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: WF.t.muted, marginTop: 2 }}>
                <span>거의 동일</span><span>완전히 새로움</span>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, color: WF.t.muted, marginBottom: 10 }}>04. 추가 작업</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {["풀이·해설 자동 생성", "단원/유형 자동 분류", "배점 자동 재분배"].map((t, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: 4,
                      background: i < 2 ? WF.t.accent : WF.t.surface,
                      border: `1px solid ${i < 2 ? WF.t.accent : WF.t.line}`,
                      display: "grid", placeItems: "center", color: "white", fontSize: 10
                    }}>{i < 2 ? "✓" : ""}</div>
                    {t}
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* RIGHT — Upload zone */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${WF.t.line2}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>기출지 업로드</div>
              <div style={{ fontSize: 11, color: WF.t.muted, marginTop: 2 }}>PDF·이미지·HWP 스캔 지원 · 최대 50페이지</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <WF.Btn kind="ghost" size="md" icon="📁">라이브러리에서 선택</WF.Btn>
              <WF.Btn kind="primary" size="md" icon="↑">파일 추가</WF.Btn>
            </div>
          </div>

          <div style={{ flex: 1, padding: 24, display: "flex", flexDirection: "column", gap: 16, overflow: "auto" }}>
            {/* Big drop zone */}
            <div style={{
              border: `2px dashed ${WF.t.line}`, borderRadius: 12,
              padding: 40, background: WF.t.surface, display: "flex",
              alignItems: "center", justifyContent: "center", gap: 32, minHeight: 200
            }}>
              <div style={{
                width: 90, height: 110, border: `2px solid ${WF.t.line}`, borderRadius: 6,
                background: WF.t.bg, position: "relative", display: "grid", placeItems: "center"
              }}>
                <div style={{ position: "absolute", inset: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  <WF.Line h={4} /><WF.Line h={4} w="80%" /><WF.Line h={4} /><WF.Line h={4} w="60%" />
                  <div style={{ flex: 1 }} />
                  <WF.Line h={4} /><WF.Line h={4} w="70%" />
                </div>
                <div style={{ position: "absolute", bottom: -8, right: -8, background: WF.t.accent, color: "white", padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 700 }}>PDF</div>
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>여기에 시험지를 끌어 놓으세요</div>
                <div style={{ fontSize: 12, color: WF.t.muted, marginBottom: 12 }}>또는 <span style={{ color: WF.t.accent, fontWeight: 600 }}>파일 선택</span> · Ctrl+V 붙여넣기</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <WF.Chip>PDF</WF.Chip><WF.Chip>JPG/PNG</WF.Chip><WF.Chip>HWP 스캔</WF.Chip><WF.Chip>여러 페이지 일괄</WF.Chip>
                </div>
              </div>
            </div>

            {/* Recently used */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: WF.t.ink2, marginBottom: 10 }}>최근 사용한 시험지</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                {[
                  ["2024 6모", "30문항 · 변환 완료"],
                  ["2023 수능", "30문항 · 검토 중"],
                  ["3월 학평", "30문항 · 변환 완료"],
                  ["내신 모의", "25문항 · 초안"],
                ].map(([t, s], i) => (
                  <WF.Box key={i} pad={12} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ height: 80, background: WF.t.bg, borderRadius: 4, position: "relative" }}>
                      <div style={{ position: "absolute", inset: 10, display: "flex", flexDirection: "column", gap: 3 }}>
                        <WF.Line h={3} /><WF.Line h={3} w="80%" /><WF.Line h={3} /><WF.Line h={3} w="65%" />
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{t}</div>
                      <div style={{ fontSize: 10, color: WF.t.muted, marginTop: 2 }}>{s}</div>
                    </div>
                  </WF.Box>
                ))}
              </div>
            </div>
          </div>

          <div style={{ padding: "12px 24px", borderTop: `1px solid ${WF.t.line2}`, background: WF.t.surface, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: WF.t.muted }}>파일을 추가하면 자동으로 페이지 분리 → OCR → 변환 진행</div>
            <WF.Btn kind="primary" size="lg" icon="✦">변환 시작</WF.Btn>
          </div>
        </div>
      </div>
    </WF.Frame>
  );
};

V1.Result = () => {
  const { WF } = window;
  return (
    <WF.Frame width={1280} height={820} label="V1 · 변환 결과">
      <WF.AppBar tabs={["기출지 변환", "단원별 생성", "내 라이브러리"]} current="기출지 변환" />
      <div style={{ display: "flex", height: "calc(100% - 56px)" }}>

        {/* LEFT — Progress + filters */}
        <div style={{ width: 280, borderRight: `1px solid ${WF.t.line}`, background: WF.t.surface, overflow: "auto" }}>
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>2024 6월 모의평가</div>
            <div style={{ fontSize: 10, color: WF.t.muted, marginBottom: 14 }}>30개 문항 · 유사 문제 모드</div>

            <div style={{ background: WF.t.okSoft, color: WF.t.ok, padding: 10, borderRadius: 6, fontSize: 11, fontWeight: 600, marginBottom: 16 }}>
              ✓ 변환 완료 · 2분 12초
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 8 }}>페이지</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 18 }}>
              {[1,2,3,4,5,6,7,8].map(p => (
                <div key={p} style={{
                  height: 60, border: `1px solid ${p === 2 ? WF.t.accent : WF.t.line}`,
                  borderRadius: 4, background: p === 2 ? WF.t.accentSoft : WF.t.bg,
                  display: "grid", placeItems: "center", fontSize: 10, fontWeight: 600,
                  color: p === 2 ? WF.t.accentInk : WF.t.ink2
                }}>p.{p}</div>
              ))}
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: WF.t.muted, letterSpacing: 0.5, marginBottom: 8 }}>필터</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["단원", "전체", true],
                ["난이도", "중·상", false],
                ["상태", "검토 필요 (3)", false],
              ].map(([l, v, focus], i) => (
                <div key={i} style={{
                  padding: "8px 10px", border: `1px solid ${WF.t.line}`, borderRadius: 6,
                  display: "flex", justifyContent: "space-between", fontSize: 11
                }}>
                  <span style={{ color: WF.t.muted }}>{l}</span>
                  <span style={{ fontWeight: 600 }}>{v} ▾</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* CENTER — Problem stream */}
        <div style={{ flex: 1, overflow: "auto", padding: 24, background: WF.t.bg }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <WF.Btn kind="secondary" size="sm" icon="◧◨">2열</WF.Btn>
              <WF.Btn kind="ghost" size="sm">전체 펼치기</WF.Btn>
              <div style={{ fontSize: 12, color: WF.t.muted, marginLeft: 8 }}>3 / 30 검토 필요</div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <WF.Btn kind="secondary" size="md" icon="↺">전체 재생성</WF.Btn>
              <WF.Btn kind="primary" size="md" icon="↓">내보내기</WF.Btn>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <WF.ProblemMock num={1} dense status={{ tone: "ok", text: "확정" }} />
            <WF.ProblemMock num={2} dense status={{ tone: "warn", text: "검토 필요" }} hasFigure />
            <WF.ProblemMock num={3} dense status={{ tone: "ok", text: "확정" }} />
            <WF.ProblemMock num={4} dense status={{ tone: "ok", text: "확정" }} choices={false} />
          </div>
        </div>

        {/* RIGHT — Detail */}
        <div style={{ width: 320, borderLeft: `1px solid ${WF.t.line}`, background: WF.t.surface, overflow: "auto" }}>
          <div style={{ padding: 18 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>2번 문항 · 검토</div>
              <WF.Btn kind="ghost" size="sm">✕</WF.Btn>
            </div>
            <div style={{ display: "flex", gap: 4, marginBottom: 14, borderBottom: `1px solid ${WF.t.line2}` }}>
              {["문제", "해설", "원본"].map((t, i) => (
                <div key={i} style={{
                  padding: "6px 10px", fontSize: 12, fontWeight: 600,
                  color: i === 0 ? WF.t.accentInk : WF.t.muted,
                  borderBottom: i === 0 ? `2px solid ${WF.t.accent}` : "none"
                }}>{t}</div>
              ))}
            </div>

            <div style={{ fontSize: 11, color: WF.t.muted, marginBottom: 6 }}>변경된 부분</div>
            <div style={{ border: `1px solid ${WF.t.line}`, borderRadius: 6, padding: 12, marginBottom: 12 }}>
              <WF.Para lines={4} last="40%" />
              <div style={{ marginTop: 8, padding: 8, background: WF.t.warnSoft, borderRadius: 4, fontSize: 10, color: WF.t.warn }}>
                ⚠ 함수 f(x)의 정의역이 원본과 다름
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
              <WF.Btn kind="secondary" size="sm" icon="↺">재생성</WF.Btn>
              <WF.Btn kind="secondary" size="sm" icon="✎">직접 수정</WF.Btn>
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, color: WF.t.muted, marginBottom: 6 }}>메타데이터</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[["단원", "함수와 그래프"], ["유형", "합성함수"], ["난이도", "중상"], ["배점", "3점"]].map(([k, v], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                  <span style={{ color: WF.t.muted }}>{k}</span>
                  <span style={{ fontWeight: 600 }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 16, padding: 10, background: WF.t.bg, borderRadius: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 6 }}>원본 문제</div>
              <div style={{ height: 80, background: WF.t.surface, border: `1px dashed ${WF.t.line}`, borderRadius: 4, display: "grid", placeItems: "center", fontSize: 10, color: WF.t.muted }}>스캔 이미지</div>
            </div>
          </div>
        </div>

      </div>
    </WF.Frame>
  );
};

Object.assign(window, { V1 });
