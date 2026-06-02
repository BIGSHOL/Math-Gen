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
  // ── 정상 케이스 (회귀 — 깨지면 안 됨) ──
  { name: "normal block", input: "$$\n(x-p)^2 - 4 = 2x\n$$" },
  { name: "normal inline", input: "$f(x) = (x-p)^2 - 4$" },
  { name: "geometry label", input: "$\\overline{AB}$ 와 $\\triangle ABC$" },
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
if (failed > 0) {
  console.error(`\n${failed} case(s) FAILED — 빨간 수식 회귀. 후처리(textPreprocess/sanitize) 보강 필요.`);
  process.exit(1);
}
