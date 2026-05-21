import { useEffect, useState } from "react";
import katex from "katex";
import { Btn, Card, Chip, Divider, Eyebrow, Heading, TopBar } from "@app/components/ui";
import MarkdownRenderer from "@app/components/math/MarkdownRenderer";

/**
 * KaTeX rendering smoke-test page (URL gate `?katex`).
 *
 * Purpose: visually confirm every math symbol we care about — especially the
 * ones that come from the size-glyph fonts (√, ∑, ∫, large parens) — is
 * actually rendered on screen. If a glyph slot is blank or visibly off,
 * we know the corresponding KaTeX font failed to load.
 *
 * Two render paths are shown side-by-side per row:
 *   - Direct  : `katex.renderToString` with `output: "html"`. Uses CSS
 *                fonts (KaTeX_Main / KaTeX_Math / KaTeX_Size1-4 / KaTeX_AMS).
 *   - Pipeline: passed through our MarkdownRenderer (the path used in OCR
 *                results) so we can confirm the table-pre-render +
 *                normalize-svg pipeline doesn't strip anything.
 *
 * The header strip lists every KaTeX font with its live load state and
 * a fetch test, so you can see at a glance whether the bundle is intact.
 */

interface SymbolCase {
  label: string;
  latex: string;
  /** Description of what to verify. */
  expect: string;
  /** Category for grouping rows in the table. */
  group: string;
}

