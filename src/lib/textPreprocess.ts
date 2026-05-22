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
 * 모든 인라인 수식(`$...$`)에 `\displaystyle`을 자동 주입해 display 사이즈로
 * 그리도록 강제한다.
 *
 * 효과:
 *  - `\frac{a}{b}`: 분모/분자가 inline 모드에서 축소되는 기본 동작 차단 →
 *    교과서 분수처럼 큰 사이즈 유지.
 *  - `\sqrt`: 큰 사이즈로 그려짐(주로 내부 분수와 결합될 때 두드러짐).
 *  - `\int` / `\oint`: 적분 기호 자체가 키 큰 모양 (한국 교과서 표기).
 *    첨자는 KaTeX 기본대로 옆에 붙는 subscript/superscript 유지.
 *  - `\sum` / `\prod` / `\lim` / `\max` / `\bigcup`: 기호가 커지면서 동시에
 *    첨자가 아래/위에 쌓이는 limits 스타일로 자동 전환.
 *  - 일반 변수 `x`, `y`, 첨자 `x_1`, `x^2`: 거의 변화 없음 — display 모드에서도
 *    이런 단순 토큰은 inline과 같은 폰트/크기.
 *
 * 사용자가 명시적으로 `\textstyle` / `\scriptstyle` 등을 적었다면 그 directive를
 * 존중하고 건드리지 않는다.
 *
 * 한국 K-12 수학 콘텐츠 기준 — 분수가 인라인에서 작아져 가독성이 떨어지는
 * KaTeX 기본 동작이 사용자 경험과 안 맞는다는 피드백을 반영. mathlab도
 * 같은 처리를 한다.
 */
const HAS_STYLE_DIRECTIVE = /\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\b/;

/**
 * 괄호 내용이 "키 큰" 라텍스 구조(`\int`, `\frac`, `\sum`, `\sqrt`, `\binom`
 * 등) 를 품을 때 자동으로 `\left(...\right)` / `\left\{...\right\}` 로
 * 감싸서 괄호 높이가 내용에 맞게 늘어나도록 한다. KaTeX 기본 `()` `\{\}`
 * 는 고정 높이라 안에 ∫·분수가 있으면 너무 작아 보인다.
 *
 * 처리 대상: `( ... )`, `\{ ... \}`. `[ ... ]` 는 `\sqrt[n]{}` 와 같이 옵션
 * 인자로 자주 쓰여 위험하므로 건드리지 않음.
 *
 * 알고리즘: brace 균형을 맞춰 매칭되는 쌍을 찾고, 내부에 TALL_CMDS 패턴이
 * 들어 있으면 wrap. 중첩된 경우 재귀로 안쪽부터 처리해서 모든 단계에서
 * 사이즈가 맞도록 한다. 이미 `\left/\right` 가 명시된 부분은 다시 wrap
 * 하지 않는다 (regex로 매치 안 됨).
 */
const TALL_CMDS =
  /\\(?:int|iint|iiint|oint|sum|prod|coprod|frac|dfrac|tfrac|cfrac|sqrt|binom|dbinom|tbinom|lim|limsup|liminf|bigcup|bigcap|bigvee|bigwedge|bigoplus|bigotimes)\b/;

const findMatchingClose = (
  s: string,
  startIdx: number,
  openLen: number,
  openTest: (s: string, i: number) => boolean,
  closeTest: (s: string, i: number) => boolean,
): number => {
  let depth = 1;
  let j = startIdx + openLen;
  while (j < s.length) {
    if (openTest(s, j)) {
      depth++;
      j += openLen;
      continue;
    }
    if (closeTest(s, j)) {
      depth--;
      if (depth === 0) return j;
      j += openLen;
      continue;
    }
    j++;
  }
  return -1;
};

const autoSizeBrackets = (math: string): string => {
  let out = "";
  let i = 0;
  const len = math.length;
  while (i < len) {
    // `( ... )` 짝
    if (math[i] === "(") {
      const close = findMatchingClose(
        math,
        i,
        1,
        (s, k) => s[k] === "(",
        (s, k) => s[k] === ")",
      );
      if (close > i) {
        const inner = math.slice(i + 1, close);
        const needsSize = TALL_CMDS.test(inner);
        const processedInner = autoSizeBrackets(inner);
        out += needsSize ? `\\left(${processedInner}\\right)` : `(${processedInner})`;
        i = close + 1;
        continue;
      }
    }
    // `\{ ... \}` 짝 (visible curly braces in math)
    if (math[i] === "\\" && math[i + 1] === "{") {
      const close = findMatchingClose(
        math,
        i,
        2,
        (s, k) => s[k] === "\\" && s[k + 1] === "{",
        (s, k) => s[k] === "\\" && s[k + 1] === "}",
      );
      if (close > i) {
        const inner = math.slice(i + 2, close);
        const needsSize = TALL_CMDS.test(inner);
        const processedInner = autoSizeBrackets(inner);
        out += needsSize
          ? `\\left\\{${processedInner}\\right\\}`
          : `\\{${processedInner}\\}`;
        i = close + 2;
        continue;
      }
    }
    out += math[i];
    i++;
  }
  return out;
};

