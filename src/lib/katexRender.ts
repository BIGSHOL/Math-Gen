/**
 * Bulletproof KaTeX 렌더 — **붉은 글씨(katex-error) 절대 금지** (사용자 목표
 * 2026-06-03/04: "사진과 같은 붉은 글씨가 다시는 안나오도록").
 *
 * KaTeX 는 `throwOnError: false` 에서 invalid LaTeX 를 *빨간 raw 텍스트*
 * (`<span class="katex-error">`) 로 표시한다 (CLAUDE.md §2-17). 사용자는 이를
 * "raw LaTeX 노출" 로 오인. preprocessMathText / cleanMalformedLatex 가 대부분
 * 잡지만, *알려지지 않은 새 typo* 는 KaTeX 까지 도달해 빨갛게 뜰 수 있다.
 *
 * 이 모듈은 *렌더 레이어 최종 안전망* — 어떤 입력이 와도 붉은 글씨를 내보내지
 * 않는다:
 *   1차) cleanMalformedLatex + leak 된 `$` 제거 후 렌더.
 *   2차) 1차 결과에 `katex-error` 가 있으면 aggressiveRepair (모든 크기 구분자
 *        제거 + 고립/중복 `\left`·`\right` 정리) 후 재렌더.
 *   폴백) 그래도 error 면 *빨강 대신 중립* `<code class="math-raw">` 로 degrade.
 *
 * MarkdownRenderer (`renderKatex`) 와 KaTeXInline (`renderKatexFragment`) 가
 * *이 한 함수* 를 공유 — 렌더 경로가 분기돼 한쪽만 빨갛게 뜨는 multi-path
 * 함정(§2-17) 을 구조적으로 차단.
 */
import katex from "katex";
import { cleanMalformedLatex } from "./textPreprocess.js";

const KATEX_METRIC_WARN_RE = /No character metrics for/;

/**
 * 1차 렌더가 katex-error 를 낼 때만 시도하는 *공격적* 정리.
 * 정상 식엔 호출 안 되므로(1차 성공) 다소 거칠어도 안전 — 마지막 발악.
 *  - 모든 `\big \Big \bigg \Bigg`(+l/r/m) 제거: 잘못된 위치의 크기 구분자.
 *  - 연속 중복 `\left\left` / `\right\right` 1 개로.
 *  - 짝 없는 고립 `\left` / `\right` (뒤/앞에 구분자 없음) 제거 — KaTeX 의
 *    "Expected delimiter" / "Can't use \right without \left" 에러 원인.
 */
const aggressiveRepair = (s: string): string =>
  s
    .replace(/\\(?:bigg?|Bigg?)[lrm]?\b/g, "")
    .replace(/\\left(?=\s*\\left\b)/g, "")
    .replace(/\\right(?=\s*\\right\b)/g, "")
    // 고립 \left — 뒤에 단일 구분자 [ ( \{ | . 또는 숫자/문자 가 안 오면 제거.
    .replace(/\\left(?!\s*(?:[([|.]|\\[{|]|[A-Za-z0-9]))/g, "")
    // 고립 \right — 뒤에 닫는 구분자 ) ] \} | . 가 안 오면 제거.
    .replace(/\\right(?!\s*(?:[)\].|]|\\[}|]))/g, "");

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const tryRender = (input: string, displayMode: boolean): string =>
  katex.renderToString(input, {
    throwOnError: false,
    strict: false,
    output: "html",
    displayMode,
    // `\htmlClass` 만 허용 — uprightGeometryLabels 의 호(⌒) span 용.
    trust: (ctx) => ctx.command === "\\htmlClass",
  });

/**
 * 절대 붉은 글씨를 반환하지 않는 KaTeX 렌더. 반환값은 항상 안전한 HTML —
 * 성공 시 `.katex` HTML, 최악의 경우 중립 `.math-raw` code.
 */
export const renderKatexSafe = (tex: string, displayMode: boolean): string => {
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && KATEX_METRIC_WARN_RE.test(args[0])) return;
    origWarn.apply(console, args);
  };
  try {
    // 1차 — preprocessMathText 가 어떤 path 로 와도 못 잡은 모델 typo
    // (\left\left, \Bigl\left, \approx, 빈 분수 등) 를 한 번 더 정리 + 중첩/
    // leak 된 `$` 제거(`\$` 리터럴은 보존).
    const base = cleanMalformedLatex(tex).replace(/(?<!\\)\$/g, "");
    let html = tryRender(base, displayMode);
    if (!html.includes("katex-error")) return html;
    // 2차 — 공격적 정리 후 재시도.
    html = tryRender(aggressiveRepair(base), displayMode);
    if (!html.includes("katex-error")) return html;
    // 폴백 — 빨강 대신 중립 code. 사용자는 알람 같은 붉은 글씨 대신 회색
    // 모노스페이스로 "이 식은 렌더 못 함" 을 인지 (드물어야 정상).
    return `<code class="math-raw">${escapeHtml(tex)}</code>`;
  } catch {
    return `<code class="math-raw">${escapeHtml(tex)}</code>`;
  } finally {
    console.warn = origWarn;
  }
};
