/**
 * KaTeX 입력 사전 정규화 — 한국 수학 콘텐츠에서 자주 깨지는 케이스를 보정.
 *
 * Ported from F:\mathlab\src\components\math\shared\text-preprocess.ts.
 * 모든 보정은 실제 한국 수학 콘텐츠에서 발견된 깨진 케이스를 기반으로 한다 —
 * 임의로 손대지 말 것.
 *
 * 변환 목록:
 *  - `\(\)` / `\[\]` → `$...$` / `$$...$$`
 *  - `$A$$B$` glue → `$A$ $B$` (5회 반복으로 안정화)
 *  - 인라인 `$...$` 안에 multiline 환경(`\begin{cases}` 등)이 있으면 `$$...$$`로 승격
 *  - `\dfrac` → `\frac` (KaTeX는 `\dfrac`을 fontdimen 부족으로 그릴 수 있음)
 *  - 유니코드 수학기호 (℃, ℉, Ω, ㎡, …) → LaTeX 명령어
 *  - HTML entity 디코딩 (rehype-raw 미사용 환경 대응)
 *
 * `parseImageTitle`은 마크다운 이미지의 title slot에서 `width%`/`align` 파라미터를
 * 뽑는다 — `![alt](url "50% center")` 패턴.
 */

/** HTML entity 디코딩. */
export const decodeHtmlEntities = (text: string): string =>
  text
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, "&");

/** 마크다운 이미지 title 파싱: "50% center" → { width: '50%', align: 'center' }. */
export const parseImageTitle = (title: string | undefined): { width?: string; align?: string } => {
  if (!title) return {};
  const parts = title.trim().split(/\s+/);
  let width: string | undefined;
  let align: string | undefined;
  for (const part of parts) {
    if (part.endsWith("%")) {
      const num = parseInt(part);
      if (num >= 10 && num <= 100) width = `${num}%`;
    } else if (["left", "center", "right"].includes(part)) {
      align = part;
    }
  }
  return { width, align };
};

/** KaTeX Main-Regular 폰트에 없는 유니코드 → LaTeX 명령어. */
const UNICODE_MATH_MAP: Array<[RegExp, string]> = [
  [/℃/g, "{}^\\circ\\mathrm{C}"],
  [/℉/g, "{}^\\circ\\mathrm{F}"],
  [/Ω/g, "\\Omega"],
  [/Å/g, "\\mathrm{\\AA}"],
  [/㎡/g, "\\mathrm{m}^2"],
  [/㎥/g, "\\mathrm{m}^3"],
  [/㎝/g, "\\mathrm{cm}"],
  [/㎜/g, "\\mathrm{mm}"],
  [/㎞/g, "\\mathrm{km}"],
  [/㎏/g, "\\mathrm{kg}"],
];

const MULTILINE_ENV =
  /\\begin\{(cases|align|aligned|array|matrix|pmatrix|bmatrix|vmatrix|split|gather|gathered)\}/;

/**
 * 수식 정규화 — KaTeX 입력 전 안전 변환.
 *  1) `\(\)` / `\[\]` → `$...$` / `$$...$$`
 *  2) `$A$$B$` → `$A$ $B$` (최대 5회 반복)
 *  3) 인라인 `$...$`에 multi-line 환경 → `$$...$$`로 승격
 *  4) `$...$` / `$$...$$` 내부 `\dfrac` → `\frac`, 유니코드 → LaTeX
 */
export const preprocessMathText = (content: string): string => {
  let out = content
    .replace(/\\\([\s\S]*?\\\)/g, (_m, p1) => `$${p1}$`)
    .replace(/\\\[[\s\S]*?\\\]/g, (_m, p1) => `$$$${p1}$$$$`);

  for (let i = 0; i < 5; i++) {
    const next = out.replace(/\$([^$\n]+)\$\$([^$\n]+)\$/g, (_m, a, b) => `$${a}$ $${b}$`);
    if (next === out) break;
    out = next;
  }

  out = out.replace(
    /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)(?<!\$)\$(?!\$)/g,
    (match, inner) => (MULTILINE_ENV.test(inner) ? `$$${inner}$$` : match),
  );

  out = out.replace(/\$(?!\$)((?:[^$\\]|\\.)*)\$/g, (_m, inner) => {
    let fixed = inner.replace(/\\dfrac(?![a-zA-Z])/g, "\\frac");
    for (const [re, repl] of UNICODE_MATH_MAP) fixed = fixed.replace(re, repl);
    return `$${fixed}$`;
  });

  out = out.replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner) => {
    let fixed = inner.replace(/\\dfrac(?![a-zA-Z])/g, "\\frac");
    for (const [re, repl] of UNICODE_MATH_MAP) fixed = fixed.replace(re, repl);
    return `$$${fixed}$$`;
  });

  return out;
};
