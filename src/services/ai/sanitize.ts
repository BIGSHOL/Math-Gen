/**
 * Sanitizers for AI-generated problem fields.
 *
 * Models occasionally slip in <img> tags or markdown image placeholders even
 * when the system prompt forbids them. We strip those defensively before
 * handing the problem to the renderer.
 *
 * SECURITY NOTE: this module only handles "broken icon" prevention. Full
 * XSS-safe SVG sanitization (DOMPurify) lands in Phase 5 — see the plan.
 */

const IMG_TAG_RE = /<img[^>]*>/gi;
const MD_IMG_RE = /!\[.*?\]\(.*?\)/g;
const EMPTY_CENTER_RE = /<center>\s*<\/center>/gi;

/**
 * Reverse the damage JSON.parse does to LaTeX backslash escapes.
 *
 * Why this exists: when an LLM emits LaTeX like "\\frac{1}{2}" inside a
 * JSON string, the schema-output path frequently delivers the value with
 * only ONE backslash. JSON.parse then treats that single backslash as the
 * start of a JS escape:
 *   - "\f"  → form feed (0x0C)   →  "\frac" disappears, leaving "rac"
 *   - "\t"  → tab (0x09)         →  "\times" disappears, leaving "imes"
 *   - "\b"  → backspace (0x08)   →  "\binom" → "inom"
 *   - "\n"  → newline            →  "\nabla" → newline + "abla"
 *   - "\r"  → carriage return    →  "\rho"   → CR + "ho"
 *   - "\s"  → invalid (kept lit) →  "\sqrt"  → "sqrt" (no \)
 *   - "\d"  → invalid (kept lit) →  "\dfrac" → "dfrac" (no \)
 *
 * After parse we walk the string and turn those control characters /
 * orphan tokens back into proper "\<command>" sequences so KaTeX can
 * actually render them. Without this pass, formulas in a Flash-Lite /
 * Gemini response render as "rac{1}{2}" or display a sqrt as a bare "5".
 *
 * Pattern adapted from mathlab/pdf-extract-engine/ai/post-processor.ts.
 */
