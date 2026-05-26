/* 공용 인쇄 시험지 primitives.
   A4 사이즈 (210mm × 297mm) 기준, 96 dpi에서 794×1123 px로 표시.
   한국 학교 내신 시험지 톤 — 흑백 inkjet 인쇄에서도 충실히 재현. */

const KP = {
  // 색 — 흑백 인쇄 호환 안전한 톤만
  c: {
    ink: "#0E0E10",
    ink90: "#1F1F23",
    ink70: "#3A3A40",
    ink50: "#6B6B72",
    ink30: "#A0A0A8",
    ink15: "#D4D4D8",
    ink08: "#E8E8EB",
    ink04: "#F4F4F6",
    paper: "#FFFFFF",
    paperWarm: "#FCFCF8", // 옅은 누런 종이 톤
    accentNavy: "#1B2A4E",
    accentRed: "#8B1A1A",
    accentGold: "#A57F00",
    accentSlate: "#475569",
  },
  // 한국 시험지 — 명조 톤 강함
  font: {
    serifKR: '"KoPubBatang", "Nanum Myeongjo", "Noto Serif KR", "Batang", serif',
    serifKRMid: '"Noto Serif KR", "Nanum Myeongjo", serif',
    sansKR: 'Pretendard, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
    mono: '"JetBrains Mono", "D2Coding", monospace',
  },
};

// A4 사이즈 (CSS px @ 96dpi)
const A4 = { w: 794, h: 1123 };

// ── A4 페이지 래퍼 ──────────────────────────────────────────
const A4Page = ({ children, padding = "44px 56px", style = {}, bg = KP.c.paper }) => (
  <div style={{
    width: A4.w, height: A4.h,
    background: bg,
    boxShadow: "0 4px 24px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)",
    padding,
    boxSizing: "border-box",
    position: "relative",
    overflow: "hidden",
    fontFamily: KP.font.serifKR,
    color: KP.c.ink,
    fontSize: 13,
    lineHeight: 1.6,
    ...style,
  }}>{children}</div>
);

// ── Mock 본문 텍스트 ─────────────────────────────────────────
const QText = ({ children, style = {} }) => (
  <span style={{ fontFamily: KP.font.serifKR, ...style }}>{children}</span>
);

const Formula = ({ tex, displayMode = false }) => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.katex) {
      try {
        window.katex.render(tex, ref.current, { displayMode, throwOnError: false });
      } catch { if (ref.current) ref.current.textContent = tex; }
    }
  }, [tex, displayMode]);
  return <span ref={ref} style={{ fontFamily: "KaTeX_Main, serif" }} />;
};

// ── 보기 5지선다 (한국식 ①②③④⑤) ───────────────────────────
const Choices = ({ items, cols = 5, style = {}, size = 13 }) => {
  const markers = ["①","②","③","④","⑤"];
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gap: "6px 16px",
      marginTop: 8,
      fontSize: size,
      ...style,
    }}>
      {items.map((it, i) => (
        <span key={i} style={{ display: "flex", gap: 4, fontFamily: KP.font.serifKR }}>
          <span style={{ flexShrink: 0 }}>{markers[i]}</span>
          <span>{it}</span>
        </span>
      ))}
    </div>
  );
};

// ── 문항 본문 mock (다양한 주제) ────────────────────────────
const PROBLEMS_KR = {
  p1: {
    num: 1, points: 2, topic: "다항식",
    render: (size = 13.5) => (
      <div style={{ fontSize: size, lineHeight: 1.75 }}>
        <span>두 다항식 </span>
        <Formula tex="A = 2x^2 + 3x - 1, \; B = x^2 - 2x + 4" />
        <span>에 대하여 </span>
        <Formula tex="A - B" />
        <span>를 구하시오.</span>
        <Choices items={[
          <Formula tex="x^2 + 5x - 5" />,
          <Formula tex="x^2 + x + 3" />,
          <Formula tex="x^2 + 5x + 3" />,
          <Formula tex="3x^2 + x - 5" />,
          <Formula tex="3x^2 + 5x - 5" />,
        ]} size={size - 0.5} />
      </div>
    ),
  },
  p2: {
    num: 2, points: 3, topic: "이차방정식",
    render: (size = 13.5) => (
      <div style={{ fontSize: size, lineHeight: 1.75 }}>
        <span>이차방정식 </span>
        <Formula tex="x^2 - 5x + k = 0" />
        <span>의 두 근의 차가 </span>
        <Formula tex="3" />
        <span>일 때, 실수 </span>
        <Formula tex="k" />
        <span>의 값을 구하시오.</span>
        <Choices items={[
          <Formula tex="2" />,<Formula tex="3" />,<Formula tex="4" />,<Formula tex="5" />,<Formula tex="6" />,
        ]} size={size - 0.5} />
      </div>
    ),
  },
  p3: {
    num: 3, points: 3, topic: "함수와 그래프",
    render: (size = 13.5) => (
      <div style={{ fontSize: size, lineHeight: 1.75 }}>
        <span>함수 </span>
        <Formula tex="f(x) = x^2 - 4x + 3" />
        <span>의 그래프가 직선 </span>
        <Formula tex="y = 2x + k" />
        <span>와 서로 다른 두 점에서 만나도록 하는 정수 </span>
        <Formula tex="k" />
        <span>의 최솟값은?</span>
        <Choices items={[
          <Formula tex="-5" />,<Formula tex="-4" />,<Formula tex="-3" />,<Formula tex="-2" />,<Formula tex="-1" />,
        ]} size={size - 0.5} />
      </div>
    ),
  },
  p4: {
    num: 4, points: 4, topic: "삼각함수",
    render: (size = 13.5) => (
      <div style={{ fontSize: size, lineHeight: 1.75 }}>
        <span>삼각형 </span>
        <Formula tex="\mathrm{ABC}" />
        <span>에서 </span>
        <Formula tex="\overline{AB} = 5, \; \overline{AC} = 7, \; \cos A = \tfrac{1}{5}" />
        <span>일 때, </span>
        <Formula tex="\overline{BC}^2" />
        <span>의 값을 구하시오.</span>
      </div>
    ),
  },
};

