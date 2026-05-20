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

  out = out.replace(/\$(?!\$)((?:[^$\\]|\\.)*)\$/g, (_m, inner) => {
    let fixed = inner.replace(/\\dfrac(?![a-zA-Z])/g, "\\frac");
    for (const [re, repl] of UNICODE_MATH_MAP) fixed = fixed.replace(re, repl);
    fixed = uprightGeometryLabels(fixed);
    fixed = autoSizeBrackets(fixed);
    fixed = injectDisplayStyle(fixed);
    return `$${fixed}$`;
  });

  out = out.replace(/\$\$([\s\S]*?)\$\$/g, (_m, inner) => {
    let fixed = inner.replace(/\\dfrac(?![a-zA-Z])/g, "\\frac");
    for (const [re, repl] of UNICODE_MATH_MAP) fixed = fixed.replace(re, repl);
    fixed = uprightGeometryLabels(fixed);
    fixed = autoSizeBrackets(fixed);
    fixed = injectDisplayStyle(fixed);
    return `$$${fixed}$$`;
  });

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

  // (9) `$` 밖에 떠도는 raw LaTeX 명령어 자동 wrap.
  //     LLM 이 가끔 보기 항목 같은 줄을 통째로 `$` 없이 emit 함:
  //       ㄴ. \left(-\frac{5}{8}\right) \times \left(+\frac{5}{9}\right)
  //     마스킹 후 외부 텍스트에서 줄 단위로 검사 — 줄에 `\frac` `\sqrt`
  //     `\left` `\right` `\binom` `\sum` `\int` 같은 LaTeX 명령어가 2개
  //     이상 있고 `$` 와 sentinel 둘 다 없으면 (이미 인용된 영역이 아님),
  //     줄의 LaTeX 부분만 한 묶음으로 `$$...$$` block 으로 wrap. enum
  //     marker (ㄱ./ㄴ./①…/숫자.) 와 blockquote `>` prefix 는 보존.
  const LATEX_CMD = /\\(?:frac|dfrac|sqrt|left|right|binom|sum|int|prod|lim|cdot|times|div|pm|mp|cdots|ldots|vec|hat|tilde|overline|underline|begin|end|over|atop)\b/g;
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
      // enum marker 또는 blockquote prefix 보존 + 그 뒤의 LaTeX-laden 부분 wrap.
      // marker 예: "ㄱ. ", "ㄴ. ", "① ", "1. ", "> ", "- " 등.
      const m = line.match(/^(\s*(?:>\s?)?(?:[ㄱ-ㅎ]\.|[①②③④⑤⑥⑦⑧⑨⑩]|\d+\.|\d+\)|-|\*)?\s*)([\s\S]+?)$/);
      if (!m) return `$$${line.trim()}$$`;
      const [, prefix, rest] = m;
      return `${prefix}$$${rest.trim()}$$`;
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

  return out;
};