const injectDisplayStyle = (inner: string): string => {
  if (HAS_STYLE_DIRECTIVE.test(inner)) return inner;
  // 완전히 빈 식 ("$ $" 등)에는 굳이 주입할 필요 없음.
  if (!inner.trim()) return inner;
  return `\\displaystyle ${inner}`;
};

/**
 * 단순 정수 가분수 → 대분수 변환. 한국 중·고등 교과 관행 — 특히 중1
 * 수준에선 순환소수 미학습이라 대분수가 크기 비교·근사 판단에 훨씬 직관적.
 * 예: `\frac{4}{3}` → `1\frac{1}{3}`, `\frac{7}{2}` → `3\frac{1}{2}`,
 *     `-\frac{5}{2}` → `-2\frac{1}{2}`, `\frac{6}{3}` → `2` (정수로 떨어짐).
 *
 * **보수적 휴리스틱** — 분자·분모가 모두 *순수 정수* (1~3자리) 인 가분수만
 * 변환. 식 분수 (`\frac{a+1}{2}` / `\frac{\sqrt{2}}{3}` 등) 는 의도된 표기일
 * 수 있고 KaTeX 가 단순화 못 하므로 그대로 둔다. 진분수 (`\frac{1}{3}`),
 * 분모 0, 분자 = 분모 (1), 분자 < 분모 도 모두 그대로.
 *
 * 음수: 부호를 외부로 빼서 같은 변환 적용한다. `\dfrac` 도 대상에 포함 —
 * 이 시점이 preprocessMathText 안이라 `\dfrac` → `\frac` 정규화 이후라
 * 신경 안 써도 되지만, 호출 순서가 바뀌어도 안전하게 둘 다 매치.
 */
const improperToMixed = (math: string): string =>
  math.replace(
    /(-?)\\d?frac\{(\d{1,4})\}\{(\d{1,4})\}/g,
    (full, sign: string, numStr: string, denStr: string) => {
      const num = parseInt(numStr, 10);
      const den = parseInt(denStr, 10);
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return full;
      if (num < den) return full; // 진분수 — 손대지 않음.
      const whole = Math.floor(num / den);
      const remainder = num % den;
      if (remainder === 0) {
        // 정수로 떨어짐 — 그냥 정수로 표기.
        return `${sign}${whole}`;
      }
      // 대분수 — `n\frac{r}{q}`. KaTeX는 정수 옆 \frac 을 자동 spacing 처리.
      return `${sign}${whole}\\frac{${remainder}}{${den}}`;
    },
  );

/**
 * 모델이 자주 emit 하는 malformed LaTeX 패턴을 정리 — KaTeX 가 통째로
 * 에러 fallback (빨간 텍스트) 으로 가는 걸 막는다. 사용자 보고 (14번, 8번):
 * `\left\left\{ ... \right\right\}` 가 통째로 빨간 raw 로 노출. KaTeX 는
 * `\left` 다음에 *단일* 구분자를 기대 — `\left` 자체가 명령이라 "Expected
 * delimiter, got \\left" 로 에러. 정상화: 중복된 `\left` / `\right` 를 하나로.
 *
 * Module-level export — `protectLooseLatex` (sanitize.ts) 의 line-level
 * pre-wrap, preprocessMathText 의 `$...$` inner 처리, Step 9 auto-wrap,
 * 그리고 MarkdownRenderer 의 renderKatex final guard 모두에서 호출. 한
 * 군데서만 적용하면 path 가 다를 때 leak 됨.
 */
export const cleanMalformedLatex = (s: string): string =>
  s
    // 중복 명령어 (\left\left, \right\right, \frac\frac, \sqrt\sqrt) → 단일화
    .replace(/\\left(?=\\left\b)/g, "")
    .replace(/\\right(?=\\right\b)/g, "")
    .replace(/\\bigl?(?=\\left\b)/g, "")
    .replace(/\\bigr?(?=\\right\b)/g, "")
    .replace(/\\frac(?=\\frac\b)/g, "")
    .replace(/\\sqrt(?=\\sqrt\b)/g, "")
    .replace(/\\boxed(?=\\boxed\b)/g, "")
    // 물결표 / 근사 등호 (`\approx`, `≈`) → `=` — 사용자 보고: 물결표 금지.
    .replace(/\\approx\b/g, "=")
    .replace(/≈/g, "=")
    // 빈 분수 `\frac{a}{}` → `\frac{a}{1}` (KaTeX parse error 방지)
    .replace(/\\frac\{([^{}]*)\}\{\}/g, "\\frac{$1}{1}")
    // 빈 분수 `\frac{}{b}` → `\frac{0}{$1}` (드물지만 발생)
    .replace(/\\frac\{\}\{([^{}]*)\}/g, "\\frac{0}{$1}")
    // escaped delimiter typo: `\left\(` / `\left\)` 같이 escape 된 `(` `)` →
    // 그냥 `\left(` `\left)`. 모델이 자주 over-escape 함.
    .replace(/\\left\\\(/g, "\\left(")
    .replace(/\\right\\\)/g, "\\right)")
    .replace(/\\left\\\[/g, "\\left[")
    .replace(/\\right\\\]/g, "\\right]")
    // spacing 중복: `\;\;\;` / `\,\,\,` / `\quad\quad` → 단일화
    .replace(/(\\;){2,}/g, "\\;")
    .replace(/(\\,){2,}/g, "\\,")
    .replace(/(\\quad){2,}/g, "\\quad")
    .replace(/(\\qquad){2,}/g, "\\qquad");

