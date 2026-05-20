/* V2 — Stepper Wizard
   5단계 풀스크린 마법사. 한 번에 한 가지만 결정. 비-전문 사용자 친화. */

const V2 = {};

V2.StepUpload = () => {
  const { WF } = window;
  return (
    <WF.Frame width={1280} height={820} label="V2 · Step 1 업로드">
      <WF.AppBar right={<WF.Btn kind="ghost" size="sm">저장 후 종료</WF.Btn>} />

      <div style={{ padding: "24px 80px 16px", background: WF.t.surface, borderBottom: `1px solid ${WF.t.line2}` }}>
        <WF.Stepper steps={["업로드", "원본 확인", "변형 옵션", "문항 검토", "내보내기"]} current={0} />
      </div>

      <div style={{ padding: "48px 80px", display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>변환할 시험지를 올려주세요</div>
          <div style={{ fontSize: 13, color: WF.t.muted }}>PDF, 이미지, 한글파일 스캔 모두 지원합니다. AI가 자동으로 문제를 분리합니다.</div>
        </div>

        <div style={{
          width: "100%", maxWidth: 720, border: `2px dashed ${WF.t.accent}`,
          borderRadius: 16, padding: 48, background: WF.t.accentSoft + "60",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 16
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", background: "white",
            border: `2px solid ${WF.t.accent}`, display: "grid", placeItems: "center",
            fontSize: 28, color: WF.t.accent, fontWeight: 700
          }}>↑</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>파일을 여기로 끌어 놓거나 클릭하세요</div>
          <div style={{ fontSize: 12, color: WF.t.muted }}>또는 Ctrl+V로 붙여넣기</div>
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <WF.Btn kind="primary" size="lg" icon="📁">컴퓨터에서 선택</WF.Btn>
            <WF.Btn kind="secondary" size="lg" icon="📚">라이브러리</WF.Btn>
          </div>
        </div>

        <div style={{ marginTop: 32, width: "100%", maxWidth: 720 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: WF.t.ink2, marginBottom: 8 }}>이번에 업로드한 파일</div>
          <div style={{
            border: `1px solid ${WF.t.line}`, borderRadius: 8, padding: 14,
            background: WF.t.surface, display: "flex", alignItems: "center", gap: 14
          }}>
            <div style={{ width: 36, height: 44, background: WF.t.bg, border: `1px solid ${WF.t.line}`, borderRadius: 3, display: "grid", placeItems: "center", fontSize: 9, fontWeight: 700, color: WF.t.accent }}>PDF</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>2024학년도 6월 모의평가_수학.pdf</div>
              <div style={{ fontSize: 11, color: WF.t.muted, marginTop: 2 }}>8 페이지 · 2.4 MB · 업로드 완료</div>
              <div style={{ marginTop: 6, height: 4, background: WF.t.line2, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: "100%", height: "100%", background: WF.t.ok }} />
              </div>
            </div>
            <WF.Btn kind="ghost" size="sm">✕</WF.Btn>
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 80px",
        background: WF.t.surface, borderTop: `1px solid ${WF.t.line}`,
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <WF.Btn kind="ghost" size="lg">← 이전</WF.Btn>
        <div style={{ fontSize: 11, color: WF.t.muted }}>1 / 5 단계</div>
        <WF.Btn kind="primary" size="lg">다음: 원본 확인 →</WF.Btn>
      </div>
    </WF.Frame>
  );
};

V2.StepOptions = () => {
  const { WF } = window;
  return (
    <WF.Frame width={1280} height={820} label="V2 · Step 3 변형 옵션">
      <WF.AppBar right={<WF.Btn kind="ghost" size="sm">저장 후 종료</WF.Btn>} />

      <div style={{ padding: "24px 80px 16px", background: WF.t.surface, borderBottom: `1px solid ${WF.t.line2}` }}>
        <WF.Stepper steps={["업로드", "원본 확인", "변형 옵션", "문항 검토", "내보내기"]} current={2} />
      </div>

      <div style={{ padding: "32px 80px", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 32 }}>

        {/* Left: options */}
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>어떻게 변형할까요?</div>
          <div style={{ fontSize: 12, color: WF.t.muted, marginBottom: 24 }}>30개 문항 전체에 적용됩니다. 다음 단계에서 개별 조정 가능합니다.</div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>변환 목표</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { t: "디지털화만", d: "텍스트·수식으로 변환", on: false, ico: "Aa" },
                { t: "유사 문제 생성", d: "같은 개념 다른 문제", on: true, ico: "≈" },
                { t: "변형 시험지", d: "난이도 미세 조정", on: false, ico: "✦" },
                { t: "맞춤 보충", d: "단원별 약점 강화", on: false, ico: "◎" },
              ].map((o, i) => (
                <div key={i} style={{
                  padding: 14, borderRadius: 8,
                  border: `1px solid ${o.on ? WF.t.accent : WF.t.line}`,
                  background: o.on ? WF.t.accentSoft : WF.t.surface,
                  position: "relative"
                }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: o.on ? WF.t.accent : WF.t.ink2, marginBottom: 6 }}>{o.ico}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: o.on ? WF.t.accentInk : WF.t.ink }}>{o.t}</div>
                  <div style={{ fontSize: 11, color: WF.t.muted, marginTop: 2 }}>{o.d}</div>
                  {o.on && <div style={{ position: "absolute", top: 8, right: 8, width: 18, height: 18, borderRadius: "50%", background: WF.t.accent, color: "white", fontSize: 11, display: "grid", placeItems: "center" }}>✓</div>}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>난이도 조정</div>
            <div style={{ display: "flex", gap: 6 }}>
              {["원본 유지", "약간 쉽게", "약간 어렵게", "최상위권용"].map((t, i) => (
                <WF.Chip key={i} tone={i === 0 ? "accent" : "neutral"}>{t}</WF.Chip>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>함께 만들 자료</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["풀이·해설지", true],
                ["정답지 (분리 출력)", true],
                ["오답노트 템플릿", false],
                ["단원·유형 통계", true],
              ].map(([t, on], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", border: `1px solid ${WF.t.line2}`, borderRadius: 6 }}>
                  <div style={{
                    width: 32, height: 18, borderRadius: 10,
                    background: on ? WF.t.accent : WF.t.line,
                    position: "relative", flex: "0 0 32px"
                  }}>
                    <div style={{
                      position: "absolute", top: 2, left: on ? 16 : 2,
                      width: 14, height: 14, borderRadius: "50%", background: "white"
                    }} />
                  </div>
                  <div style={{ fontSize: 12 }}>{t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: preview */}
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

          <div style={{ marginTop: 24, padding: 16, background: WF.t.bg, borderRadius: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>예상 소요</div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: WF.t.muted }}>변환 시간</span>
              <span style={{ fontWeight: 600 }}>약 2분 30초</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: WF.t.muted }}>변환 문항</span>
              <span style={{ fontWeight: 600 }}>30개</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: WF.t.muted }}>크레딧 사용</span>
              <span style={{ fontWeight: 600, color: WF.t.accent }}>30 / 잔여 1,240</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 80px",
        background: WF.t.surface, borderTop: `1px solid ${WF.t.line}`,
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <WF.Btn kind="ghost" size="lg">← 원본 확인</WF.Btn>
        <div style={{ fontSize: 11, color: WF.t.muted }}>3 / 5 단계</div>
        <WF.Btn kind="primary" size="lg" icon="✦">변환 시작 →</WF.Btn>
      </div>
    </WF.Frame>
  );
};

Object.assign(window, { V2 });
