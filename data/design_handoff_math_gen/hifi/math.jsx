/* Math content — KaTeX formulas + lightweight SVG graphs/diagrams.
   Real Korean math test problem stand-ins. */

// ---------- KaTeX Formula ----------
const Formula = ({ tex, displayMode = false, style = {}, color }) => {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (ref.current && window.katex) {
      try {
        window.katex.render(tex, ref.current, {
          displayMode, throwOnError: false,
          output: "html",
          fleqn: false,
        });
      } catch (e) {
        if (ref.current) ref.current.textContent = tex;
      }
    }
  }, [tex, displayMode]);
  return <span ref={ref} style={{ color: color || "inherit", ...style }} />;
};

// ---------- SVG graph: function plot ----------
const FunctionGraph = ({
  width = 240, height = 180,
  xRange = [-3, 3], yRange = [-3, 5],
  func = (x) => x * x - 2,
  highlight = "#0EA5E9",
  showAxes = true, showGrid = true,
  points = [], // [{x, y, label}]
  title,
  style = {},
}) => {
  const [xMin, xMax] = xRange;
  const [yMin, yMax] = yRange;
  const padding = 18;
  const w = width - padding * 2;
  const h = height - padding * 2;

  const toX = (x) => padding + ((x - xMin) / (xMax - xMin)) * w;
  const toY = (y) => padding + h - ((y - yMin) / (yMax - yMin)) * h;

  // Build path
  const steps = 80;
  let path = "";
  for (let i = 0; i <= steps; i++) {
    const x = xMin + ((xMax - xMin) / steps) * i;
    let y;
    try { y = func(x); } catch { continue; }
    if (!isFinite(y) || y < yMin - 5 || y > yMax + 5) continue;
    path += (i === 0 ? "M " : " L ") + toX(x).toFixed(2) + " " + toY(y).toFixed(2);
  }

  // Grid lines
  const xTicks = [];
  for (let x = Math.ceil(xMin); x <= xMax; x++) if (x !== 0) xTicks.push(x);
  const yTicks = [];
  for (let y = Math.ceil(yMin); y <= yMax; y++) if (y !== 0) yTicks.push(y);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ background: "transparent", ...style }}>
      {showGrid && (
        <g opacity="0.5">
          {xTicks.map(x => <line key={"vx" + x} x1={toX(x)} x2={toX(x)} y1={padding} y2={padding + h} stroke="#ECEEF0" strokeWidth="1" />)}
          {yTicks.map(y => <line key={"hy" + y} y1={toY(y)} y2={toY(y)} x1={padding} x2={padding + w} stroke="#ECEEF0" strokeWidth="1" />)}
        </g>
      )}
      {showAxes && (
        <g>
          <line x1={padding} x2={padding + w} y1={toY(0)} y2={toY(0)} stroke="#9CA3AF" strokeWidth="1" />
          <line y1={padding} y2={padding + h} x1={toX(0)} x2={toX(0)} stroke="#9CA3AF" strokeWidth="1" />
          {/* Axis arrows */}
          <polygon points={`${padding + w},${toY(0)} ${padding + w - 5},${toY(0) - 3} ${padding + w - 5},${toY(0) + 3}`} fill="#9CA3AF" />
          <polygon points={`${toX(0)},${padding} ${toX(0) - 3},${padding + 5} ${toX(0) + 3},${padding + 5}`} fill="#9CA3AF" />
          {/* Origin label */}
          <text x={toX(0) - 8} y={toY(0) + 13} fontSize="9" fill="#6B7280" textAnchor="end" fontFamily="JetBrains Mono, monospace">O</text>
          <text x={padding + w - 4} y={toY(0) + 13} fontSize="9" fill="#6B7280" textAnchor="end" fontFamily="JetBrains Mono, monospace">x</text>
          <text x={toX(0) + 6} y={padding + 8} fontSize="9" fill="#6B7280" fontFamily="JetBrains Mono, monospace">y</text>
        </g>
      )}
      <path d={path} stroke={highlight} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={toX(p.x)} cy={toY(p.y)} r="3" fill={p.color || highlight} stroke="white" strokeWidth="1.5" />
          {p.label && (
            <text x={toX(p.x) + 6} y={toY(p.y) - 6} fontSize="10" fill="#1A1D24" fontFamily="JetBrains Mono, monospace" fontWeight="500">{p.label}</text>
          )}
        </g>
      ))}
      {title && <text x={padding} y={12} fontSize="10" fill="#6B7280" fontFamily="Pretendard">{title}</text>}
    </svg>
  );
};