const CASES: SymbolCase[] = [
  // ── 분수·근호 ─────────────────────────────────────────────
  { group: "분수·근호", label: "분수", latex: "\\frac{1}{2}", expect: "1/2 — 큰 사이즈 유지" },
  { group: "분수·근호", label: "중첩 분수", latex: "\\frac{1}{1+\\frac{1}{x}}", expect: "분수 안 분수도 큰 사이즈" },
  { group: "분수·근호", label: "혼합 분수", latex: "2\\frac{1}{3}", expect: "정수 옆에 분수" },
  { group: "분수·근호", label: "단순 sqrt", latex: "\\sqrt{5}", expect: "√ + 5" },
  { group: "분수·근호", label: "분수 안 sqrt", latex: "\\frac{\\sqrt{5}}{2}", expect: "분자에 √5" },
  { group: "분수·근호", label: "이중 sqrt", latex: "\\sqrt{2} + \\sqrt{3}", expect: "각각 별도 √" },
  { group: "분수·근호", label: "큰 sqrt", latex: "\\sqrt{\\frac{a^2+b^2}{c^2}}", expect: "큰 √ + 안에 분수" },
  { group: "분수·근호", label: "세제곱근", latex: "\\sqrt[3]{x}", expect: "√ 좌상단 3" },
  { group: "분수·근호", label: "n제곱근", latex: "\\sqrt[n]{a^n}", expect: "√ 좌상단 n + 안 a^n" },

  // ── 지수·첨자 ─────────────────────────────────────────────
  { group: "지수·첨자", label: "지수", latex: "x^{2n+1}", expect: "x 우상단 2n+1" },
  { group: "지수·첨자", label: "첨자", latex: "a_{n+1}", expect: "a 우하단 n+1" },
  { group: "지수·첨자", label: "지수+첨자", latex: "x_i^2", expect: "x 우하단 i, 우상단 2" },
  { group: "지수·첨자", label: "이중 지수", latex: "a^{a^a}", expect: "a 위에 a 위에 a" },
  { group: "지수·첨자", label: "수열", latex: "a_n, a_{n+1}, S_n = \\sum_{k=1}^{n} a_k", expect: "일반항+합" },

  // ── 부등·등호 ─────────────────────────────────────────────
  { group: "부등·등호", label: "기본 부등호", latex: "a < b \\le c < d \\ge e", expect: "<, ≤, ≥" },
  { group: "부등·등호", label: "같지 않음", latex: "a \\ne b \\approx c \\equiv d", expect: "≠, ≈, ≡" },
  { group: "부등·등호", label: "합동·닮음", latex: "\\triangle ABC \\cong \\triangle DEF \\sim \\triangle GHI", expect: "≅, ∽ (∼)" },
  { group: "부등·등호", label: "훨씬 큰/작은", latex: "a \\ll b \\gg c", expect: "≪, ≫" },
  { group: "부등·등호", label: "비례", latex: "y \\propto x", expect: "∝" },

  // ── 부호·연산 ─────────────────────────────────────────────
  { group: "부호·연산", label: "± 와 ∓", latex: "x = -1 \\pm 2\\sqrt{2},\\ y = -1 \\mp \\sqrt{3}", expect: "±, ∓" },
  { group: "부호·연산", label: "곱·나눗셈", latex: "a \\times b \\div c \\cdot d", expect: "×, ÷, ·" },
  { group: "부호·연산", label: "합성", latex: "(f \\circ g)(x) = f(g(x))", expect: "∘ (small ring)" },
  { group: "부호·연산", label: "별·점곱", latex: "a \\ast b,\\ \\vec{a} \\cdot \\vec{b}", expect: "∗, · 벡터곱" },

  // ── 괄호·절댓값 ───────────────────────────────────────────
  { group: "괄호·절댓값", label: "큰 괄호", latex: "\\left(\\frac{a}{b}\\right)^2", expect: "분수 감싸는 ( )" },
  { group: "괄호·절댓값", label: "대괄호", latex: "\\left[ x \\right]", expect: "[ ] — 가우스 기호" },
  { group: "괄호·절댓값", label: "중괄호", latex: "\\left\\{ x \\mid x > 0 \\right\\}", expect: "{ }" },
  { group: "괄호·절댓값", label: "꺾쇠", latex: "\\langle u, v \\rangle", expect: "⟨ ⟩ — 내적/순서쌍" },
  { group: "괄호·절댓값", label: "절댓값·노름", latex: "|x| + \\|v\\|", expect: "|x| 와 ‖v‖" },
  { group: "괄호·절댓값", label: "바닥/천장", latex: "\\lfloor x \\rfloor,\\ \\lceil x \\rceil", expect: "⌊ ⌋ ⌈ ⌉" },

  // ── 기하 표기 (점·도형 라벨은 직립 Roman) ─────────────────
  { group: "기하 표기", label: "점 A", latex: "A", expect: "Roman 직립 A (이탤릭 ✗)" },
  { group: "기하 표기", label: "원 O", latex: "O", expect: "Roman 직립 O" },
  { group: "기하 표기", label: "사각형 ABCD", latex: "ABCD", expect: "직립 ABCD" },
  { group: "기하 표기", label: "선분 AB", latex: "\\overline{AB}", expect: "AB 위 가로선, AB 직립" },
  { group: "기하 표기", label: "반직선 AB", latex: "\\overrightarrow{AB}", expect: "AB 위 → , AB 직립" },
  { group: "기하 표기", label: "왼쪽 반직선", latex: "\\overleftarrow{AB}", expect: "AB 위 ←" },
  { group: "기하 표기", label: "직선 AB", latex: "\\overleftrightarrow{AB}", expect: "AB 위 ↔" },
  { group: "기하 표기", label: "호 AB (widehat→overgroup)", latex: "\\widehat{AB}", expect: "AB 폭에 맞춘 넓은 ⌒ 곡선" },
  { group: "기하 표기", label: "호 ABC (3자)", latex: "\\widehat{ABC}", expect: "ABC 폭에 맞춰 더 긴 곡선" },
  { group: "기하 표기", label: "호 AB (frown→overgroup)", latex: "\\overset{\\frown}{AB}", expect: "AB 폭 맞춘 넓은 ⌒" },
  { group: "기하 표기", label: "벡터 v (단일)", latex: "\\vec{v}", expect: "italic v 위 좁은 →" },
  { group: "기하 표기", label: "벡터 A (단일)", latex: "\\vec{A}", expect: "Roman A 위 좁은 →" },
  { group: "기하 표기", label: "벡터 AB (다중)", latex: "\\vec{AB}", expect: "Roman AB 위 폭 늘어난 →" },
  { group: "기하 표기", label: "벡터 ABC (3자)", latex: "\\vec{ABC}", expect: "Roman ABC 위 더 긴 →" },
  { group: "기하 표기", label: "삼각형 ABC", latex: "\\triangle ABC", expect: "△ + 직립 ABC" },
  { group: "기하 표기", label: "사각형 ABCD", latex: "\\square ABCD", expect: "□ + 직립 ABCD" },
  { group: "기하 표기", label: "각 ABC", latex: "\\angle ABC", expect: "∠ + 직립 ABC" },
  { group: "기하 표기", label: "측정각", latex: "\\measuredangle ABC", expect: "측정 ∠ + 직립 ABC" },
  { group: "기하 표기", label: "평행", latex: "\\overline{AB} \\parallel \\overline{CD}", expect: "∥, 양쪽 모두 직립" },
  { group: "기하 표기", label: "수직", latex: "\\overline{AB} \\perp \\overline{CD}", expect: "⊥" },
  { group: "기하 표기", label: "프라임 라벨", latex: "\\overline{A'B'}", expect: "직립 A'B' 위 가로선" },

  // ── 삼각함수·로그 ─────────────────────────────────────────
  { group: "삼각함수·로그", label: "기본 삼각", latex: "\\sin\\theta + \\cos\\theta = ?", expect: "sin, cos 직립" },
  { group: "삼각함수·로그", label: "탄·시컨트", latex: "\\tan x,\\ \\sec x,\\ \\csc x,\\ \\cot x", expect: "tan/sec/csc/cot" },
  { group: "삼각함수·로그", label: "역삼각", latex: "\\sin^{-1} x,\\ \\arccos x", expect: "sin⁻¹, arccos" },
  { group: "삼각함수·로그", label: "쌍곡선", latex: "\\sinh x,\\ \\cosh x,\\ \\tanh x", expect: "sinh/cosh/tanh" },
  { group: "삼각함수·로그", label: "log 기본", latex: "\\log x,\\ \\ln x", expect: "log, ln 직립" },
  { group: "삼각함수·로그", label: "log 밑수", latex: "\\log_{10} x,\\ \\log_2 8 = 3", expect: "log 우하단 밑수" },
  { group: "삼각함수·로그", label: "지수 함수", latex: "e^x,\\ e^{i\\pi} + 1 = 0", expect: "e^x, 오일러 등식" },

  // ── 극한·합·곱 ───────────────────────────────────────────
  { group: "극한·합·곱", label: "합 ∑", latex: "\\sum_{i=1}^{n} i^2", expect: "큰 ∑ + limits 위/아래" },
  { group: "극한·합·곱", label: "곱 ∏", latex: "\\prod_{k=1}^{n} k = n!", expect: "큰 ∏ + n!" },
  { group: "극한·합·곱", label: "극한", latex: "\\lim_{x \\to \\infty} f(x)", expect: "lim 아래 x→∞" },
  { group: "극한·합·곱", label: "한방향 극한", latex: "\\lim_{x \\to a^+} f(x)", expect: "x→a⁺ (오른쪽 극한)" },
  { group: "극한·합·곱", label: "상극한·하극한", latex: "\\limsup_{n \\to \\infty} a_n,\\ \\liminf_{n \\to \\infty} a_n", expect: "limsup, liminf" },
  { group: "극한·합·곱", label: "수열 합", latex: "S_n = a_1 + a_2 + \\cdots + a_n", expect: "⋯ (cdots)" },

  // ── 적분·미분 ────────────────────────────────────────────
  { group: "적분·미분", label: "정적분", latex: "\\int_a^b f(x)\\,dx", expect: "큰 ∫, a/b는 옆에 첨자" },
  { group: "적분·미분", label: "부정적분", latex: "\\int f(x)\\,dx = F(x) + C", expect: "∫ + 상수 C" },
  { group: "적분·미분", label: "이중적분", latex: "\\iint_D f\\,dA", expect: "∬" },
  { group: "적분·미분", label: "삼중적분", latex: "\\iiint_V f\\,dV", expect: "∭" },
  { group: "적분·미분", label: "선적분", latex: "\\oint_C \\vec{F} \\cdot d\\vec{r}", expect: "∮ + 벡터 점곱" },
  { group: "적분·미분", label: "도함수 표기", latex: "f'(x),\\ f''(x),\\ f^{(n)}(x)", expect: "프라임 표기" },
  { group: "적분·미분", label: "라이프니츠", latex: "\\frac{dy}{dx},\\ \\frac{d^2 y}{dx^2}", expect: "dy/dx, 2차 도함수" },
  { group: "적분·미분", label: "편미분", latex: "\\frac{\\partial f}{\\partial x},\\ \\frac{\\partial^2 f}{\\partial x \\partial y}", expect: "∂f/∂x" },
  { group: "적분·미분", label: "나블라", latex: "\\nabla f,\\ \\nabla \\cdot \\vec{F}", expect: "∇" },

  // ── 집합·논리 ────────────────────────────────────────────
  { group: "집합·논리", label: "수의 집합", latex: "\\mathbb{N},\\ \\mathbb{Z},\\ \\mathbb{Q},\\ \\mathbb{R},\\ \\mathbb{C}", expect: "ℕ ℤ ℚ ℝ ℂ" },
  { group: "집합·논리", label: "원소·부분집합", latex: "x \\in A,\\ y \\notin B,\\ A \\subset B,\\ C \\subseteq D", expect: "∈, ∉, ⊂, ⊆" },
  { group: "집합·논리", label: "교·합집합", latex: "A \\cap B,\\ A \\cup B,\\ A \\setminus B", expect: "∩, ∪, ∖" },
  { group: "집합·논리", label: "공집합·여집합", latex: "\\emptyset,\\ A^c", expect: "∅, 여집합" },
  { group: "집합·논리", label: "전체·존재", latex: "\\forall x,\\ \\exists y", expect: "∀, ∃" },
  { group: "집합·논리", label: "함의·동치", latex: "p \\Rightarrow q,\\ p \\Leftrightarrow q", expect: "⇒, ⇔" },
  { group: "집합·논리", label: "큰 합집합·교집합", latex: "\\bigcup_{n=1}^{\\infty} A_n,\\ \\bigcap_{n=1}^{\\infty} B_n", expect: "큰 ⋃, ⋂" },

  // ── 확률·조합 ────────────────────────────────────────────
  { group: "확률·조합", label: "조합 (binom)", latex: "\\binom{n}{r}", expect: "괄호 안 n/r" },
  { group: "확률·조합", label: "조합 (전통)", latex: "{}_n C_r,\\ {}_n P_r", expect: "ₙCᵣ, ₙPᵣ" },
  { group: "확률·조합", label: "계승", latex: "n! = n(n-1)(n-2)\\cdots 1", expect: "n! 표기" },
  { group: "확률·조합", label: "확률", latex: "P(A \\cap B) = P(A) P(B|A)", expect: "조건부 확률" },
  { group: "확률·조합", label: "기댓값·분산", latex: "E(X),\\ V(X),\\ \\sigma(X)", expect: "E·V·σ 직립" },

  // ── 그리스 문자 ──────────────────────────────────────────
  { group: "그리스 문자", label: "소문자 a", latex: "\\alpha, \\beta, \\gamma, \\delta, \\epsilon, \\zeta", expect: "α β γ δ ε ζ" },
  { group: "그리스 문자", label: "소문자 b", latex: "\\eta, \\theta, \\iota, \\kappa, \\lambda, \\mu", expect: "η θ ι κ λ μ" },
  { group: "그리스 문자", label: "소문자 c", latex: "\\nu, \\xi, \\pi, \\rho, \\sigma, \\tau", expect: "ν ξ π ρ σ τ" },
  { group: "그리스 문자", label: "소문자 d", latex: "\\phi, \\chi, \\psi, \\omega, \\varepsilon, \\varphi", expect: "φ χ ψ ω + 변형" },
  { group: "그리스 문자", label: "대문자", latex: "\\Gamma, \\Delta, \\Theta, \\Lambda, \\Sigma, \\Phi, \\Psi, \\Omega", expect: "Γ Δ Θ Λ Σ Φ Ψ Ω" },

  // ── 특수 기호·무한 ───────────────────────────────────────
  { group: "특수 기호", label: "무한대", latex: "\\infty,\\ -\\infty", expect: "∞ 양·음" },
  { group: "특수 기호", label: "프라임/별/십자", latex: "x',\\ x'',\\ x^*,\\ x^\\dagger", expect: "′ ′′ ∗ †" },
  { group: "특수 기호", label: "점 3개", latex: "1, 2, \\ldots, n", expect: "… (low dots)" },
  { group: "특수 기호", label: "수직 점", latex: "\\vdots,\\ \\ddots", expect: "⋮, ⋱" },
  { group: "특수 기호", label: "각도 기호", latex: "30^\\circ,\\ 90^\\circ", expect: "° (circ)" },
  { group: "특수 기호", label: "체크/엑스", latex: "\\checkmark,\\ \\times", expect: "✓ ✗ (× 사용)" },

  // ── 행렬·다중식 ──────────────────────────────────────────
  { group: "행렬·다중식", label: "행렬 (괄호)", latex: "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}", expect: "2×2 ( )" },
  { group: "행렬·다중식", label: "행렬식 (세로선)", latex: "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}", expect: "2×2 | |" },
  { group: "행렬·다중식", label: "케이스 식", latex: "f(x) = \\begin{cases} x & (x \\ge 0) \\\\ -x & (x < 0) \\end{cases}", expect: "조건 분기" },
  { group: "행렬·다중식", label: "정렬식", latex: "\\begin{aligned} a + b &= c \\\\ d - e &= f \\end{aligned}", expect: "= 정렬" },

  // ── 종합 ────────────────────────────────────────────────
  { group: "종합", label: "근의공식", latex: "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}", expect: "전체 분수 + 분자 sqrt" },
  { group: "종합", label: "정적분 평균", latex: "\\bar{f} = \\frac{1}{b-a}\\int_a^b f(x)\\,dx", expect: "분수 + 정적분" },
  { group: "종합", label: "테일러", latex: "f(x) = \\sum_{n=0}^{\\infty} \\frac{f^{(n)}(a)}{n!}(x-a)^n", expect: "∑ + 분수 + 도함수" },
  { group: "종합", label: "사인법칙", latex: "\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C} = 2R", expect: "세 분수 = 2R" },
  { group: "종합", label: "코사인법칙", latex: "a^2 = b^2 + c^2 - 2bc\\cos A", expect: "cos A — A 직립" },
  { group: "종합", label: "원의 넓이", latex: "S = \\pi r^2", expect: "πr²" },
];

