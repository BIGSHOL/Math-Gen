/* T5 자습 학습지형.
   - 1단: 가로 분할 [문제+정답기록 1.15fr | 모눈 풀이공간 1fr]
   - 2단: 문제+정답기록만 (모눈 풀이공간 제거 → 컴팩트) */

const T5 = ({ columns = 1, balanced = true, problemCount = 3 } = {}) => {
  const accent = KP.c.accentGold;
  const allProbs = [
    { ...PROBLEMS_KR.p1, num: 1 },
    { ...PROBLEMS_KR.p2, num: 2 },
    { ...PROBLEMS_KR.p3, num: 3 },
    { ...PROBLEMS_KR.p4, num: 4 },
    { ...PROBLEMS_KR.p1, num: 5 },
    { ...PROBLEMS_KR.p2, num: 6 },
    { ...PROBLEMS_KR.p3, num: 7 },
  ];
  const visibleCount = columns === 2 ? Math.min(problemCount * 2, allProbs.length) : problemCount;
  const probs = allProbs.slice(0, visibleCount);

  return (
    <A4Page padding="36px 50px 20px" bg={KP.c.paperWarm} style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, flexShrink: 0 }}>
        <div>
          <div style={{
            fontFamily: KP.font.sansKR, fontSize: 10, fontWeight: 700,
            color: accent, letterSpacing: "0.3em", marginBottom: 4,
          }}>SELF-STUDY · DAY 12</div>
          <div style={{ fontFamily: KP.font.serifKR, fontSize: 24, fontWeight: 800, color: KP.c.ink, letterSpacing: "-0.01em" }}>다항식과 이차방정식</div>
          <div style={{ fontFamily: KP.font.sansKR, fontSize: 11, color: KP.c.ink70, marginTop: 4 }}>오늘의 목표 · 다항식 연산과 이차방정식 근의 공식 활용</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: KP.font.sansKR, fontSize: 9.5, color: KP.c.ink50, marginBottom: 2 }}>학습일</div>
          <div style={{ fontFamily: KP.font.serifKR, fontSize: 14, fontWeight: 700 }}>2025. 5. 26.</div>
        </div>
      </div>

      <div style={{
        background: KP.c.paper, border: `1px solid ${accent}`, borderLeft: `5px solid ${accent}`,
        padding: "12px 16px", marginBottom: 18, flexShrink: 0,
      }}>
        <div style={{
          fontFamily: KP.font.sansKR, fontSize: 10.5, fontWeight: 800,
          color: accent, letterSpacing: "0.16em", marginBottom: 6,
        }}>◆ 핵심 개념 정리</div>
        <div style={{ fontFamily: KP.font.serifKR, fontSize: 12, lineHeight: 1.7, color: KP.c.ink90 }}>
          ① 이차방정식 <Formula tex="ax^2 + bx + c = 0" />의 근의 공식 :{" "}
          <Formula tex="x = \dfrac{-b \pm \sqrt{b^2 - 4ac}}{2a}" />
          <br />
          ② 판별식 <Formula tex="D = b^2 - 4ac" />로 근의 개수 판정 (<Formula tex="D > 0" /> 서로 다른 두 실근, <Formula tex="D = 0" /> 중근, <Formula tex="D < 0" /> 두 허근).
        </div>
      </div>

      <Body columns={columns} balanced={columns === 2 ? balanced : false} gap={columns === 1 ? 12 : 16}>
        {probs.map(p => (
          <div key={p.num} style={{
            flex: columns === 1 ? 1 : undefined,
            display: columns === 1 ? "grid" : "block",
            gridTemplateColumns: "1.15fr 1fr", gap: 14,
            paddingBottom: 14,
            borderBottom: `1px dashed ${KP.c.ink15}`,
            breakInside: "avoid",
            minHeight: 0,
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
                <span style={{
                  fontFamily: KP.font.serifKR, fontWeight: 800, fontSize: 18,
                  color: accent, marginRight: 8, lineHeight: 1,
                }}>문 {p.num}</span>
                <span style={{ fontFamily: KP.font.sansKR, fontSize: 10, color: KP.c.ink50, letterSpacing: "0.08em" }}>· {p.topic}</span>
              </div>
              <div style={{ fontSize: columns === 2 ? 11.5 : 12.5, lineHeight: 1.75, fontFamily: KP.font.serifKR }}>
                {p.render(columns === 2 ? 11.5 : 12.5)}
              </div>
              <div style={{
                marginTop: 8, padding: "6px 10px",
                background: KP.c.paperWarm, border: `1px solid ${KP.c.ink15}`,
                display: "flex", alignItems: "center", gap: 8,
                fontFamily: KP.font.sansKR, fontSize: 11,
              }}>
                <span style={{ fontWeight: 700, color: accent }}>내 정답</span>
                <span style={{ flex: 1, borderBottom: `1px solid ${KP.c.ink30}`, height: 16 }} />
                <span style={{ fontSize: 10, color: KP.c.ink50 }}>✓ 채점</span>
                <span style={{ width: 16, height: 16, border: `1.5px solid ${KP.c.ink30}`, display: "inline-block" }} />
              </div>
            </div>
            {columns === 1 && (
              <div style={{
                backgroundImage: `linear-gradient(${KP.c.ink08} 1px, transparent 1px), linear-gradient(90deg, ${KP.c.ink08} 1px, transparent 1px)`,
                backgroundSize: "16px 16px",
                backgroundColor: KP.c.paper,
                border: `1px solid ${KP.c.ink15}`,
                minHeight: 100, position: "relative",
              }}>
                <div style={{
                  position: "absolute", top: 6, right: 8,
                  fontFamily: KP.font.sansKR, fontSize: 9, color: KP.c.ink30,
                  letterSpacing: "0.12em",
                }}>SCRATCH PAD</div>
              </div>
            )}
          </div>
        ))}
      </Body>

      <div style={{
        marginTop: 10, display: "flex", alignItems: "center", gap: 12,
        fontFamily: KP.font.sansKR, fontSize: 10, color: KP.c.ink50, flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, color: accent, letterSpacing: "0.12em" }}>오늘의 메모</span>
        <span style={{ flex: 1, borderBottom: `1px dashed ${KP.c.ink30}`, height: 1 }} />
        <span>p. 1 / 6</span>
      </div>
    </A4Page>
  );
};

Object.assign(window, { T5 });
