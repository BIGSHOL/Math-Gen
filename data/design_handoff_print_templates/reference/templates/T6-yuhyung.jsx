/* T6 유형 훈련지 — 컴팩트 반복.
   columns 1/2 모두 지원. 2단이 기본. */

const T6 = ({ columns = 2, balanced = true, problemCount = 8 } = {}) => {
  const accent = KP.c.accentSlate;
  const allTemplates = [PROBLEMS_KR.p1, PROBLEMS_KR.p2, PROBLEMS_KR.p3, PROBLEMS_KR.p4];
  const probs = Array.from({ length: problemCount }, (_, i) => ({
    ...allTemplates[i % allTemplates.length], num: i + 1
  }));

  return (
    <A4Page padding="28px 44px 16px" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{
        background: KP.c.ink, color: "white", padding: "10px 16px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 14, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{
            fontFamily: KP.font.sansKR, fontSize: 10, fontWeight: 800,
            letterSpacing: "0.32em", color: KP.c.ink30,
          }}>PATTERN</span>
          <span style={{
            fontFamily: KP.font.sansKR, fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em",
          }}>유형 04. <span style={{ color: "#FFD53A" }}>이차방정식 활용</span></span>
        </div>
        <div style={{
          fontFamily: KP.font.mono, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em",
          background: "rgba(255,255,255,0.12)", padding: "4px 10px",
        }}>{String(problemCount).padStart(2, "0")} 문항 · 평균 정답률 64%</div>
      </div>

      <div style={{
        display: "flex", alignItems: "center", gap: 16, marginBottom: 16,
        padding: "6px 0", borderBottom: `1px solid ${KP.c.ink15}`, flexShrink: 0,
      }}>
        <span style={{ fontFamily: KP.font.sansKR, fontSize: 10.5, fontWeight: 700, color: accent, letterSpacing: "0.12em" }}>핵심 전략</span>
        <span style={{ fontFamily: KP.font.serifKR, fontSize: 11.5, color: KP.c.ink90 }}>
          판별식 → 두 근의 관계 → 합·곱 활용 · 도출 식의 조건 명확히 분리
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: KP.font.sansKR, fontSize: 10, color: KP.c.ink50 }}>이름 ____________ · 날짜 ___________</span>
      </div>

      <Body
        columns={columns}
        balanced={balanced}
        gap={columns === 1 ? 14 : 16}
        columnGap={22}
        columnRule={`1px solid ${KP.c.ink08}`}
        style={{ fontSize: columns === 1 ? 12.5 : 11.5, lineHeight: 1.65 }}
      >
        {probs.map(p => (
          <div key={p.num} style={{ breakInside: "avoid", paddingBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "baseline", marginBottom: 4 }}>
              {Q.box(p.num, accent)}
              <span style={{ fontFamily: KP.font.sansKR, fontSize: 9, color: KP.c.ink50, letterSpacing: "0.08em" }}>{p.topic}</span>
            </div>
            <div style={{ fontFamily: KP.font.serifKR, fontSize: columns === 1 ? 12.5 : 11.5, lineHeight: 1.65 }}>
              {p.render(columns === 1 ? 12.5 : 11.5)}
            </div>
          </div>
        ))}
      </Body>

      <div style={{
        marginTop: 8, display: "flex", alignItems: "center", gap: 12,
        fontFamily: KP.font.sansKR, fontSize: 9.5, color: KP.c.ink50, flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, color: accent, letterSpacing: "0.1em" }}>PROGRESS</span>
        <div style={{ flex: 1, height: 3, background: KP.c.ink08, position: "relative" }}>
          <div style={{ width: "62%", height: "100%", background: accent }} />
        </div>
        <span style={{ fontFamily: KP.font.mono, fontWeight: 700, color: KP.c.ink }}>4 / 8</span>
        <span style={{ marginLeft: 14, color: KP.c.ink30 }}>PG · 1</span>
      </div>
    </A4Page>
  );
};

Object.assign(window, { T6 });
