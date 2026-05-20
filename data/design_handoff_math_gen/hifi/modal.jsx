/* Hi-fi NewVariant Modal — 변형 시험지 만들기. */

function NewVariantModalHF({ ctx }) {
  const test = ctx.selectedTest;
  const [intensity, setIntensity] = React.useState(1);
  const [count, setCount] = React.useState(3);
  const [opts, setOpts] = React.useState({
    shuffleProblems: true, shuffleChoices: true, withSolutions: true, redistPoints: false
  });

  const intensities = [
    { id: 0, t: "숫자만 바꾸기", d: "거의 동일", ico: "hash" },
    { id: 1, t: "같은 유형·다른 문제", d: "변형 중", ico: "shuffle" },
    { id: 2, t: "새 문제", d: "개념만 유지", ico: "magic-wand" },
  ];

  return (
    <div style={{
      width: 980, maxWidth: "94vw", height: 660, maxHeight: "90vh",
      background: HF.c.surface, borderRadius: HF.r.r5, overflow: "hidden",
      display: "flex", flexDirection: "column",
      boxShadow: HF.sh.s4,
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 22px", borderBottom: `1px solid ${HF.c.line}`,
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 32, height: 32, borderRadius: HF.r.r2,
            background: `linear-gradient(135deg, ${HF.c.accent}, ${HF.c.accentDark})`,
            color: "white", display: "grid", placeItems: "center",
            boxShadow: HF.sh.s2,
          }}>
            <Ico name="sparkle" size={16} weight="fill" />
          </div>
          <div>
            <div style={{ ...applyType("h2"), color: HF.c.text }}>변형 시험지 만들기</div>
            <div style={{ ...applyType("small"), color: HF.c.muted, marginTop: 1 }}>원본 1개 → 변형 {count}개 일괄 생성</div>
          </div>
        </div>
        <Btn kind="ghost" size="sm" icon="x" onClick={ctx.closeModal}></Btn>
      </div>

      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1.3fr", overflow: "hidden" }}>
        {/* Left */}
        <div style={{ padding: 22, borderRight: `1px solid ${HF.c.line}`, overflow: "auto" }}>
          <Eyebrow style={{ marginBottom: 10 }}>① 원본 선택</Eyebrow>
          <Card pad={12} style={{ display: "flex", gap: 12, marginBottom: 10 }}>
            <div style={{
              width: 52, height: 64, background: HF.c.surface2,
              borderRadius: HF.r.r1, display: "grid", placeItems: "center",
              border: `1px solid ${HF.c.line}`, flexShrink: 0,
            }}>
              <Ico name="file-pdf" size={22} color={HF.c.accent} weight="duotone" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...applyType("h3"), color: HF.c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {test?.title || "2024 6월 모의평가"}
              </div>
              <div style={{ ...applyType("small"), color: HF.c.muted, marginTop: 2 }}>
                {test?.count || 30}문항 · {test?.subject || "공통+미적분"}
              </div>
              <div style={{ marginTop: 6, display: "flex", gap: 4 }}>
                {(test?.tags || ["고3"]).slice(0, 3).map(t => <Chip key={t} size="sm">{t}</Chip>)}
              </div>
            </div>
          </Card>
          <Btn kind="ghost" size="sm" full icon="arrows-left-right">다른 시험지 선택</Btn>

          <Eyebrow style={{ marginTop: 24, marginBottom: 10 }}>② 변형 강도</Eyebrow>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {intensities.map(o => {
              const on = o.id === intensity;
              return (
                <div key={o.id} onClick={() => setIntensity(o.id)} style={{
                  padding: 12, borderRadius: HF.r.r2,
                  display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
                  border: `1px solid ${on ? HF.c.accent : HF.c.line}`,
                  background: on ? HF.c.accentSoft : HF.c.surface,
                  boxShadow: on ? HF.sh.accentGlow : "none",
                  transition: "all 140ms",
                }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: HF.r.r1,
                    background: on ? "white" : HF.c.surface2,
                    color: on ? HF.c.accent : HF.c.muted,
                    display: "grid", placeItems: "center",
                  }}>
                    <Ico name={o.ico} size={16} weight={on ? "fill" : "regular"} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ ...applyType("body"), color: HF.c.text, fontWeight: 550 }}>{o.t}</div>
                    <div style={{ ...applyType("caption"), color: HF.c.muted, marginTop: 1 }}>{o.d}</div>
                  </div>
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%",
                    border: `2px solid ${on ? HF.c.accent : HF.c.lineStrong}`,
                    background: on ? "white" : "transparent",
                    boxShadow: on ? `inset 0 0 0 3px ${HF.c.accent}` : "none",
                    transition: "all 140ms",
                  }} />
                </div>
              );
            })}
          </div>

          <Eyebrow style={{ marginTop: 24, marginBottom: 10 }}>③ 난이도 조정</Eyebrow>
          <Segmented value="keep" onChange={() => {}} options={[
            { value: "easy", label: "쉽게" },
            { value: "keep", label: "유지" },
            { value: "hard", label: "어렵게" },
          ]} size="md" full />
        </div>

        {/* Right */}
        <div style={{ padding: 22, overflow: "auto", background: HF.c.bg }}>
          <Eyebrow style={{ marginBottom: 10 }}>④ 생성할 시험지 수</Eyebrow>
          <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
            {[1, 2, 3, 5].map(n => {
              const on = n === count;
              return (
                <div key={n} onClick={() => setCount(n)} style={{
                  width: 60, height: 60, borderRadius: HF.r.r2,
                  background: on ? HF.c.accent : "white",
                  color: on ? "white" : HF.c.text,
                  border: `1px solid ${on ? HF.c.accent : HF.c.lineStrong}`,
                  boxShadow: on ? HF.sh.s2 : HF.sh.s1,
                  display: "grid", placeItems: "center",
                  fontSize: 22, fontWeight: 700, fontFamily: HF.t.mono.family,
                  cursor: "pointer", transition: "all 140ms",
                }}>{n}</div>
              );
            })}
            <div style={{
              padding: "0 14px", height: 60, borderRadius: HF.r.r2,
              background: "white",
              border: `1px dashed ${HF.c.lineStrong}`,
              display: "grid", placeItems: "center",
              ...applyType("small"), color: HF.c.muted, cursor: "pointer",
            }}>직접 입력</div>
          </div>

          <Eyebrow style={{ marginBottom: 10 }}>⑤ 미리보기 (시험지 A · 1번 문항)</Eyebrow>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(count, 3)}, 1fr)`, gap: 10, marginBottom: 18 }}>
            {Array.from({ length: Math.min(count, 3) }).map((_, i) => {
              const t = String.fromCharCode(65 + i);
              return (
                <div key={i} style={{
                  background: "white", border: `1.5px solid ${i === 0 ? HF.c.accent : HF.c.line}`,
                  borderRadius: HF.r.r2, padding: 12,
                  boxShadow: i === 0 ? HF.sh.s2 : HF.sh.s1,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ ...applyType("micro"), color: HF.c.muted }}>시험지 {t}</span>
                    {i === 0 && <Chip tone="accent" size="sm" dot>현재</Chip>}
                  </div>
                  <div style={{ fontSize: 11, lineHeight: 1.55 }}>
                    <span>두 다항식의 합 </span>
                    <Formula tex={`A_${i + 1} = ${2 + i}x^2 + ${i + 3}x`} />
                    <span>를 구하시오.</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 8 }}>
                    {[1,2,3].map(k => (
                      <div key={k} style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 10 }}>
                        <span style={{ width: 11, height: 11, fontSize: 7, fontFamily: HF.t.mono.family, color: HF.c.muted, borderRadius: "50%", border: `1px solid ${HF.c.line}`, display: "grid", placeItems: "center" }}>{k}</span>
                        <Formula tex={`${k * (i + 1)}x^2 + ${k + i}x`} />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <Card pad={16} style={{ background: "white" }}>
            <Eyebrow style={{ marginBottom: 10 }}>⑥ 옵션</Eyebrow>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["shuffleProblems", "문항 순서 섞기", "각 시험지마다 문제 순서 랜덤"],
                ["shuffleChoices", "보기 순서 섞기", "선택지 5개 순서 셔플"],
                ["withSolutions", "풀이·해설 함께 생성", "정답지·해설지 동시 출력"],
                ["redistPoints", "배점 자동 재분배", "난이도에 따라 점수 조정"],
              ].map(([k, t, h]) => (
                <Toggle key={k} label={t} hint={h} value={opts[k]} onChange={(v) => setOpts(o => ({...o, [k]: v}))} />
              ))}
            </div>
          </Card>
        </div>
      </div>

      <div style={{
        padding: "14px 22px", borderTop: `1px solid ${HF.c.line}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Ico name="lightning" size={14} color={HF.c.accent} weight="fill" />
          <span style={{ ...applyType("small"), color: HF.c.text2 }}>
            {count} × {test?.count || 30} = <span style={{ fontWeight: 700, color: HF.c.text, fontFamily: HF.t.mono.family }}>크레딧 {count * (test?.count || 30)}</span> 사용 / 잔여 1,240
          </span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn kind="ghost" size="md" onClick={ctx.closeModal}>취소</Btn>
          <Btn kind="accent" size="md" iconRight="arrow-right" onClick={() => { ctx.closeModal(); ctx.startWizard(test?.id); }}>Wizard로 진행</Btn>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { NewVariantModalHF });