// ── 문항 번호 스타일 모음 ─────────────────────────────────
const Q = {
  // 평가원형 — 두꺼운 본문 글자 번호 + 마침표
  exam: (n) => <span style={{ fontWeight: 700, fontFamily: KP.font.serifKR, marginRight: 6 }}>{n}.</span>,
  // 박스형
  box: (n, color = KP.c.ink) => (
    <span style={{
      display: "inline-grid", placeItems: "center",
      width: 22, height: 22, border: `1.5px solid ${color}`,
      fontWeight: 700, fontSize: 12, marginRight: 6,
      verticalAlign: "middle"
    }}>{n}</span>
  ),
  // 채워진 박스
  boxFilled: (n, bg = KP.c.ink) => (
    <span style={{
      display: "inline-grid", placeItems: "center",
      width: 22, height: 22, background: bg, color: "white",
      fontWeight: 700, fontSize: 12, marginRight: 6,
      verticalAlign: "middle"
    }}>{n}</span>
  ),
  // 원형
  circle: (n) => (
    <span style={{
      display: "inline-grid", placeItems: "center",
      width: 22, height: 22, borderRadius: "50%", border: "1.5px solid currentColor",
      fontWeight: 700, fontSize: 12, marginRight: 6,
      verticalAlign: "middle"
    }}>{n}</span>
  ),
  // 큰 산세리프 번호
  serif: (n) => (
    <span style={{
      fontFamily: KP.font.serifKR, fontWeight: 800, fontSize: 22,
      marginRight: 8, lineHeight: 1
    }}>{n}.</span>
  ),
};

// Point label "[3점]" 식
const Points = ({ p, style = {} }) => (
  <span style={{
    fontFamily: KP.font.serifKR, fontSize: 11, color: KP.c.ink70, marginLeft: 6,
    ...style,
  }}>[{p}점]</span>
);

Object.assign(window, { KP, A4, A4Page, QText, Formula, Choices, PROBLEMS_KR, Q, Points, Body });

/* Body — 1단/2단 본문 컨테이너.
   - 1단: flex column + 일정 gap. 페이지가 가득 안 차면 자연스러운 빈공간.
   - 2단: 그리드 2열 + 좌우 각 컬럼 flex column + 일정 gap.
   - 페이지를 채우려면 problemCount를 늘릴 것 (실제 문제집 양식).
   - 풀이공간 있는 템플릿(T4/T5)은 자식 카드에 flex:1로 stretch. */
function Body({ children, columns = 1, gap = 16, columnGap = 26, columnRule, style = {} }) {
  if (columns === 2) {
    const items = React.Children.toArray(children);
    const half = Math.ceil(items.length / 2);
    const colStyle = {
      display: "flex", flexDirection: "column", gap, minWidth: 0,
    };
    return (
      <div style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: columnRule === null ? "1fr 1fr" : "1fr 1px 1fr",
        gap: `0 ${columnGap / 2}px`,
        ...style,
      }}>
        <div style={colStyle}>{items.slice(0, half)}</div>
        {columnRule !== null && (
          <div style={{ width: 1, background: columnRule || KP.c.ink08 }} />
        )}
        <div style={colStyle}>{items.slice(half)}</div>
      </div>
    );
  }
  return (
    <div style={{
      flex: 1,
      display: "flex", flexDirection: "column",
      gap,
      ...style,
    }}>
      {children}
    </div>
  );
}