/**
 * `$...$` / `$$...$$` inner 에 적용할 정규화 묶음 — 모든 wrap path 에서
 * 동일한 변환을 거치도록 한 군데에 모음.
 *
 *  1) cleanMalformedLatex (모델 typo 정리)
 *  2) 유니코드 수학기호 → LaTeX 명령어
 *  3) `improperToMixed` — `\frac`/`\dfrac` 정수 가분수 → 대분수 (한국 교과서)
 *  4) uprightGeometryLabels (점 라벨 직립 Roman)
 *  5) autoSizeBrackets (분수/적분 포함 괄호를 `\left/\right` 로)
 *  6) **`\frac` → `\dfrac` 업그레이드** — 한국 교과서 룰: 인라인 모드에서도
 *     모든 분수가 *같은 displaystyle 크기*. 사용자 보고: 한 식 안에 인라인
 *     `\frac` 와 디스플레이 `\frac` 가 섞여 들쭉날쭉. KaTeX 0.16.35 + 번들
 *     woff2 폰트 환경에서 `\dfrac` 정상 작동 → 강제 업그레이드가 가장 강력한
 *     fix. `\tfrac` (textstyle 강제) 는 모델이 *명시 의도* 한 경우라 보존.
 *  7) injectDisplayStyle (보조 안전망 — `\sum`, `\int`, `\lim` 같은 큰
 *     연산자가 있는 식 + dfrac 안 쓰이는 외부 식에도 displaystyle 보장)
 */
const applyMathInnerNormalization = (inner: string): string => {
  let s = cleanMalformedLatex(inner);
  for (const [re, repl] of UNICODE_MATH_MAP) s = s.replace(re, repl);
  // improperToMixed 가 `\frac` 와 `\dfrac` 둘 다 매치, 반환은 `\frac` 표준화.
  // 그 뒤 단계 6 에서 모두 `\dfrac` 로 업그레이드.
  s = improperToMixed(s);
  s = uprightGeometryLabels(s);
  s = autoSizeBrackets(s);
  // 6) `\frac` → `\dfrac` 강제 업그레이드.
  //    - `(?![a-zA-Z])` lookahead 로 `\fraction` 같은 가상 명령에 안 걸리게.
  //    - `\tfrac` / `\cfrac` 는 매치 안 함 (모델 명시 의도 보존).
  s = s.replace(/\\frac(?![a-zA-Z])/g, "\\dfrac");
  s = injectDisplayStyle(s);
  return s;
};

/**
 * 기하 표기에서 점 이름을 직립(Roman)으로 강제.
 *
 * 배경: 한국 교과서 / 수능 시험지에서 점·도형·선분·호 표기는 안의 라틴
 * 대문자가 점 *이름*이지 변수가 아니다 — italic이 아닌 직립 Roman으로
 * 그려야 한다 (텍스트북 조판 관행). KaTeX 기본은 math italic이라
 * 그대로 두면 "점 A"의 A가 비스듬히 기울어진다.
 *
 * 세 가지 패턴을 처리:
 *
 * **(1) 오버레이 명령어** — `\overline` / `\overrightarrow` /
 *      `\overleftarrow` / `\overleftrightarrow` / `\widehat` / `\widetilde`
 *      / `\vec` / `\dot` / `\ddot` 안의 라벨.
 *      - `\overline{AB}` → `\overline{\mathrm{AB}}` ✓
 *
 * **(2) 도형 접두사** — `\triangle` / `\square` / `\angle` /
 *      `\measuredangle` / `\sphericalangle` 뒤에 오는 라벨.
 *      - `\triangle ABC` → `\triangle \mathrm{ABC}` ✓
 *      - `\angle ABC` → `\angle \mathrm{ABC}` ✓
 *
 * **(3) 호(arc) 정규화** — 한국 교과서의 호 기호는 *내용 폭만큼 가로로 늘어나는
 *      얕고 부드러운 돔 곡선* (⌒). KaTeX 내장 accent로는 못 그린다:
 *        - `\widehat{}`은 hat(^) 모양
 *        - `\overset{\frown}{}`은 작은 글자 ⌢ 한 개만 얹음
 *        - `\overgroup{}`은 V자 꺾이는 각 모양
 *
 *      유일한 방법은 KaTeX의 `\htmlClass{cls}{content}` 확장으로 출력 span에
 *      클래스를 달고, CSS `border-radius`로 부드러운 호 곡선을 위에 그리는 것.
 *      `prerenderAllKatex`는 KaTeX 호출 시 `trust: cmd => cmd === "\\htmlClass"`를
 *      넘겨 이 확장만 허용.
 *
 *      그래서 `\widehat{XY}` / `\overset{\frown}{XY}`가 2글자 이상 대문자
 *      라벨일 때는 `\htmlClass{geom-arc-wrap}{\mathrm{XY}}`로 치환한다.
 *      CSS `.geom-arc-wrap`이 위에 ⌒ 곡선을 그려준다.
 *      - `\widehat{AB}` → `\htmlClass{geom-arc-wrap}{\mathrm{AB}}` ✓
 *      - `\overset{\frown}{ABC}` → `\htmlClass{geom-arc-wrap}{\mathrm{ABC}}` ✓
 *      - `\widehat{x}` → 그대로 (소문자 — 통계 estimator 등)
 *      - `\widehat{A}` → `\widehat{\mathrm{A}}` (단일 대문자 — 호가 아닌 hat accent)
 *
 * **(4) 단독 대문자 라벨** — `$...$` 안의 전체 내용이 대문자 라틴 글자
 *      (+ 옵션 prime)만으로 구성된 경우. 점·원·도형 라벨이 단독으로 등장한
 *      경우 ("점 $A$", "원 $O$", "사각형 $ABCD$" 등) 모두 직립 Roman으로.
 *      - `A` → `\mathrm{A}` ✓
 *      - `ABCD` → `\mathrm{ABCD}` ✓
 *      - `A'` → `\mathrm{A'}` ✓
 *
 * 휴리스틱은 보수적으로 — 대문자만, 라틴, prime 한정. `x`, `x+y`, `A_1`,
 * `A^2` 류는 모두 변수로 간주해 그대로 둔다. (`A_1`은 점-with-index일
 * 수도 있지만 false positive 위험이 더 커서 패스.)
 */
