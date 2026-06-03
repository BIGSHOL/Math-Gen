// katexRenderHarness.mts
//
// KaTeX 렌더 회귀 하네스 — 해설/OCR 의 *저장된* 수식 텍스트가 MarkdownRenderer
// 의 렌더 경로(preprocessMathText → `$$/$` 추출 → katex.renderToString)를
// 통과할 때 *빨간 에러(katex-error)* 나 *leak 된 `$`* 가 없는지 검증한다.
//
// 배경: KaTeX 는 invalid LaTeX 를 `throwOnError:false` 에서 빨간 raw 텍스트로
// 표시한다(CLAUDE.md §2-17). 사용자는 이를 "raw LaTeX 노출"로 오인. 모델이
// 흘리는 typo / 중첩 delimiter / 잘못된 명령어가 렌더 경로 어디서도 안 잡히면
// 화면에 빨갛게 뜬다. 이 하네스는 그런 케이스를 *커밋 전에* 잡는다.
//
// 실행:  npx tsx scripts/katexRenderHarness.mts
// 결과:  모두 통과 → exit 0 / 하나라도 실패 → 실패 목록 출력 후 exit 1
//
// 새 사용자 보고(빨간 수식)가 오면: 그 *저장된 raw 문자열* 을 CASES 에 추가하고
// 하네스를 돌려 실패를 재현 → 후처리(textPreprocess/sanitize) 보강 → 통과 확인.

import katex from "katex";
import { preprocessMathText } from "../src/lib/textPreprocess.js";
import { renderKatexSafe } from "../src/lib/katexRender.js";

/**
 * 추출된 inner 를 *plain* KaTeX 로 렌더 — cleanMalformedLatex / `$`-strip 같은
 * renderKatex 의 *final guard* 를 일부러 적용하지 않는다. 즉 "preprocessMathText
 * (후처리) 만으로 KaTeX-renderable 한가" 를 검증한다. guard 에 기대지 않고
 * 후처리 자체가 철저한지 보는 더 엄격한 테스트(사용자 요청: 후보정 철저히).
 * (실제 렌더 경로엔 guard 가 한 겹 더 있어 사용자는 더 안전하다.)
 */
const renderKatexHtml = (tex: string, displayMode: boolean): { error: boolean } => {
  try {
    const html = katex.renderToString(tex, {
      throwOnError: false,
      strict: false,
      output: "html",
      displayMode,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      trust: (ctx: any) => ctx.command === "\\htmlClass",
    });
    return { error: /katex-error/.test(html) };
  } catch {
    return { error: true };
  }
};

/** MarkdownRenderer.prerenderAllKatex 복제 (block `$$` 먼저, inline `$` 다음). */
const scan = (text: string): { katexErrors: string[]; leftoverDollar: number } => {
  const katexErrors: string[] = [];
  let out = text.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
    if (renderKatexHtml(tex.trim(), true).error) katexErrors.push(`block: ${tex.trim()}`);
    return "";
  });
  out = out.replace(/\$([^$\n]+?)\$/g, (_m, tex: string) => {
    if (renderKatexHtml(tex, false).error) katexErrors.push(`inline: ${tex}`);
    return "";
  });
  return { katexErrors, leftoverDollar: (out.match(/\$/g) || []).length };
};

interface Case {
  name: string;
  /** 저장(post-sanitize)된 수식 텍스트 — MarkdownRenderer 가 받는 형태. */
  input: string;
}