// ---------- Geometry diagram (triangle) ----------
const TriangleDiagram = ({ width = 220, height = 170, style = {} }) => {
  const cx = width / 2, cy = height / 2 + 20;
  const r = 60;
  const A = [cx, cy - r * 0.9];
  const B = [cx - r * 0.85, cy + r * 0.5];
  const C = [cx + r * 0.85, cy + r * 0.5];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      <polygon points={`${A[0]},${A[1]} ${B[0]},${B[1]} ${C[0]},${C[1]}`}
        fill="#E0F2FE" fillOpacity="0.5" stroke="#0EA5E9" strokeWidth="1.8" strokeLinejoin="round" />
      {/* Vertex labels */}
      <text x={A[0]} y={A[1] - 8} fontSize="13" fontWeight="600" textAnchor="middle" fill="#0F1117" fontStyle="italic">A</text>
      <text x={B[0] - 10} y={B[1] + 12} fontSize="13" fontWeight="600" textAnchor="middle" fill="#0F1117" fontStyle="italic">B</text>
      <text x={C[0] + 10} y={C[1] + 12} fontSize="13" fontWeight="600" textAnchor="middle" fill="#0F1117" fontStyle="italic">C</text>
      {/* Side labels */}
      <text x={(B[0] + C[0]) / 2} y={C[1] + 22} fontSize="11" fill="#3D4453" textAnchor="middle" fontStyle="italic">a</text>
      <text x={(A[0] + B[0]) / 2 - 12} y={(A[1] + B[1]) / 2} fontSize="11" fill="#3D4453" fontStyle="italic">c</text>
      <text x={(A[0] + C[0]) / 2 + 8} y={(A[1] + C[1]) / 2} fontSize="11" fill="#3D4453" fontStyle="italic">b</text>
      {/* Angle arc at A */}
      <path d={`M ${A[0] - 12} ${A[1] + 14} A 16 16 0 0 0 ${A[0] + 12} ${A[1] + 14}`} fill="none" stroke="#0EA5E9" strokeWidth="1" />
      <text x={A[0]} y={A[1] + 24} fontSize="9" fill="#0EA5E9" textAnchor="middle">θ</text>
    </svg>
  );
};

// ---------- Number line ----------
const NumberLine = ({ width = 280, height = 50, points = [], range = [-3, 3] }) => {
  const [a, b] = range;
  const padding = 24;
  const w = width - padding * 2;
  const toX = (x) => padding + ((x - a) / (b - a)) * w;
  return (
    <svg width={width} height={height}>
      <line x1={padding} x2={padding + w} y1={height / 2} y2={height / 2} stroke="#3D4453" strokeWidth="1.5" />
      <polygon points={`${padding + w},${height / 2} ${padding + w - 6},${height / 2 - 4} ${padding + w - 6},${height / 2 + 4}`} fill="#3D4453" />
      <polygon points={`${padding},${height / 2} ${padding + 6},${height / 2 - 4} ${padding + 6},${height / 2 + 4}`} fill="#3D4453" />
      {Array.from({ length: b - a + 1 }, (_, i) => a + i).map(v => (
        <g key={v}>
          <line x1={toX(v)} x2={toX(v)} y1={height / 2 - 4} y2={height / 2 + 4} stroke="#3D4453" strokeWidth="1.2" />
          <text x={toX(v)} y={height / 2 + 18} fontSize="10" fill="#3D4453" textAnchor="middle" fontFamily="JetBrains Mono">{v}</text>
        </g>
      ))}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={toX(p.x)} cy={height / 2} r="4" fill={p.solid ? "#0EA5E9" : "white"} stroke="#0EA5E9" strokeWidth="1.5" />
          {p.label && <text x={toX(p.x)} y={height / 2 - 10} fontSize="10" fill="#0EA5E9" textAnchor="middle" fontWeight="600">{p.label}</text>}
        </g>
      ))}
    </svg>
  );
};