const KATEX_FONTS = [
  "KaTeX_Main",
  "KaTeX_Math",
  "KaTeX_Size1",
  "KaTeX_Size2",
  "KaTeX_Size3",
  "KaTeX_Size4",
  "KaTeX_AMS",
  "KaTeX_Caligraphic",
  "KaTeX_Fraktur",
  "KaTeX_SansSerif",
  "KaTeX_Script",
  "KaTeX_Typewriter",
];

interface FontStatus {
  name: string;
  loaded: boolean;
  woff2Url?: string;
  woff2Status?: number | string;
}

const FontPanel = () => {
  const [fonts, setFonts] = useState<FontStatus[]>([]);
  useEffect(() => {
    (async () => {
      // Force every KaTeX font family to load by mounting a hidden div with
      // text in each family — document.fonts.check() is lazy by default.
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;left:-9999px;top:-9999px;font-size:16px";
      KATEX_FONTS.forEach((f) => {
        const s = document.createElement("span");
        s.style.fontFamily = `"${f}"`;
        s.textContent = "Aa∑∫√";
        probe.appendChild(s);
      });
      document.body.appendChild(probe);
      // Force a re-layout so the font is requested.
      void probe.offsetHeight;
      await document.fonts.ready;
      await new Promise((r) => setTimeout(r, 500));

      const result: FontStatus[] = [];
      for (const name of KATEX_FONTS) {
        const loaded = document.fonts.check(`16px "${name}"`);
        // Try to fetch the woff2 file from the Vite dev server to confirm it's reachable.
        // Vite serves /node_modules/katex/dist/fonts/*.woff2 transparently via the
        // import side-effect of katex/dist/katex.min.css.
        let woff2Status: number | string = "";
        const url = `/node_modules/katex/dist/fonts/${name}-Regular.woff2`;
        try {
          const res = await fetch(url, { method: "HEAD" });
          woff2Status = res.status;
        } catch (e) {
          woff2Status = (e as Error).message;
        }
        result.push({ name, loaded, woff2Url: url, woff2Status });
      }
      setFonts(result);
      probe.remove();
    })();
  }, []);

  return (
    <Card pad={16}>
      <Eyebrow className="mb-2">KaTeX 폰트 로드 상태</Eyebrow>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-caption">
        {fonts.length === 0 && <span className="text-muted">확인 중…</span>}
        {fonts.map((f) => (
          <div
            key={f.name}
            className={`px-2 py-1 rounded-r1 border ${f.loaded ? "border-ok/30 bg-ok-soft" : "border-warn/30 bg-warn-soft"}`}
          >
            <div className="font-mono font-semibold">{f.name}</div>
            <div className="text-muted">
              loaded: {f.loaded ? "✓" : "✗"} · HEAD: {String(f.woff2Status)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

const DirectKatex = ({ latex, displayMode }: { latex: string; displayMode: boolean }) => {
  const html = (() => {
    try {
      return katex.renderToString(latex, {
        throwOnError: false,
        strict: false,
        output: "html",
        displayMode,
      });
    } catch (e) {
      return `<span class="text-warn-ink">render error: ${(e as Error).message}</span>`;
    }
  })();
  return (
    <div
      className="px-3 py-2 bg-white rounded-r1 border border-line"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export const KatexTestScreen = () => {
  return (
    <div className="w-full h-screen overflow-y-auto bg-bg text-text font-sans">
      <TopBar
        left={
          <>
            <Btn
              kind="ghost"
              size="sm"
              icon="x"
              onClick={() => {
                window.location.search = "";
              }}
            >
              종료
            </Btn>
            <Divider vertical className="h-[18px]" />
            <span className="text-body">
              KaTeX 렌더링 테스트
              <Chip tone="accent" size="sm" className="ml-2">
                ?katex
              </Chip>
            </span>
          </>
        }
      />
      <div className="max-w-[2400px] mx-auto px-6 py-8 space-y-6">
        <Heading level="h1" sub="KaTeX 모든 폰트/기호가 실제로 렌더링되는지 시각 검증.">
          KaTeX 렌더 테스트
        </Heading>

        <FontPanel />

        <Card pad={16}>
          <Eyebrow className="mb-3">기호별 렌더링 비교</Eyebrow>
          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_1fr] gap-x-3 gap-y-2 text-small items-center">
            <div className="font-semibold text-muted">케이스 / LaTeX</div>
            <div className="font-semibold text-muted">Direct (katex.renderToString)</div>
            <div className="font-semibold text-muted">Pipeline (MarkdownRenderer)</div>

            {CASES.map((c, i) => {
              const prev = i > 0 ? CASES[i - 1].group : null;
              const isNewGroup = c.group !== prev;
              return (
                <div
                  key={i}
                  className="contents"
                  style={{ display: "contents" }}
                >
                  {isNewGroup && (
                    <div className="col-span-full mt-4 mb-1 py-1 px-2 bg-surface2 border-l-4 border-accent text-text font-semibold text-body">
                      {c.group}
                    </div>
                  )}
                  <div className="border-t border-line pt-2">
                    <div className="font-semibold">{c.label}</div>
                    <code className="text-caption text-muted font-mono break-all">{c.latex}</code>
                    <div className="text-caption text-muted mt-0.5">기대: {c.expect}</div>
                  </div>
                  <div className="border-t border-line pt-2">
                    <DirectKatex latex={c.latex} displayMode={false} />
                  </div>
                  <div className="border-t border-line pt-2">
                    <MarkdownRenderer content={`$${c.latex}$`} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card pad={16}>
          <Eyebrow className="mb-3">블록 수식 (displayMode)</Eyebrow>
          <DirectKatex latex={"x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"} displayMode={true} />
          <div className="mt-2">
            <MarkdownRenderer content={"$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$"} />
          </div>
        </Card>
      </div>
    </div>
  );
};

export default KatexTestScreen;