export const fixLatexEscaping = (text: string): string => {
  if (!text) return text;
  return (
    text
      // Control characters introduced by JSON.parse — turn them back into
      // the "\letter" sequences they were before the parse.
      .replace(/\t(?=[a-zA-Z])/g, "\\t") // tab + alpha  → \t<letter>
      .replace(/\f(?=[a-zA-Z])/g, "\\f") // form feed   → \f<letter>
      .replace(/\x08(?=[a-zA-Z])/g, "\\b") // backspace → \b<letter>
      .replace(/\r(?=[a-zA-Z])/g, "\\r") // CR          → \r<letter>
      // `\n` followed by a letter is almost always meant to be `\n<latex>`
      // (e.g. `\nabla`) rather than a real newline. A standalone newline
      // (end of paragraph) is followed by space or another newline — leave
      // those alone.
      .replace(/\n(?=[a-zA-Z][a-z]{2,})/g, "\\n")
      // Orphan LaTeX command names that lost their leading backslash
      // entirely. We can't cover every command, but these are the ones
      // observed in real outputs.
      .replace(/(?<![a-zA-Z\\])sqrt(?=\s*\{?\d|\s*\{)/g, "\\sqrt")
      .replace(/(?<![a-zA-Z\\])dfrac(?=\s*\{)/g, "\\frac")
      .replace(/(?<![a-zA-Z\\])frac(?=\s*\{)/g, "\\frac")
      .replace(/(?<![a-zA-Z\\])pm(?=\s|\\|\$)/g, "\\pm")
      .replace(/(?<![a-zA-Z\\])times(?=\s|\\|\$)/g, "\\times")
      .replace(/(?<![a-zA-Z\\])cdot(?=\s|\\|\$)/g, "\\cdot")
      // Normalise `\dfrac` → `\frac` (we already do the renderer's display
      // mode via the dollar-delimiter choice; \dfrac forces display even
      // inline, which often misrenders inside choice rows).
      .replace(/\\dfrac/g, "\\frac")
  );
};

/**
 * 모델이 라텍스 명령(`\frac`, `\sqrt`, `\pm`, 그리스 문자 등)을 `$...$` 밖에
 * 그대로 흘려 보낸 경우를 방어. 사용자 보고: 한 항목의 본문이 일부는
 * `$...$`로 감싸이고 일부는 안 감싸여서, 우리 렌더 파이프라인이 `$...$`만
 * 플레이스홀더로 교체 → 바깥의 `\frac{\sqrt{2}}{...}` 가 마크다운으로
 * 흘러가 placeholder span 이 시각적으로 노출되는 케이스가 발생.
 *
 * 전략: 문자열을 `$...$` 경계로 쪼개고, **수식 밖 구간**에서 `\command`
 * 패턴을 찾으면 그 구간의 `\command(\{...\})?` 토큰을 `$\command{...}$`
 * 로 자동 wrap. 동시에 placeholder 충돌 회피 — `<` / `>` 류 raw HTML
 * 문자가 수식 밖에 있을 때 entity 로 이스케이프.
 *
 * 보수적으로 한정된 명령어 집합만 처리 — 단어 오인 (`\delta` vs 한국어
 * '\대') 같은 false positive 방지.
 */
const KNOWN_LATEX_CMDS = [
  // 분수·근·연산
  "frac",
  "dfrac",
  "tfrac",
  "cfrac",
  "sqrt",
  "binom",
  "dbinom",
  "tbinom",
  // 이항 연산
  "pm",
  "mp",
  "cdot",
  "times",
  "div",
  "ast",
  "star",
  "circ",
  "bullet",
  "oplus",
  "ominus",
  "otimes",
  "odot",
  // 비교·관계
  "leq",
  "geq",
  "neq",
  "approx",
  "equiv",
  "cong",
  "sim",
  "simeq",
  "ll",
  "gg",
  "propto",
  "doteq",
  "to",
  "rightarrow",
  "leftarrow",
  "Rightarrow",
  "Leftarrow",
  "Leftrightarrow",
  "leftrightarrow",
  "mapsto",
  // 집합·논리
  "in",
  "notin",
  "ni",
  "subset",
  "supset",
  "subseteq",
  "supseteq",
  "cap",
  "cup",
  "setminus",
  "emptyset",
  "varnothing",
  "forall",
  "exists",
  "land",
  "lor",
  "lnot",
  // 그리스 (자주 등장)
  "alpha",
  "beta",
  "gamma",
  "delta",
  "epsilon",
  "varepsilon",
  "zeta",
  "eta",
  "theta",
  "vartheta",
  "iota",
  "kappa",
  "lambda",
  "mu",
  "nu",
  "xi",
  "pi",
  "varpi",
  "rho",
  "varrho",
  "sigma",
  "varsigma",
  "tau",
  "upsilon",
  "phi",
  "varphi",
  "chi",
  "psi",
  "omega",
  "Gamma",
  "Delta",
  "Theta",
  "Lambda",
  "Xi",
  "Pi",
  "Sigma",
  "Upsilon",
  "Phi",
  "Psi",
  "Omega",
  // 큰 연산자
  "sum",
  "prod",
  "coprod",
  "int",
  "iint",
  "iiint",
  "oint",
  "lim",
  "limsup",
  "liminf",
  "sup",
  "inf",
  "max",
  "min",
  "infty",
  // 함수
  "sin",
  "cos",
  "tan",
  "sec",
  "csc",
  "cot",
  "sinh",
  "cosh",
  "tanh",
  "arcsin",
  "arccos",
  "arctan",
  "log",
  "ln",
  "exp",
  // 기하 오버레이
  "overline",
  "overrightarrow",
  "overleftarrow",
  "overleftrightarrow",
  "widehat",
  "widetilde",
  "vec",
  "hat",
  "tilde",
  "dot",
  "ddot",
  "bar",
  "triangle",
  "square",
  "angle",
  "measuredangle",
  "sphericalangle",
  // 글꼴·정렬
  "mathrm",
  "mathbf",
  "mathit",
  "mathsf",
  "mathtt",
  "mathbb",
  "mathcal",
  "mathfrak",
  "text",
  "textbf",
  "textit",
  "frac",
  "left",
  "right",
];

const KNOWN_CMD_SET = new Set(KNOWN_LATEX_CMDS);

/**
 * `$...$` 밖에 단독으로 나타나면 *항상* 모델 실수인 명령어 — math-mode
 * directives 라 텍스트 모드에선 의미 없고 raw text 로 보임. 발견 시 그냥
 * 삭제한다 (적절한 위치의 `$...$` 안에서는 이미 우리 preprocessor 가
 * `\displaystyle` 을 알아서 inject 하므로 leak 된 것만 청소).
 *
 * 사용자 보고: GPT-5.5 가 multi-block 적분 문제에서 `\int...$` 다음 줄에
 * `\displaystyle` 만 외따로 emit 해서 화면에 raw text 가 그대로 노출됨.
 */
const STRAY_DIRECTIVES = /\\(?:displaystyle|textstyle|scriptstyle|scriptscriptstyle|limits|nolimits)\b/g;

/**
 * `text[startIdx]` 가 `\` 이고 그 뒤가 알려진 라텍스 명령이면, 명령어 +
 * 따라오는 모든 `{...}` 인수 (중첩 brace 허용) 를 끝까지 소비해서 그 전체
 * span을 돌려준다. 매치 안 되면 null.
 */
const consumeLatexToken = (
  text: string,
  startIdx: number,
): { token: string; nextIdx: number } | null => {
  if (text[startIdx] !== "\\") return null;
  // 명령어 이름 추출
  let i = startIdx + 1;
  while (i < text.length && /[a-zA-Z]/.test(text[i])) i++;
  if (i === startIdx + 1) return null; // 단일 `\` 만 있는 경우
  const cmdName = text.slice(startIdx + 1, i);
  if (!KNOWN_CMD_SET.has(cmdName)) return null;

  // `\command` 뒤에 따라오는 `{...}` / `[...]` 인수를 brace 균형 맞춰 소비.
  // 인수와 인수 사이의 공백은 허용. 한 인수의 brace 짝이 안 맞으면 거기서
  // 멈추고 그때까지를 토큰으로 반환.
  while (i < text.length) {
    const ch = text[i];
    if (ch === "{" || ch === "[") {
      const open = ch;
      const close = open === "{" ? "}" : "]";
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === open) depth++;
        else if (text[j] === close) depth--;
        if (depth > 0) j++;
      }
      if (depth !== 0) break; // 균형 안 맞음
      i = j + 1; // 닫는 brace 까지 포함
    } else if (ch === " " && (text[i + 1] === "{" || text[i + 1] === "[")) {
      i++; // 인수 앞 공백 skip
    } else {
      break;
    }
  }
  return { token: text.slice(startIdx, i), nextIdx: i };
};

/**
 * `$...$` 밖에 있는 라텍스 토큰을 `$...$` 로 감싸고, raw `<` / `>` 문자를
 * HTML entity로 이스케이프해서 placeholder span과 충돌하지 않도록 정리.
 *
 * 사용자 보고 케이스: 한 OCR 항목 본문에 `$x = -1$ 또는 \frac{\sqrt{2}}{2}`
 * 같이 일부만 `$`로 감싸진 텍스트가 들어오면 — `\frac{\sqrt{2}}{2}` 가
 * 수식 모드로 안 들어가서 raw LaTeX 가 본문에 노출되고, 동시에 우리
 * placeholder span 이 `<` `>` 그대로 보임. 이 함수가 그 두 가지를 한 번에
 * 차단한다.
 *
 * ⚠ 모델이 emit 하는 정상 HTML 블록 (`<svg>...</svg>`, `<table>...</table>`)
 * 은 그대로 보존해야 한다 — escape 하면 MarkdownRenderer Stage 0 의 SVG
 * 추출 정규식이 매치 못 해서 raw `<svg ... />` 가 화면에 텍스트로 노출됨
 * (12번 그래프가 안 그려진 원인). 그래서 먼저 보호 토큰으로 빼두고,
 * 본 처리 끝나면 복원한다.
 */
const PRESERVED_HTML = /<(svg|table)\b[\s\S]*?<\/\1>/gi;
const PRESERVE_MARK = String.fromCharCode(57344);

/**
 * Line-level pre-wrap: 라인이 LaTeX-heavy 인데 `$` 가 하나도 없으면 (모델이
 * 통째로 raw LaTeX 를 emit 한 케이스) math 구간만 `$...$` 로 한 묶음 wrap.
 * 한글 꼬리 ("…의 값은?", "…일 때") 가 있으면 한글 직전에서 split.
 *
 * 사용자 보고: `\displaystyle 5 - \frac{1}{3} \times \left[ \left\left\{ ...
 * \right\right\} \times \frac{9}{7} - 9 \right]의 값은?` 가 통째로 raw text
 * 로 렌더되는 버그 — 모델이 `$` 를 통째로 누락한 경우. consumeLatexToken
 * 의 token 단위 wrap 으로는 `\displaystyle` 같은 directive 가 빠지고
 * `5 - \frac…` 사이의 spacing 도 깨졌다. line 단위로 미리 wrap 해서 KaTeX
 * 에 통째로 넘기는 게 더 안정적.
 */
const LATEX_HEAVY_CMD =
  /\\(?:displaystyle|textstyle|frac|dfrac|sqrt|left|right|binom|sum|int|prod|lim|cdot|times|div|pm|mp|overrightarrow|overline|widehat|vec|max|min|log|ln|sin|cos|tan|alpha|beta|gamma|theta|pi|sigma|omega|infty|cup|cap|subset|supset|neq|leq|geq|approx|mathrm|mathbf|text|boxed|phantom)\b/g;
const HANGUL_BOUNDARY = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

const preWrapLatexHeavyLines = (text: string): string =>
  text
    .split("\n")
    .map((line) => {
      // 이미 `$` 가 있으면 (부분 wrap 된 줄) 건드리지 말 것 — token 단계가 처리.
      if (line.includes("$")) return line;
      // PRESERVE_MARK 안에 있는 줄 (SVG/표 placeholder) 도 skip.
      if (line.includes(PRESERVE_MARK)) return line;
      const cmds = line.match(LATEX_HEAVY_CMD);
      if (!cmds || cmds.length < 2) return line;
      // marker prefix 보존 (① 1, ㄴ. \frac…, 1. \displaystyle…)
      const m = line.match(/^(\s*(?:>\s?)?(?:[ㄱ-ㅎ]\.|[①②③④⑤⑥⑦⑧⑨⑩]|\d+\.|\d+\)|-|\*)?\s*)([\s\S]+?)$/);
      const prefix = m ? m[1] : "";
      const rest = m ? m[2] : line;
      // math 시작 — 첫 `\backslashcmd`.
      const firstCmdIdx = rest.search(/\\[a-zA-Z]/);
      if (firstCmdIdx < 0) return line;
      const leading = rest.slice(0, firstCmdIdx);
      const mathTail = rest.slice(firstCmdIdx);
      // 한글이 math span 중간에 등장하면 boundary.
      const hangulIdx = mathTail.search(HANGUL_BOUNDARY);
      const mathSpan = hangulIdx >= 0 ? mathTail.slice(0, hangulIdx).trimEnd() : mathTail.trim();
      const trailingText = hangulIdx >= 0 ? mathTail.slice(hangulIdx) : "";
      if (!mathSpan) return line;
      const hasDisplay = /\\displaystyle\b/.test(mathSpan);
      const wrapped = hasDisplay ? `$${mathSpan}$` : `$\\displaystyle ${mathSpan}$`;
      return `${prefix}${leading}${wrapped}${trailingText}`;
    })
    .join("\n");

export const protectLooseLatex = (text: string): string => {
  if (!text) return text;
  // (0) 보존할 HTML 블록 (SVG / 표) 을 placeholder 로 빼둔다.
  const preserved: string[] = [];
  const withPlaceholders = text.replace(PRESERVED_HTML, (match) => {
    const idx = preserved.length;
    preserved.push(match);
    return `${PRESERVE_MARK}HTML${idx}${PRESERVE_MARK}`;
  });
  // (0.5) line-level pre-wrap — LaTeX-heavy 한 줄에 `$` 가 없으면 math 구간
  //       전체를 `$...$` 로 wrap. token-level (1) 이전에 runtime — token-level
  //       은 `\frac{1}{3}` 같은 단일 토큰만 잡고 사이의 `5 - ` 같은 plain
  //       chars 는 raw 로 둬서, KaTeX 가 받지 못해 화면에 raw text 노출.
  const preWrapped = preWrapLatexHeavyLines(withPlaceholders);
  // Split by `$...$` 블록 (block 우선, inline 차순) — odd index = 수식.
  const segmentRe = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
  const parts = preWrapped.split(segmentRe);
  const processed = parts
    .map((seg, idx) => {
      // 수식 안 (odd index) 은 KaTeX 가 알아서 처리. 손대지 않음.
      if (idx % 2 === 1) return seg;
      // (1) 수식 밖 라텍스 토큰을 brace 균형 맞춰 한 묶음으로 wrap.
      let out = "";
      let i = 0;
      while (i < seg.length) {
        if (seg[i] === "\\") {
          const consumed = consumeLatexToken(seg, i);
          if (consumed) {
            out += `$${consumed.token}$`;
            i = consumed.nextIdx;
            continue;
          }
        }
        out += seg[i];
        i++;
      }
      // (2) raw `<` / `>` 이스케이프 — placeholder 누출 차단.
      //     단, 우리가 위에서 막 wrap 한 `$\cmd...$` 는 안전한 형태라
      //     `<` / `>` 가 들어 있지 않아야 정상. 그래서 그냥 전체에 escape.
      //     예외: line-start `>` 는 마크다운 blockquote 마커. 이걸
      //     escape 하면 `(가)(나)` 같은 박스가 사라지므로, sentinel 으로
      //     임시 보호 후 일반 `<` `>` escape 마치고 복원.
      const BQ_MARK = String.fromCharCode(57345); // U+E001 PUA
      out = out.replace(/^(\s*)>/gm, `$1${BQ_MARK}`);
      out = out.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      out = out.replace(new RegExp(BQ_MARK, "g"), ">");
      // (3) `$...$` 밖에 leak 된 `\displaystyle` / `\textstyle` 등 math-mode
      //     directive 제거 — 텍스트 모드에선 의미 없고 raw text 로 노출됨.
      out = out.replace(STRAY_DIRECTIVES, "");
      return out;
    })
    .join("");
  // (4) 보존된 HTML 블록 (SVG / 표) 복원.
  return processed.replace(
    new RegExp(`${PRESERVE_MARK}HTML(\\d+)${PRESERVE_MARK}`, "g"),
    (_, idx: string) => preserved[parseInt(idx, 10)] ?? "",
  );
};

export const sanitizeText = (text: string | undefined): string => {
  if (!text) return text ?? "";
  // 순서: (1) HTML 노이즈 제거 → (2) JSON.parse 백슬래시 복원 →
  //       (3) `$...$` 밖 라텍스 wrap + raw `<` / `>` escape.
  // (3) 은 (2) 다음에 와야 한다 — (2) 가 `frac` → `\frac` 같이 복원해서
  // 우리가 wrap 대상으로 인식 가능한 형태로 만든 다음 wrap 한다.
  return protectLooseLatex(
    fixLatexEscaping(
      text
        .replace(IMG_TAG_RE, "")
        .replace(MD_IMG_RE, "")
        .replace(EMPTY_CENTER_RE, "")
        .trim(),
    ),
  );
};

/**
 * SVG often comes wrapped in markdown fences. Strip them.
 *
 * Handles both single-line fences and the common case where the model adds
 * a language tag, comments, or blank lines between the opening ``` and the
 * actual `<svg>` tag:
 *
 *     ```svg
 *     <!-- comment -->
 *     <svg ...>...</svg>
 *     ```
 *
 * The regex eats the opening fence + everything on its own line, and the
 * closing fence including any leading whitespace.
 */
export const sanitizeSvg = (svg: string | null | undefined): string | null => {
  if (!svg) return null;
  return svg
    .replace(/^\s*```(?:xml|svg|html)?[^\n]*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
};

type AllowedMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

const MEDIA_TYPE_MAP: Record<string, AllowedMediaType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

/**
 * Extract image MIME and base64 payload from a data URL.
 *
 * Falls back to `image/jpeg` when the header is malformed or the MIME type
 * isn't on Anthropic's supported list. We `console.warn` on every fallback
 * so misclassified images surface in dev — a real PNG sent as JPEG will
 * make the vision endpoint reject the request with a confusing error if we
 * silently coerce.
 */
export const parseDataUrl = (
  dataUrl: string,
): { mediaType: AllowedMediaType; data: string } => {
  const match = dataUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  if (!match) {
    // eslint-disable-next-line no-console
    console.warn(
      "[ai/sanitize] parseDataUrl: malformed data URL, falling back to image/jpeg",
    );
    return { mediaType: "image/jpeg", data: dataUrl.split(",")[1] ?? "" };
  }
  const declared = match[1].toLowerCase();
  const mediaType = MEDIA_TYPE_MAP[declared];
  if (!mediaType) {
    // eslint-disable-next-line no-console
    console.warn(
      `[ai/sanitize] parseDataUrl: unsupported MIME '${declared}', falling back to image/jpeg`,
    );
    return { mediaType: "image/jpeg", data: match[2] };
  }
  return { mediaType, data: match[2] };
};
