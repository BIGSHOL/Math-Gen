/* T4 학원 워크북형.
   - 1단: 가로 분할 [문제 1.3fr | 풀이공간 1fr]
   - 2단: 문제만 (워크북 헤더 유지, 풀이공간 제거 → 컴팩트) */

const T4 = ({ columns = 1, balanced = true, problemCount = 3 } = {}) => {
  const accent = KP.c.accentRed;
  const allProbs = [
    { ...PROBLEMS_KR.p1, num: 1, points: 3 },
    { ...PROBLEMS_KR.p2, num: 2, points: 3 },
    { ...PROBLEMS_KR.p3, num: 3, points: 4 },
    { ...PROBLEMS_KR.p4, num: 4, points: 4 },
    { ...PROBLEMS_KR.p1, num: 5, points: 3 },
    { ...PROBLEMS_KR.p2, num: 6, points: 4 },
    { ...PROBLEMS_KR.p3, num: 7, points: 3 },
    { ...PROBLEMS_KR.p4, num: 8, points: 4 },
  ];
  const visibleCount = columns === 2 ? Math.min(problemCount * 2, allProbs.length) : problemCount;
  const probs = allProbs.slice(0, visibleCount);

  return (
    <A4Page padding="32px 44px 20px" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, background: accent, color: "white",
            display: "grid", placeItems: "center",
            fontFamily: KP.font.sansKR, fontWeight: 900, fontSize: 18,
            letterSpacing: "-0.04em",
          }}>M</div>
          <div>
            <div style={{ fontFamily: KP.font.sansKR, fontWeight: 800, fontSize: 17, letterSpacing: "-0.01em" }}>명진 수학 학원</div>
            <div style={{ fontFamily: KP.font.sansKR, fontSize: 10.5, color: KP.c.ink50, letterSpacing: "0.04em" }}>MYUNGJIN MATH ACADEMY</div>
          </div>
        </div>
        <div style={{ fontFamily: KP.font.sansKR, fontSize: 11, color: KP.c.ink70, textAlign: "right" }}>
          <div><span style={{ color: KP.c.ink50 }}>강의</span> · 박○○ T</div>
          <div><span style={{ color: KP.c.ink50 }}>주차</span> · WEEK 12 · 2025.05</div>
        </div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        background: KP.c.ink, color: "white",
        padding: "10px 16px", flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <span style={{ fontFamily: KP.font.sansKR, fontWeight: 800, fontSize: 14, letterSpacing: "-0.01em" }}>[Chapter 3] 함수와 그래프</span>
          <span style={{ fontFamily: KP.font.sansKR, fontSize: 11, color: KP.c.ink30, marginLeft: 8 }}>합성함수의 그래프와 정의역</span>
        </div>
        <div style={{ fontFamily: KP.font.sansKR, fontSize: 11, display: "flex", gap: 14 }}>
          <span><span style={{ color: KP.c.ink30 }}>이름</span> ___________</span>
          <span><span style={{ color: KP.c.ink30 }}>날짜</span> ___________</span>
        </div>
      </div>

      <Body
        columns={columns}
        balanced={columns === 2 ? balanced : false}
        gap={columns === 1 ? 12 : 14}
        style={{ marginTop: 16 }}
      >
        {probs.map(p => (
          <div key={p.num} style={{
            flex: columns === 1 ? 1 : undefined,
            display: columns === 1 ? "grid" : "block",
            gridTemplateColumns: "1.3fr 1fr", gap: 16,
            border: `1px solid ${KP.c.ink15}`, padding: "12px 14px",
            background: KP.c.paper, breakInside: "avoid",
            minHeight: 0,
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                {Q.boxFilled(p.num, accent)}
                <span style={{
                  fontFamily: KP.font.sansKR, fontSize: 10, fontWeight: 700,
                  color: KP.c.ink50, letterSpacing: "0.1em",
                }}>{p.topic.toUpperCase()}</span>
                <span style={{ flex: 1 }} />
                <Points p={p.points} />
              </div>
              <div style={{ fontSize: columns === 2 ? 11.5 : 12.5, lineHeight: 1.7, fontFamily: KP.font.serifKR }}>
                {p.render(columns === 2 ? 11.5 : 12.5)}
              </div>
            </div>
            {/* 풀이공간 — 1단에서만 (카드가 flex 1로 stretch → 풀이공간이 자연 확장) */}
            {columns === 1 && (
              <div style={{
                borderLeft: `1px dashed ${KP.c.ink30}`,
                padding: "0 6px 0 12px",
                backgroundImage: `linear-gradient(transparent 0px, transparent 23px, ${KP.c.ink08} 24px)`,
                backgroundSize: "100% 24px",
                minHeight: 100, position: "relative",
              }}>
                <div style={{
                  position: "absolute", top: -2, left: 12,
                  background: KP.c.paper, padding: "0 6px",
                  fontFamily: KP.font.sansKR, fontSize: 9.5, fontWeight: 700,
                  color: accent, letterSpacing: "0.1em",
                }}>풀이 SCRATCH</div>
              </div>
            )}
          </div>
        ))}
      </Body>

      <div style={{
        marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center",
        fontFamily: KP.font.sansKR, fontSize: 9.5, color: KP.c.ink50, flexShrink: 0,
      }}>
        <span>명진 수학 · WK12 워크북{columns === 2 ? " · 컴팩트" : ""}</span>
        <span style={{ fontWeight: 700 }}>1 of 4</span>
      </div>
    </A4Page>
  );
};

Object.assign(window, { T4 });