// `widehat`과 `vec`은 일반 오버레이 목록에서 제외 — 둘 다 특수 처리 (호와
// 다중자 벡터)가 필요해서 아래 따로 처리한다.
const GEOMETRY_OVERLAY_COMMANDS =
  "overline|overrightarrow|overleftarrow|overleftrightarrow|widetilde|dot|ddot";
const GEOMETRY_LABEL_REGEX = new RegExp(
  `\\\\(${GEOMETRY_OVERLAY_COMMANDS})\\{\\s*([A-Z][A-Z']*)\\s*\\}`,
  "g",
);

const FIGURE_PREFIX_COMMANDS = "triangle|square|angle|measuredangle|sphericalangle";
const FIGURE_PREFIX_REGEX = new RegExp(
  `\\\\(${FIGURE_PREFIX_COMMANDS})(?![a-zA-Z])\\s*([A-Z][A-Z']*)`,
  "g",
);

// 호 패턴: \widehat{AB}, \overset{\frown}{AB} (2자 이상 대문자만)
const ARC_WIDEHAT_REGEX = /\\widehat\{\s*([A-Z][A-Z']+)\s*\}/g;
const ARC_FROWN_OVERSET_REGEX = /\\overset\{\s*\\frown\s*\}\{\s*([A-Z][A-Z']+)\s*\}/g;
// 단일 대문자 \widehat — 호가 아니라 일반 hat accent 의도. \mathrm만 적용.
const SINGLE_HAT_REGEX = /\\widehat\{\s*([A-Z]'*)\s*\}/g;

// 벡터 패턴:
//  - \vec{AB} (2자 이상 대문자) → \overrightarrow{\mathrm{AB}}
//    (\vec 은 단일 문자용 좁은 화살표라 폭이 안 늘어남 — 벡터 AB 표기는
//    한국 교과서 관례상 두 점 위에 길게 늘어나는 화살표여야 한다)
//  - \vec{A} (단일 대문자) → \vec{\mathrm{A}} (Roman + 좁은 화살표 유지)
//  - \vec{v} (소문자) → 그대로 (변수 벡터, 좁은 화살표 그대로)
const VEC_MULTI_REGEX = /\\vec\{\s*([A-Z][A-Z']+)\s*\}/g;
const VEC_SINGLE_UPPER_REGEX = /\\vec\{\s*([A-Z]'*)\s*\}/g;

const PURE_LABEL_REGEX = /^\s*([A-Z][A-Z']*)\s*$/;

const uprightGeometryLabels = (inner: string): string => {
  let out = inner;
  // (3a) 호 케이스 먼저 — \widehat 2글자+ 와 \overset{\frown}{}를 \overgroup으로 통합.
  //     단일 대문자는 호가 아니라 hat accent로 간주해 \mathrm만 wrap.
  out = out.replace(
    ARC_WIDEHAT_REGEX,
    (_m, label: string) => `\\htmlClass{geom-arc-wrap}{\\mathrm{${label}}}`,
  );
  out = out.replace(
    ARC_FROWN_OVERSET_REGEX,
    (_m, label: string) => `\\htmlClass{geom-arc-wrap}{\\mathrm{${label}}}`,
  );
  out = out.replace(
    SINGLE_HAT_REGEX,
    (_m, label: string) => `\\widehat{\\mathrm{${label}}}`,
  );
  // (3b) 벡터 케이스 — 다중자 \vec 은 \overrightarrow 로 승격 (폭 늘어남).
  //      단일 대문자 \vec 은 Roman만 적용. 두 정규식 모두 ARC 처리 후 실행해야
  //      \overset{\frown}{} 안의 \vec 에 잘못 매치되는 일을 피한다.
  out = out.replace(
    VEC_MULTI_REGEX,
    (_m, label: string) => `\\overrightarrow{\\mathrm{${label}}}`,
  );
  out = out.replace(
    VEC_SINGLE_UPPER_REGEX,
    (_m, label: string) => `\\vec{\\mathrm{${label}}}`,
  );
  // (1) 일반 오버레이 명령어.
  out = out.replace(
    GEOMETRY_LABEL_REGEX,
    (_m, cmd: string, label: string) => `\\${cmd}{\\mathrm{${label}}}`,
  );
  // (2) 도형 접두사 + 라벨.
  out = out.replace(
    FIGURE_PREFIX_REGEX,
    (_m, cmd: string, label: string) => `\\${cmd} \\mathrm{${label}}`,
  );
  // (4) 전체가 단독 대문자 라벨인 경우만 통째로 Roman 처리.
  const pure = out.match(PURE_LABEL_REGEX);
  if (pure) out = `\\mathrm{${pure[1]}}`;
  return out;
};

/* ───────────────────────────────────────────────────────────────────────────
 * 한글-수식 분리 — `$...$` / `$$...$$` 안에 섞인 한글을 prose 레벨로 떼어낸다.
 *
 * 모델(OCR·해설·변형)이 한글 설명어를 수식 안에 박는 사례가 잦다. 사용자
 * 보고(4번 해설 — 실제 출력):
 *   `$2ab^3 \times (\text{가운데}) \times A = 8a^6b^6$`
 * KaTeX 는 `\text{한글}` / raw 한글을 *math 컨텍스트 크기* 로 렌더 → 본문
 * prose 와 글씨 크기가 달라 "한글 크기가 제멋대로" 로 보인다.
 *
 * 해결: 한글 구간을 떼어 `$수식$한글$수식$` 형태로 재조립 → 한글이 본문
 * prose 폰트로 렌더돼 크기가 통일된다. **안전 구간만** 분리한다:
 *  - brace depth 0 — 첨자 `x_{한글}` · 분수 인자 `\frac{한글}{}` 안은 쪼개면
 *    구조가 깨지므로 제외.
 *  - `\left .. \right` 밖 — 안에서 쪼개면 `\left` 짝이 두 span 으로 분리돼
 *    KaTeX "Expected \right" 에러.
 *  - `\begin{}` 환경 없음 — cases/array 내용은 depth 0 라 잘못 쪼개지므로
 *    한글이 있어도 그 span 전체를 통째로 건드리지 않는다.
 * 위 위험 구간의 한글은 그대로 두고 프롬프트에서 별도 방어한다 (v1 한계).
 * ─────────────────────────────────────────────────────────────────────────── */

/** 한글 음절 + 자모. 수식 안에 있으면 분리 트리거. */
const HANGUL_CHAR = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

/** `\text{}` 류 텍스트 래퍼 여는 부분 — 모델이 한글 설명어를 감쌀 때 쓰는 형태. */
const TEXT_WRAPPER_OPEN =
  /^\\(?:textnormal|textrm|textbf|textit|textsf|textsc|text|mathrm|mathbf|mathsf|mbox|hbox)\s*\{/;

/** `openIdx`(`{`)에 매칭되는 `}` 인덱스. `\{` `\}` escape 는 건너뜀. 못 찾으면 -1. */
const findBraceClose = (s: string, openIdx: number): number => {
  let depth = 0;
  for (let k = openIdx; k < s.length; k++) {
    const c = s[k];
    if (c === "\\") {
      k++; // escape — 다음 글자 소비
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return k;
    }
  }
  return -1;
};

interface MathSegment {
  type: "math" | "text";
  content: string;
}

/**
 * 수식 inner 를 math / 한글-text 구간으로 분해. brace depth 0 + `\left..\right`
 * 밖의 한글(raw 또는 `\text{순수한글}`)만 text 구간으로 떼어낸다.
 */
const splitMathInnerByHangul = (inner: string): MathSegment[] => {
  const segs: MathSegment[] = [];
  let buf = "";
  let bufType: "math" | "text" = "math";
  let depth = 0; // `{}` 중첩 깊이
  let leftDepth = 0; // `\left .. \right` 중첩 깊이
  const switchTo = (type: "math" | "text") => {
    if (buf && bufType !== type) {
      segs.push({ type: bufType, content: buf });
      buf = "";
    }
    bufType = type;
  };
  let i = 0;
  const n = inner.length;
  while (i < n) {
    const ch = inner[i];
    if (ch === "\\") {
      // escape 된 brace `\{` `\}` — 리터럴, depth 영향 없음.
      if (inner[i + 1] === "{" || inner[i + 1] === "}") {
        switchTo("math");
        buf += ch + inner[i + 1];
        i += 2;
        continue;
      }
      const rest = inner.slice(i);
      if (/^\\left\b/.test(rest)) {
        leftDepth++;
      } else if (/^\\right\b/.test(rest)) {
        leftDepth = Math.max(0, leftDepth - 1);
      } else if (depth === 0 && leftDepth === 0) {
        // 텍스트 래퍼 — 내용이 *순수 한글* 이면 text 구간으로 추출.
        const wm = rest.match(TEXT_WRAPPER_OPEN);
        if (wm) {
          const braceOpen = i + wm[0].length - 1; // 여는 `{` 위치
          const close = findBraceClose(inner, braceOpen);
          if (close > braceOpen) {
            const content = inner.slice(braceOpen + 1, close);
            if (
              HANGUL_CHAR.test(content) &&
              !content.includes("\\") &&
              !content.includes("{") &&
              !content.includes("}")
            ) {
              switchTo("text");
              buf += content;
              i = close + 1;
              continue;
            }
          }
        }
      }
      switchTo("math"); // 그 외 백슬래시 명령 — math 그대로.
      buf += ch;
      i++;
      continue;
    }
    if (ch === "{") {
      depth++;
      switchTo("math");
      buf += ch;
      i++;
      continue;
    }
    if (ch === "}") {
      depth = Math.max(0, depth - 1);
      switchTo("math");
      buf += ch;
      i++;
      continue;
    }
    // depth 0 + `\left` 밖의 raw 한글.
    if (depth === 0 && leftDepth === 0 && HANGUL_CHAR.test(ch)) {
      switchTo("text");
      buf += ch;
      i++;
      continue;
    }
    // 공백 — 현재 구간에 흡수 (math ↔ text 전환 안 함, 원본 간격 보존).
    if (ch === " " || ch === "\t") {
      buf += ch;
      i++;
      continue;
    }
    switchTo("math");
    buf += ch;
    i++;
  }
  if (buf) segs.push({ type: bufType, content: buf });
  return segs;
};

/** math 구간이 비었거나 directive/공백뿐이라 버려도 되는지. */
const isDroppableMath = (s: string): boolean =>
  s
    .replace(/\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\b/g, "")
    .replace(/\\(?:qquad|quad|,|;|:|!)/g, "")
    .replace(/[\s{}]/g, "")
    .length === 0;

/** 한 수식 span 의 inner 한글 분리 결과. 분리할 게 없으면 null(원본 유지). */
const extractHangulFromInner = (inner: string): string | null => {
  if (!HANGUL_CHAR.test(inner)) return null;
  // `\begin{}` 환경(cases/array/aligned 등)은 내용이 depth 0 라 잘못 쪼개면
  // 환경 자체가 깨진다 — 한글이 있어도 통째로 건드리지 않는다.
  if (/\\begin\s*\{/.test(inner)) return null;
  const segs = splitMathInnerByHangul(inner);
  if (!segs.some((s) => s.type === "text")) return null; // 분리할 한글 없음
  const parts: string[] = [];
  for (const seg of segs) {
    if (seg.type === "text") {
      parts.push(seg.content);
    } else if (isDroppableMath(seg.content)) {
      // 내용 없는 math 구간은 버리되, 공백이 있었으면 한 칸은 보존.
      if (/\s/.test(seg.content)) parts.push(" ");
    } else {
      parts.push(`$${seg.content}$`);
    }
  }
  return parts.join("");
};

/**
 * 인라인 `$...$` 매칭 — `$$블록$$` 경계를 침범하지 않는다.
 *
 * 양쪽 delimiter 를 모두 `(?<!\$)` + `(?!\$)` 로 감싸 *단독* `$` 만 매칭한다.
 * 한쪽 가드만 있으면(`\$(?!\$)` — 다음 글자만 확인) `$$블록$$` 여는 `$$` 의
 * *둘째* `$` 부터 매칭이 시작돼 블록 안쪽을 인라인으로 오인, `$$` 를 두 동강
 * 낸다. 사용자 보고(13번): 블록·인라인이 섞인 풀이에서 `$$` 가 쪼개져 한글이
 * 수식에 말려들고 `\frac` 가 미정규화 → 분수 한 행만 작게 렌더. inner 는 `$`
 * 불포함(`[^$\\]`), 백슬래시 escape(`\\.`) 만 허용. `/g` regex 를 여러 `.replace`
 * 에서 공유 — `String.prototype.replace` 가 매 호출 lastIndex 를 리셋하므로 안전.
 */
const INLINE_MATH_RE = /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)*)(?<!\$)\$(?!\$)/g;

/**
 * 본문 전체에서 `$...$` / `$$...$$` 안에 섞인 한글을 prose 레벨로 분리.
 * 한글이 없는 수식은 손대지 않는다(바이트 동일 반환 — 회귀 0). `$$...$$`
 * 블록에 한글이 섞이면 인라인 `$...$` 로 다운그레이드한다(한글 오염된 블록
 * 수식은 이미 깨진 상태라 인라인이 안전).
 */
export const extractHangulFromMath = (content: string): string => {
  let out = content.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (m: string, inner: string) => extractHangulFromInner(inner) ?? m,
  );
  out = out.replace(
    INLINE_MATH_RE,
    (m: string, inner: string) => extractHangulFromInner(inner) ?? m,
  );
  return out;
};

/**
 * 수식 정규화 — KaTeX 입력 전 안전 변환.
 *  1) `\(\)` / `\[\]` → `$...$` / `$$...$$`
 *  2) `$A$$B$` → `$A$ $B$` (최대 5회 반복)
 *  3) 인라인 `$...$`에 multi-line 환경 → `$$...$$`로 승격
 *  4) `$...$` / `$$...$$` 내부 `\dfrac` → `\frac`, 유니코드 → LaTeX
 *  5) `\sum`/`\int`/`\lim` 등 큰 연산자가 있으면 `\displaystyle` 자동 주입
 *     → 인라인 수식에서도 적분/합 기호가 교과서처럼 크게 그려지고,
 *       sum 류는 첨자가 자동으로 아래/위에 쌓이는 limits 스타일이 된다.
 *  6) `\overline{AB}` 등 기하 표기 안의 점 라벨은 `\mathrm{}`으로 감싸
 *     이탤릭이 아닌 직립 Roman으로 렌더링.
 *  7) `(...)` / `\{...\}` 안에 키 큰 라텍스(`\int`, `\frac`, `\sum`, `\sqrt`
 *     등) 가 있으면 `\left(...\right)` / `\left\{...\right\}` 로 자동 변환
 *     해서 괄호 높이가 내용에 맞게 늘어난다.
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

  // 한글-수식 분리 — `$...$` / `$$...$$` 안에 섞인 한글을 prose 레벨로 떼어
  // 낸다. 모델이 `\text{한글}` / raw 한글을 수식 안에 박으면 KaTeX 가 math
  // 크기로 렌더 → 본문과 글씨 크기 불일치. inner 정규화(아래) *이전* 에
  // 실행해야 쪼개서 생긴 새 `$...$` 도 같은 정규화를 거친다.
  out = extractHangulFromMath(out);

  // `$...$` / `$$...$$` inner 정규화 — applyMathInnerNormalization 한 곳에서
  // 모든 변환 (cleanMalformedLatex, dfrac→frac, unicode, uprightGeometryLabels,
  // autoSizeBrackets, injectDisplayStyle) 일괄 적용.
  out = out.replace(
    INLINE_MATH_RE,
    (_m, inner) => `$${applyMathInnerNormalization(inner)}$`,
  );
  out = out.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (_m, inner) => `$$${applyMathInnerNormalization(inner)}$$`,
  );

  // (8) `$...$` / `$$...$$` 밖에 떠도는 math-mode-only directive 청소.
  //     LLM 이 가끔 `$수식$\displaystyle 다음 한글 문장...` 형태로 LaTeX
  //     끝낸 뒤 `\displaystyle` 만 텍스트 모드로 흘림. KaTeX 가 처리 못
  //     하므로 그대로 보이게 됨 — 사용자 보고: "displaystyle 이 전부 에러남".
  //     수식 안의 `\displaystyle` 은 이미 위의 두 replace 안에서 injectDisplayStyle
  //     로 한 번만 보존되므로, 여기 strip 은 외부에 남은 것에만 적용된다.
  //     마스킹 — `$…$` / `$$…$$` 영역을 PUA sentinel 로 임시 치환해서 외부만
  //     strip 한 뒤 복원. sentinel 은 일반 사용자 입력에 절대 등장 안 함.
  const SENTINEL_BLOCK = String.fromCharCode(57344); // U+E000
  const SENTINEL_INLINE = String.fromCharCode(57345); // U+E001
  const blocks: string[] = [];
  const inlines: string[] = [];
  let masked = out
    .replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner: string) => {
      blocks.push(inner);
      return `${SENTINEL_BLOCK}${blocks.length - 1}${SENTINEL_BLOCK}`;
    })
    .replace(/\$([^$\n]+?)\$/g, (_m, inner: string) => {
      inlines.push(inner);
      return `${SENTINEL_INLINE}${inlines.length - 1}${SENTINEL_INLINE}`;
    });
  // math-mode-only directive 제거. 인접 공백/줄바꿈 정리.
  masked = masked.replace(
    /\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle)\b[ \t]*/g,
    "",
  );

  // (9) `$` 밖에 떠도는 raw LaTeX 자동 wrap — math + 한글 혼합 처리.
  //
  //     LLM 이 가끔 본문/보기/풀이 한 줄을 통째로 `$` 없이 emit:
  //       \displaystyle 5 - \frac{1}{3} \times \left[...\right]의 값은?
  //       ㄴ. \left(-\frac{5}{8}\right) \times \left(+\frac{5}{9}\right)
  //
  //     해당 줄에서 math 구간만 `$...$` (inline) 로 wrap. 한글 꼬리
  //     ("의 값은?" 등) 가 붙어 있으면 한글 직전에서 split — math mode 안에
  //     한글이 들어가면 KaTeX 가 에러. enum marker (ㄱ./ㄴ./①/숫자.) /
  //     blockquote `>` prefix 보존. `\displaystyle` 이 없으면 명시적으로
  //     prepend 해서 inline 안에서도 display 사이즈 유지.
  //
  //     `LATEX_CMD` 에 `\displaystyle` 도 포함 — 위 (8) 단계가 `$` 밖 떠도는
  //     `\displaystyle` 을 strip 하지만, 이 (9) 가 먼저 line-level wrap 으로
  //     보존하면 strip 의 대상이 아니게 된다 (이미 `$...$` 안에 있음).
  const LATEX_CMD = /\\(?:displaystyle|textstyle|frac|dfrac|sqrt|left|right|binom|sum|int|prod|lim|cdot|times|div|pm|mp|cdots|ldots|vec|hat|tilde|overline|underline|overrightarrow|begin|end|over|atop|max|min|log|ln|sin|cos|tan|alpha|beta|gamma|theta|pi|sigma|omega|infty|cup|cap|subset|supset|neq|leq|geq|approx|cdot|mathrm|mathbf|text|boxed|phantom)\b/g;
  // 한글 (Hangul Syllables + Jamo) — math 모드에선 안 그려지므로 boundary 로 사용.
  const HANGUL_RE = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;
  masked = masked
    .split("\n")
    .map((line) => {
      // sentinel (이미 $...$ 마스크) 가 있으면 건드리지 말 것
      if (line.includes(SENTINEL_BLOCK) || line.includes(SENTINEL_INLINE)) return line;
      // `$` 가 있으면 부분적으로라도 인용된 줄. 자동 wrap 하면 충돌 위험.
      if (line.includes("$")) return line;
      // LaTeX 명령어가 2회 이상 — wrap 후보.
      const cmds = line.match(LATEX_CMD);
      if (!cmds || cmds.length < 2) return line;
      // enum marker 또는 blockquote prefix 보존.
      const m = line.match(/^(\s*(?:>\s?)?(?:[ㄱ-ㅎ]\.|[①②③④⑤⑥⑦⑧⑨⑩]|\d+\.|\d+\)|-|\*)?\s*)([\s\S]+?)$/);
      const prefix = m ? m[1] : "";
      const rest = m ? m[2] : line;

      // math 부분의 시작점 — 첫 `\backslashcmd`.
      const firstCmdIdx = rest.search(/\\[a-zA-Z]/);
      if (firstCmdIdx < 0) return line;
      const leading = rest.slice(0, firstCmdIdx); // 보통 빈 문자열이거나 짧은 prose.
      const mathTail = rest.slice(firstCmdIdx);

      // 한글이 math span 중간에 등장하면 거기서 끊는다.
      const hangulInTail = mathTail.search(HANGUL_RE);
      let mathSpan: string;
      let trailingText: string;
      if (hangulInTail >= 0) {
        mathSpan = mathTail.slice(0, hangulInTail).trimEnd();
        trailingText = mathTail.slice(hangulInTail);
      } else {
        mathSpan = mathTail.trim();
        trailingText = "";
      }
      if (!mathSpan) return line;

      // `\displaystyle` 이 이미 들어 있으면 그대로, 없으면 명시적으로 prepend.
      // **반드시 applyMathInnerNormalization 통과** — 안 그러면 `\left\left`
      // 같은 모델 typo 가 KaTeX 까지 그대로 도달해 빨간 글씨 fallback.
      const hasDisplay = /\\displaystyle\b/.test(mathSpan);
      const innerRaw = hasDisplay ? mathSpan : `\\displaystyle ${mathSpan}`;
      const innerNormalized = applyMathInnerNormalization(innerRaw);
      return `${prefix}${leading}$${innerNormalized}$${trailingText}`;
    })
    .join("\n");

  // 복원.
  out = masked
    .replace(
      new RegExp(`${SENTINEL_BLOCK}(\\d+)${SENTINEL_BLOCK}`, "g"),
      (_m, i: string) => `$$${blocks[Number(i)]}$$`,
    )
    .replace(
      new RegExp(`${SENTINEL_INLINE}(\\d+)${SENTINEL_INLINE}`, "g"),
      (_m, i: string) => `$${inlines[Number(i)]}$`,
    );

  // (10) Final guard — 모든 변환이 끝난 뒤 모든 `$...$` / `$$...$$` 를 한
  // 번 더 스캔해서 cleanMalformedLatex 적용. Step 9 의 새 wrap, Step 4/5 의
  // 기존 wrap, 복원된 원본 mask 어디서 왔든 final pass 가 잡는다. 사용자가
  // 본 빨간 글씨 (KaTeX 의 에러 fallback) 의 근본 원인은 \left\left 같은
  // 모델 typo 였는데 path 마다 다르게 처리돼서 leak — 이 final guard 가
  // 마지막 안전망.
  out = out.replace(
    INLINE_MATH_RE,
    (_m, inner: string) => `$${cleanMalformedLatex(inner)}$`,
  );
  out = out.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (_m, inner: string) => `$$${cleanMalformedLatex(inner)}$$`,
  );

  return out;
};
