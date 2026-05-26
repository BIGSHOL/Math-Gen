/* T3 모던 내신형 — 학교/학원 마케팅용 살짝 modernized. */

const T3 = ({ columns = 1, balanced = true, problemCount = 3 } = {}) => {
  const accent = KP.c.accentNavy;
  const allProbs = [
    { ...PROBLEMS_KR.p1, num: 1, points: 3 },
    { ...PROBLEMS_KR.p2, num: 2, points: 3 },
    { ...PROBLEMS_KR.p3, num: 3, points: 4 },
    { ...PROBLEMS_KR.p4, num: 4, points: 4 },
    { ...PROBLEMS_KR.p1, num: 5, points: 3 },
    { ...PROBLEMS_KR.p2, num: 6, points: 4 },
  ];
  const probs = allProbs.slice(0, problemCount);

  return (
    <A4Page padding="40px 56px 24px" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{
        display: "flex", alignItems: "flex-end", justifyContent: "space-between",
        paddingBottom: 12, borderBottom: `3px solid ${accent}`,
        flexShrink: 0,
      }}>
        <div>
          <div style={{
            fontSize: 11, fontWeight: 700, color: accent,
            letterSpacing: "0.32em", fontFamily: KP.font.sansKR, marginBottom: 4,
          }}>2025 · 1ST SEMESTER · MIDTERM</div>
          <div style={{
            fontSize: 26, fontWeight: 800, color: KP.c.ink,
            fontFamily: KP.font.sansKR, letterSpacing: "-0.02em",
          }}>○○고등학교 <span style={{ fontWeight: 500, color: KP.c.ink50 }}>· 2학년 수학</span></div>
          <div style={{ marginTop: 4, fontSize: 12, color: KP.c.ink70, fontFamily: KP.font.sansKR }}>
            2025년 4월 28일 (월) · 2교시 · 50분 · 30문항 (100점)
          </div>
        </div>
        <div style={{
          padding: "8px 14px", border: `2px solid ${accent}`, color: accent,
          fontFamily: KP.font.sansKR, fontWeight: 800, fontSize: 14, letterSpacing: "0.12em",
        }}>중간고사</div>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "repeat(5, 1fr) 1.2fr",
        marginTop: 18, border: `1.5px solid ${KP.c.ink30}`, flexShrink: 0,
      }}>
        {[["학년","2"], ["반",""], ["번호",""], ["성명",""], ["감독",""], ["점수","/ 100"]].map(([l, v], i) => (
          <div key={l} style={{
            padding: "10px 14px",
            borderRight: i < 5 ? `1px solid ${KP.c.ink15}` : undefined,
            background: i === 5 ? KP.c.ink04 : KP.c.paper,
            fontFamily: KP.font.sansKR,
          }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", color: accent, marginBottom: 3 }}>{l.toUpperCase()}</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{v || <span style={{ color: KP.c.ink15 }}>______</span>}</div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 14, padding: "8px 0",
        fontSize: 10.5, color: KP.c.ink70, fontFamily: KP.font.sansKR,
        letterSpacing: "0.02em", flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, color: accent }}>! </span>
        OMR 카드에 컴퓨터용 사인펜으로 표기 · 한 문항 중복 표기 시 0점 처리 · 계산기·전자기기 사용 금지
      </div>

      <div style={{ height: 1, background: KP.c.ink08, marginBottom: 20, flexShrink: 0 }} />

      <Body columns={columns} balanced={balanced} style={{ fontSize: 13.5, lineHeight: 1.85 }} columnGap={32}>
        {probs.map(p => (
          <div key={p.num} style={{ breakInside: "avoid", paddingBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 6 }}>
              <span style={{
                fontSize: 22, fontWeight: 800, color: accent,
                fontFamily: KP.font.sansKR, letterSpacing: "-0.02em",
                fontVariantNumeric: "tabular-nums",
              }}>{String(p.num).padStart(2, "0")}.</span>
              <span style={{
                fontSize: 10, fontWeight: 700, color: KP.c.ink50,
                fontFamily: KP.font.sansKR, letterSpacing: "0.08em", textTransform: "uppercase",
              }}>{p.topic}</span>
              <span style={{ flex: 1 }} />
              <span style={{
                fontFamily: KP.font.sansKR, fontSize: 11, fontWeight: 700, color: accent,
                padding: "2px 8px", border: `1px solid ${accent}`, borderRadius: 999,
              }}>{p.points}점</span>
            </div>
            <div style={{ paddingLeft: 28 }}>{p.render(13.5)}</div>
          </div>
        ))}
      </Body>

      <div style={{
        marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center",
        fontFamily: KP.font.sansKR, fontSize: 10, color: KP.c.ink50, letterSpacing: "0.04em",
        flexShrink: 0,
      }}>
        <span>○○고등학교 · 2학년 수학 중간고사</span>
        <span style={{ fontWeight: 700, color: accent }}>1 / 8</span>
      </div>
    </A4Page>
  );
};

Object.assign(window, { T3 });