const CASES: Case[] = [
  // ── 사용자 보고 2026-06-02 — `$$...$$` 안에 `$...$` 중첩 (문항 12 α³+β³) ──
  {
    name: "nested-$ in $$ block (reported)",
    input: "$$\n$\\displaystyle \\alpha^3 + \\beta^3 = (-2)^3 + 2^3 = -8 + 8 = 0$\n$$",
  },
  { name: "nested two inlines in block", input: "$$ A = $x$ + $y$ $$" },
  { name: "nested frac inline in block", input: "$$\n$\\frac{1}{2} + \\frac{1}{3}$\n$$" },
  // ── CLAUDE.md §2-17 모델 typo 카탈로그 ──
  { name: "double \\left\\left", input: "$\\left\\left\\{ x \\right\\right\\}$" },
  { name: "approx ≈", input: "$x \\approx 1.5$ 그리고 $y ≈ 2$" },
  { name: "empty frac", input: "$\\frac{a}{}$ 과 $\\frac{}{b}$" },
  { name: "double \\frac\\frac", input: "$\\frac\\frac{1}{2}$" },
  { name: "multi-letter boxed", input: "정답: $\\boxed{ABCD}$" },
  // ── 한글-수식 혼합 / 가분수 / 유니코드 ──
  { name: "improper fraction → mixed", input: "$\\frac{7}{3}$ 의 값" },
  { name: "unicode ≤ ≥ ×", input: "$0 ≤ a ≤ 2$, $3 × 4 = 12$" },
  // ── 사용자 보고 2026-06-03 — commentary 의 `$` 없는 raw LaTeX 줄 ──
  // (KaTeXInline 경로: $ 없이 흘러나온 줄 + \Bigl\left + \tfrac 동시)
  {
    name: "raw line: \\Bigl\\left + \\tfrac (no $, reported)",
    input:
      "유효한 P(x) 7개를 합산한다.\n\n\\displaystyle Q(x)=\\Bigl\\left(-\\tfrac{1}{2}+\\tfrac{3}{2}-\\tfrac{1}{3}+1\\Bigr\\right)x^2+\\Bigl\\left(\\tfrac{1}{2}-\\tfrac{3}{2}\\Bigr\\right)x+6",
  },
  { name: "\\Bigl\\left inside $ (reported)", input: "$\\Bigl\\left( x \\Bigr\\right)$" },
  { name: "\\Bigg\\left + \\Bigg\\right", input: "$\\Bigg\\left[ \\frac{1}{2} \\Bigg\\right]$" },
  { name: "raw line: only \\tfrac (no $)", input: "\\tfrac{1}{2} = \\tfrac{2}{4} 이므로" },
  { name: "raw line: \\cfrac (no $)", input: "\\cfrac{1}{2+\\cfrac{1}{3}} 형태" },
  // autoSizeBrackets 이중 wrap 회귀 — 모델이 이미 \left( 로 감싼 경우 \left\left 금지.
  { name: "model already \\left( \\frac \\right)", input: "$\\left( \\frac{1}{2} \\right)$" },
  // ── 정상 케이스 (회귀 — 깨지면 안 됨) ──
  { name: "normal block", input: "$$\n(x-p)^2 - 4 = 2x\n$$" },
  { name: "normal inline", input: "$f(x) = (x-p)^2 - 4$" },
  { name: "geometry label", input: "$\\overline{AB}$ 와 $\\triangle ABC$" },
  // valid \Bigl( (paren 직접) — \left 미동반이므로 제거되면 안 됨.
  { name: "valid \\Bigl( ... \\Bigr) (must survive)", input: "$\\Bigl( \\frac{a}{b} \\Bigr)$" },
];

let failed = 0;
for (const c of CASES) {
  const pre = preprocessMathText(c.input);
  const { katexErrors, leftoverDollar } = scan(pre);
  const ok = katexErrors.length === 0 && leftoverDollar === 0;
  if (ok) {
    console.log(`  PASS  ${c.name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${c.name}`);
    console.log(`        input: ${JSON.stringify(c.input)}`);
    console.log(`        preprocessed: ${JSON.stringify(pre)}`);
    if (katexErrors.length) console.log(`        katex errors: ${JSON.stringify(katexErrors)}`);
    if (leftoverDollar) console.log(`        leftover $: ${leftoverDollar}`);
  }
}

console.log(`\n${CASES.length - failed}/${CASES.length} passed`);

// ── renderKatexSafe 보증 — 붉은 글씨(katex-error) *절대* 안 나옴 ──
// 사용자 목표 2026-06-04: "사진과 같은 붉은 글씨가 다시는 안나오도록". 후처리가
// 못 잡은 깨진 입력이 와도 렌더 레이어가 빨강 대신 .math-raw 중립 폴백으로
// degrade 하는지 검증. 어떤 입력이든 결과에 "katex-error" 가 없어야 한다.
console.log("\n[renderKatexSafe 폴백 보증]");
const GUARD_CASES: string[] = [
  "\\Bigl\\left( x \\Bigr\\right)", // 보고된 typo
  "\\frac{a}{}", // 빈 분수
  "\\left\\left\\{ x \\right\\right\\}", // 중복 delimiter
  "\\sqrt{", // 미완성 인수
  "\\begin{cases} x \\\\ y", // 미닫힘 환경
  "totally \\unknowncmd{x} broken", // 미지 명령
  "x \\frac \\frac", // 깨진 frac 연쇄
  "\\right) only", // 짝 없는 \right
];
let guardFailed = 0;
for (const g of GUARD_CASES) {
  for (const dm of [false, true]) {
    const html = renderKatexSafe(g, dm);
    const bad = html.includes("katex-error") || html.length === 0;
    const tag = dm ? "block" : "inline";
    if (bad) {
      guardFailed++;
      console.log(`  FAIL  guard(${tag}): ${JSON.stringify(g)} → katex-error 노출`);
    } else {
      console.log(`  PASS  guard(${tag}): ${JSON.stringify(g)}`);
    }
  }
}
console.log(
  `\n${GUARD_CASES.length * 2 - guardFailed}/${GUARD_CASES.length * 2} guard passed`,
);

if (failed > 0 || guardFailed > 0) {
  if (failed > 0)
    console.error(`\n${failed} case(s) FAILED — 빨간 수식 회귀. 후처리(textPreprocess/sanitize) 보강 필요.`);
  if (guardFailed > 0)
    console.error(`\n${guardFailed} guard FAILED — renderKatexSafe 가 붉은 글씨를 냄. 폴백 보강 필요.`);
  process.exit(1);
}
