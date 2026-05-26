/* T2 정통 내신형 — 한국 학교에서 가장 흔한 시험지 표 양식.
   특징:
   - 상단 큰 표: 학교명 / 학기 / 학년 / 과목 / 시간 / 일자 / 감독
   - 그 아래: 학년·반·번호·이름 표 (왼쪽) + 점수란 (오른쪽)
   - 두꺼운 검정 박스 보더
   - 본문 1단 (학교 내신은 1단 흔함)
   - 우측에 [점수] 명시
   - balanced=true 일 때 본문 vertical justification (문제집 양식) */

const T2 = ({ balanced = true, columns = 1, problemCount = 3 } = {}) => {
  const allProbs = [
    { ...PROBLEMS_KR.p1, num: 1, points: 3 },
    { ...PROBLEMS_KR.p2, num: 2, points: 3 },
    { ...PROBLEMS_KR.p3, num: 3, points: 4 },
    { ...PROBLEMS_KR.p4, num: 4, points: 4 },
    { ...PROBLEMS_KR.p1, num: 5, points: 3 },
    { ...PROBLEMS_KR.p2, num: 6, points: 5 },
    { ...PROBLEMS_KR.p3, num: 7, points: 3 },
    { ...PROBLEMS_KR.p4, num: 8, points: 4 },
  ];
  const probs = allProbs.slice(0, problemCount);

  return (
  <A4Page padding="40px 50px 24px" style={{ display: "flex", flexDirection: "column" }}>
    {/* 시험 정보 표 */}
    <table style={{
      width: "100%", borderCollapse: "collapse",
      border: `2.5px solid ${KP.c.ink}`,
      fontFamily: KP.font.serifKR, fontSize: 12,
      flexShrink: 0,
    }}>
      <tbody>
        <tr style={{ height: 38 }}>
          <td colSpan={6} style={{
            textAlign: "center", fontSize: 22, fontWeight: 800,
            letterSpacing: "0.12em", padding: "6px 12px",
            borderBottom: `1.5px solid ${KP.c.ink}`,
            fontFamily: KP.font.serifKR,
          }}>
            2025학년도 1학기 중간고사
          </td>
        </tr>
        <tr style={{ height: 32 }}>
          <td style={tdLabel(80)}>학 교</td>
          <td style={tdVal()}>○○고등학교</td>
          <td style={tdLabel(60)}>학 년</td>
          <td style={tdVal(50)}>2</td>
          <td style={tdLabel(70)}>과 목</td>
          <td style={tdVal(undefined, true)}>수 학</td>
        </tr>
        <tr style={{ height: 32 }}>
          <td style={tdLabel()}>일 시</td>
          <td style={tdVal()}>2025. 4. 28. (월) 2교시</td>
          <td style={tdLabel()}>시 간</td>
          <td style={tdVal()}>50분</td>
          <td style={tdLabel()}>출제</td>
          <td style={tdVal(undefined, true)}>박○○</td>
        </tr>
      </tbody>
    </table>

    {/* 학생 정보 + 점수 표 */}
    <div style={{ display: "flex", marginTop: 8, gap: 8, flexShrink: 0 }}>
      <table style={{
        flex: 1, borderCollapse: "collapse",
        border: `2px solid ${KP.c.ink}`,
        fontSize: 12, fontFamily: KP.font.serifKR,
      }}>
        <tbody>
          <tr style={{ height: 34 }}>
            <td style={tdLabel(45)}>학년</td>
            <td style={tdVal(55)}></td>
            <td style={tdLabel(45)}>반</td>
            <td style={tdVal(55)}></td>
            <td style={tdLabel(45)}>번호</td>
            <td style={tdVal(55)}></td>
            <td style={tdLabel(45)}>이름</td>
            <td style={tdVal(undefined, true)}></td>
          </tr>
        </tbody>
      </table>
      <table style={{
        width: 140, borderCollapse: "collapse",
        border: `2px solid ${KP.c.ink}`,
        fontSize: 12, fontFamily: KP.font.serifKR,
      }}>
        <tbody>
          <tr style={{ height: 34 }}>
            <td style={{ ...tdLabel(58), background: KP.c.ink04 }}>점 수</td>
            <td style={{ ...tdVal(undefined, true), textAlign: "right", paddingRight: 10, fontWeight: 700 }}>
              <span style={{ color: KP.c.ink30 }}>/100</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    {/* 유의사항 */}
    <div style={{
      marginTop: 10, padding: "8px 12px",
      border: `1px solid ${KP.c.ink70}`,
      fontSize: 10.5, lineHeight: 1.55, color: KP.c.ink70,
      fontFamily: KP.font.serifKR, flexShrink: 0,
    }}>
      ※ 답안은 OMR 카드에 컴퓨터용 사인펜으로 표기하시오. 한 문항에 두 개 이상 표기한 경우 0점 처리합니다.
    </div>

    {/* 본문 — Body component (columns + balanced 자동) */}
    <Body
      columns={columns}
      balanced={balanced}
      gap={18}
      style={{
        marginTop: 18, marginBottom: 8,
        fontSize: 13.5, lineHeight: 1.8,
        fontFamily: KP.font.serifKR,
      }}
    >
      {probs.map(p => (
        <div key={p.num} style={{ breakInside: "avoid" }}>
          <div style={{ display: "flex", alignItems: "baseline", marginBottom: 4 }}>
            <span style={{ fontWeight: 800, fontSize: 14, marginRight: 6 }}>{p.num}.</span>
            <span style={{ flex: 1 }} />
            <Points p={p.points} />
          </div>
          {p.render(13.5)}
        </div>
      ))}
    </Body>

    {/* 푸터: 페이지 번호 */}
    <div style={{
      textAlign: "center", fontSize: 11, fontFamily: KP.font.serifKR, fontWeight: 600,
      flexShrink: 0,
    }}>- 1 -</div>
  </A4Page>
  );
};

// 표 셀 스타일
const tdLabel = (w) => ({
  width: w, padding: "6px 10px",
  background: KP.c.ink04, fontWeight: 700, textAlign: "center",
  border: `1px solid ${KP.c.ink}`, fontFamily: KP.font.serifKR,
});
const tdVal = (w, last) => ({
  width: w, padding: "6px 10px", textAlign: "center",
  border: `1px solid ${KP.c.ink}`,
  borderRight: last ? `1px solid ${KP.c.ink}` : undefined,
  fontFamily: KP.font.serifKR,
});

Object.assign(window, { T2 });