// ---------- Realistic problem renderers ----------
// Pre-built problems for demo purposes
const PROBLEMS = {
  p1: {
    num: 1, topic: "다항식", diff: "하", points: 2,
    render: (mode = "full") => (
      <ProblemBody>
        <p>두 다항식</p>
        <Formula tex="A = 2x^2 + 3x - 1, \\quad B = x^2 - 2x + 4" displayMode />
        <p>에 대하여 <Formula tex="A - B" />의 값을 구한 식으로 옳은 것은?</p>
        <Choices items={[
          { tex: "x^2 + 5x - 5" },
          { tex: "x^2 + x + 3" },
          { tex: "x^2 + 5x + 3" },
          { tex: "3x^2 + x - 5" },
          { tex: "3x^2 + 5x - 5" },
        ]} answer={0} />
      </ProblemBody>
    ),
  },
  p6: {
    num: 6, topic: "함수와 그래프 · 합성함수", diff: "중상", points: 3,
    render: (mode = "full", variant = "new") => (
      <ProblemBody>
        <p>함수 <Formula tex={variant === "orig" ? "f(x) = x^2 - 4x + 3" : "g(x) = 2x^2 - 6x + 1"} />에 대하여 합성함수
          <Formula tex={variant === "orig" ? "(f \\circ f)(x)" : "(g \\circ g)(x)"} />
          의 그래프가 <Formula tex="x" />축과 만나는 서로 다른 점의 개수를 구하시오.</p>
        <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
          <FunctionGraph
            xRange={[-1, 5]} yRange={[-3, 5]}
            func={variant === "orig" ? (x) => x * x - 4 * x + 3 : (x) => 2 * x * x - 6 * x + 1}
            points={variant === "orig"
              ? [{ x: 1, y: 0, label: "1" }, { x: 3, y: 0, label: "3" }]
              : [{ x: 0.18, y: 0, label: "α" }, { x: 2.82, y: 0, label: "β" }]
            }
            title={variant === "orig" ? "y = f(x)" : "y = g(x)"}
            width={280} height={180}
          />
        </div>
        <Choices items={[
          { tex: "2" }, { tex: "3" }, { tex: "4" }, { tex: "5" }, { tex: "6" },
        ]} answer={2} />
      </ProblemBody>
    ),
  },
  p11: {
    num: 11, topic: "수열", diff: "중", points: 3,
    render: () => (
      <ProblemBody>
        <p>수열 <Formula tex="\\{a_n\\}" />이 모든 자연수 <Formula tex="n" />에 대하여</p>
        <Formula tex="a_{n+1} = a_n + 2n - 1, \\quad a_1 = 3" displayMode />
        <p>을 만족할 때, <Formula tex="a_{10}" />의 값을 구하시오.</p>
      </ProblemBody>
    ),
  },
  p17: {
    num: 17, topic: "삼각함수", diff: "중상", points: 4,
    render: () => (
      <ProblemBody>
        <p>그림과 같이 삼각형 <Formula tex="\\mathrm{ABC}" />에서</p>
        <Formula tex="\\overline{AB} = 5, \\quad \\overline{AC} = 7, \\quad \\angle A = \\theta" displayMode />
        <p>일 때, <Formula tex="\\overline{BC}^2" />의 값은? (단, <Formula tex="\\cos\\theta = \\tfrac{1}{5}" />)</p>
        <div style={{ display: "flex", justifyContent: "center", margin: "10px 0" }}>
          <TriangleDiagram />
        </div>
        <Choices items={[
          { tex: "60" }, { tex: "62" }, { tex: "64" }, { tex: "66" }, { tex: "68" },
        ]} answer={1} />
      </ProblemBody>
    ),
  },
};

const ProblemBody = ({ children }) => (
  <div style={{
    ...applyType("body"),
    color: HF.c.text, lineHeight: 1.75,
  }}>{children}</div>
);

const Choices = ({ items, answer = -1, compact = false }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginTop: 12 }}>
    {items.map((it, i) => {
      const isAnswer = i === answer;
      return (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: compact ? "4px 6px" : "6px 8px",
          background: isAnswer ? HF.c.okSoft : HF.c.surface2,
          border: `1px solid ${isAnswer ? "#A7F3D0" : HF.c.line}`,
          borderRadius: HF.r.r1,
          fontSize: 12,
        }}>
          <span style={{
            display: "grid", placeItems: "center",
            width: 16, height: 16, borderRadius: "50%",
            background: isAnswer ? HF.c.ok : "white",
            color: isAnswer ? "white" : HF.c.muted,
            fontSize: 9, fontWeight: 700, fontFamily: HF.t.mono.family,
            border: `1px solid ${isAnswer ? HF.c.ok : HF.c.line}`,
            flexShrink: 0,
          }}>{i + 1}</span>
          <Formula tex={it.tex} />
        </div>
      );
    })}
  </div>
);

// Test paper styling
const PaperFrame = ({ children, page, header = "수학영역", small, style = {} }) => (
  <div style={{
    background: "white",
    boxShadow: small ? HF.sh.s2 : HF.sh.s3,
    padding: small ? "16px 20px" : "28px 36px",
    border: `1px solid ${HF.c.line}`,
    ...style,
  }}>
    {/* Header */}
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      borderBottom: `1.5px solid ${HF.c.ink}`,
      paddingBottom: 6, marginBottom: small ? 12 : 18,
      fontSize: small ? 9 : 10.5, color: HF.c.text2, fontWeight: 500,
    }}>
      <span>{header}</span>
      {page && <span style={{ fontFamily: HF.t.mono.family }}>{page}</span>}
    </div>
    {children}
  </div>
);

Object.assign(window, {
  Formula, FunctionGraph, TriangleDiagram, NumberLine,
  PROBLEMS, ProblemBody, Choices, PaperFrame,
});
