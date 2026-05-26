/* T1 평가원 정밀형 — 수능·모의평가 시험지 양식 충실 재현. */

const T1 = ({ columns = 2, balanced = true, problemCount = 4 } = {}) => {
  const all = [
    { ...PROBLEMS_KR.p1, num: 1, points: 2 },
    { ...PROBLEMS_KR.p2, num: 2, points: 3 },
    { ...PROBLEMS_KR.p3, num: 3, points: 3 },
    { ...PROBLEMS_KR.p4, num: 4, points: 4 },
    { ...PROBLEMS_KR.p1, num: 5, points: 3 },
    { ...PROBLEMS_KR.p2, num: 6, points: 4 },
    { ...PROBLEMS_KR.p3, num: 7, points: 3 },
    { ...PROBLEMS_KR.p4, num: 8, points: 4 },
  ];
  const probs = all.slice(0, problemCount);

  return (
    <A4Page padding="0" style={{ display: "flex", flexDirection: "column", fontFamily: KP.font.serifKR }}>
      <div style={{ padding: "42px 56px 18px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "stretch", border: `2.5px solid ${KP.c.ink}`, height: 56, marginBottom: 22 }}>
          <div style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, fontWeight: 800, letterSpacing: "0.18em",
            borderRight: `2.5px solid ${KP.c.ink}`,
          }}>수학 영역</div>
          <div style={{
            width: 124, display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 700, letterSpacing: "0.08em",
          }}>제 1 교시</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11.5, color: KP.c.ink70 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ display: "inline-grid", placeItems: "center", width: 24, height: 16, border: `1.5px solid ${KP.c.ink}`, fontSize: 10, fontWeight: 700 }}>홀</span>
            <span style={{ fontWeight: 600 }}>5지 선다형</span>
          </span>
          <span style={{ fontWeight: 600 }}>● 다음 물음에 답하시오.</span>
        </div>
      </div>

      <Body columns={columns} balanced={balanced} style={{ padding: "0 56px 30px", fontSize: 13.2, lineHeight: 1.75 }}>
        {probs.map(p => (
          <div key={p.num} style={{ breakInside: "avoid", paddingBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>{p.num}.</span>
              <span style={{ flex: 1 }} />
              <Points p={p.points} />
            </div>
            {p.render(13.2)}
          </div>
        ))}
      </Body>

      <div style={{
        margin: "0 56px 12px", paddingTop: 6,
        borderTop: `1px solid ${KP.c.ink}`,
        display: "flex", justifyContent: "space-between",
        fontSize: 11, fontWeight: 700, flexShrink: 0,
      }}>
        <span>수학 영역</span>
        <span style={{ fontFamily: KP.font.mono }}>1</span>
      </div>
    </A4Page>
  );
};

Object.assign(window, { T1 });
