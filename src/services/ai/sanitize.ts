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
import { cleanMalformedLatex } from "../../lib/textPreprocess.js";

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
      // 사용자 보고 (2026-05-26): `\displaystyle 2x(...) \dfrac{2}{3}y를 계산하면?`
      // 같은 *2 cmd* 라인도 raw 노출. 원인 정밀 추적 안 됨 — 안전망으로
      // `< 2` → `< 1` 완화. 단일 `\frac` 만 있는 라인도 wrap. 부작용 없음:
      // 이미 `$` 있는 줄 skip / PRESERVE_MARK skip / 한글 boundary 정확히 분리.
      if (!cmds || cmds.length < 1) return line;
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
      // **cleanMalformedLatex 적용** — wrap 한 mathSpan 안의 `\left\left{`
      // 같은 모델 typo 를 정상화. 안 그러면 sanitize 가 만든 새 `$...$` 가
      // textPreprocess 의 Step 4/5 거치기 전에 KaTeX 한테 가서 빨간 글씨.
      const cleanedSpan = cleanMalformedLatex(mathSpan);
      const hasDisplay = /\\displaystyle\b/.test(cleanedSpan);
      const wrapped = hasDisplay ? `$${cleanedSpan}$` : `$\\displaystyle ${cleanedSpan}$`;
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

/**
 * `\textcircled{N}` 같은 LaTeX 명령을 한국 교과서 유니코드 글리프로 변환.
 *
 * D:\mathlab\src\lib\pdf-extract-engine\ai\post-processor.ts 75~103 줄 포팅.
 * Gemini 가 가끔 `\textcircled{1}` 으로 emit 하는데 KaTeX 가 못 그림 →
 * 화면에 raw 노출. 직접 유니코드로 변환.
 *
 * 매핑:
 *   `\textcircled{1..20}` → `①②③…⑳` (U+2460 + N-1)
 *   `\textcircled{가나다…하}` → `㉮㉯㉰…㉻` (한글 음절, 14 개)
 *   `\textcircled{ㄱㄴㄷ…ㅎ}` → `㉠㉡㉢…㉭` (자모, 14 개)
 *
 * 호출 순서 CRITICAL: `protectLooseLatex` *전* 에 호출. 안 그러면
 * `\textcircled` 가 `$` 안으로 wrap 되어 KaTeX "Unknown command" 에러.
 */
export const normalizeCircledMarkers = (text: string): string => {
  if (!text) return text;
  return (
    text
      // \text{\textcircled{N}} 중첩 → \text{①} (수식 내부 보호 위해 \text 유지)
      .replace(/\\text\{\\textcircled\{(\d+)\}\}/g, (m, n: string) => {
        const num = Number(n);
        if (num >= 1 && num <= 20) return `\\text{${String.fromCharCode(0x2460 + num - 1)}}`;
        return m;
      })
      // \textcircled{N} (1~20) → ①②③…⑳
      .replace(/\\textcircled\{(\d+)\}/g, (m, n: string) => {
        const num = Number(n);
        if (num >= 1 && num <= 20) return String.fromCharCode(0x2460 + num - 1);
        return m;
      })
      // \textcircled{한글음절 가~하} → ㉮㉯㉰…
      .replace(/\\textcircled\{([가-힣])\}/g, (m, ch: string) => {
        const map: Record<string, string> = {
          가: "㉮", 나: "㉯", 다: "㉰", 라: "㉱", 마: "㉲",
          바: "㉳", 사: "㉴", 아: "㉵", 자: "㉶", 차: "㉷",
          카: "㉸", 타: "㉹", 파: "㉺", 하: "㉻",
        };
        return map[ch] ?? m;
      })
      // \textcircled{자음 ㄱ~ㅎ} → ㉠㉡㉢…
      .replace(/\\textcircled\{([ㄱ-ㅎ])\}/g, (m, ch: string) => {
        const map: Record<string, string> = {
          ㄱ: "㉠", ㄴ: "㉡", ㄷ: "㉢", ㄹ: "㉣", ㅁ: "㉤",
          ㅂ: "㉥", ㅅ: "㉦", ㅇ: "㉧", ㅈ: "㉨", ㅊ: "㉩",
          ㅋ: "㉪", ㅌ: "㉫", ㅍ: "㉬", ㅎ: "㉭",
        };
        return map[ch] ?? m;
      })
  );
};

/**
 * 모델 self-note / chain-of-thought 흔적 제거.
 *
 * 사용자 보고 (10번 다항식): 본문에 영어 메타 코멘트가 그대로 emit 됨 —
 * "(Note: The original image has a division sign here, but the handwritten
 * solution uses multiplication. I will follow the printed text.)"
 *
 * 이는 모델이 *추론 결정 과정* 을 *출력 본문* 에 그대로 노출한 케이스. prompt
 * 로도 가드하지만, sanitize 단에서 *후보정* 으로 한 번 더 제거.
 *
 * 두 채널:
 *   - plain text: `(Note: ...)`, `I will follow ...`, `The original image has ...`
 *   - LaTeX inside `\text{}`: `\text{ (Note: ...) }`, `\text{ I will ... }`
 *
 * 두 채널 모두 처리. 한국어 본문에는 *해당 패턴 없음* 보장 — 영어로 시작하는
 * 메타 코멘트만 매치.
 */
const stripModelSelfNotes = (text: string): string => {
  return text
    // LaTeX \text{} 안 영어 메타 (먼저 — 더 narrow)
    .replace(/\\text\{\s*\(?\s*(Note|note)\s*:\s*[^}]*\}/g, "")
    .replace(
      /\\text\{\s*I (will|am going to|need to|should) (follow|use|treat|interpret|assume|note)[^}]*\}/gi,
      "",
    )
    .replace(
      /\\text\{\s*[Tt]he (original|printed|handwritten|image|note)[^}]*\}/g,
      "",
    )
    // Plain text 영어 메타
    .replace(/\(\s*(Note|note)\s*:\s*[^)]*\)/g, "")
    .replace(
      /^\s*I (will|am going to|need to|should) (follow|use|treat|interpret|assume|note)[^.!\n]*[.!]?\s*$/gim,
      "",
    )
    .replace(
      /^\s*[Tt]he (original|printed|handwritten) (image|drawing|figure|solution|version|text|note)[^.!\n]*[.!]?\s*$/gim,
      "",
    );
};

export const sanitizeText = (text: string | undefined): string => {
  if (!text) return text ?? "";
  // 순서: (0) 모델 self-note 흔적 제거 (영어 메타 코멘트) → (1) HTML 노이즈
  //       제거 → (2) `\textcircled{N}` 유니코드 변환 → (3) JSON.parse 백슬래시
  //       복원 → (4) `$...$` 밖 라텍스 wrap + raw `<` / `>` escape.
  //       (5) literal `\n` / `\t` → 실제 newline / tab (모델 escape 사고).
  // (0) 가 가장 앞이어야 — 영어 메타가 protectLooseLatex 의 wrap 대상에서
  // 빠진 채로 정리 chain 진입.
  // (2) 는 protectLooseLatex 보다 *앞* 이어야 한다 — `\textcircled` 가 `$`
  // 안으로 wrap 되면 KaTeX 가 unknown command 에러를 낸다.
  // (4) 는 (3) 다음 — (3) 이 `frac` → `\frac` 같이 복원해서 (4) 가 wrap
  // 대상으로 인식 가능한 형태로 만든 다음 wrap 한다.
  const wrapped = protectLooseLatex(
    fixLatexEscaping(
      normalizeCircledMarkers(
        stripModelSelfNotes(text)
          .replace(IMG_TAG_RE, "")
          .replace(MD_IMG_RE, "")
          .replace(EMPTY_CENTER_RE, "")
          .trim(),
      ),
    ),
  );
  // (5) literal `\n` / `\t` → 실제 newline / tab 후보정.
  // 사용자 보고 (서술형 4): "...풀이과정을 쓰시오.\\n\\n(단, A > B이다.)"
  // 가 화면에 `\n\n` 두 글자 그대로 노출. 모델이 JSON wire 에서 escape 를
  // 한 번 더 (`\\\\n\\\\n`) 해서 JSON.parse 후 `\\n\\n` literal 이 남은 케이스.
  // LaTeX 명령 (`\nabla`, `\ne`, `\neq`, `\not`) 와 충돌 안 하도록:
  //   - `\\n\\n` 연속 → markdown paragraph break (실제 \n\n)
  //   - 단일 `\\n` 은 다음 char 가 *알파벳이 아닐* 때만 변환 (\nabla 등 보호)
  //   - `\\t` 도 동일 (다음 char 알파벳 아닐 때만 — \times, \theta 보호)
  return wrapped
    .replace(/\\n\\n/g, "\n\n")
    .replace(/\\n(?![a-zA-Z])/g, "\n")
    .replace(/\\t(?![a-zA-Z])/g, "\t");
};

/**
 * 정답 (`answer` 필드) 전용 sanitizer. `sanitizeText` 의 모든 처리에 더해
 * **쉼표 다음 공백 보장** 처리.
 *
 * 사용자 보고: 나열형 정답 `-28,-22,-16,...` 처럼 쉼표 다음 공백이 없어
 * 다닥다닥 붙어 가독성 떨어짐. KaTeX 의 thin space 는 math mode 안 쉼표
 * 에만 적용되므로, plain text 쉼표는 직접 공백을 박아야 함.
 *
 * `$...$` 안의 쉼표는 KaTeX 가 알아서 처리하므로 건드리지 않음 — math
 * block 을 placeholder 로 분리한 뒤 외부만 가공.
 */
export const sanitizeAnswer = (text: string | undefined): string => {
  const base = sanitizeText(text);
  if (!base) return base;
  // `$...$` (블록 + 인라인) 보호. PUA sentinel 사용 — Edit 도구 함정 회피
  // 위해 String.fromCharCode 명시 (CLAUDE.md 4-1).
  const SENTINEL = String.fromCharCode(57346); // U+E002
  const protectedBlocks: string[] = [];
  let i = 0;
  let protectedText = base.replace(/\$\$[\s\S]+?\$\$/g, (m) => {
    protectedBlocks.push(m);
    return `${SENTINEL}B${i++}${SENTINEL}`;
  });
  protectedText = protectedText.replace(/\$[^$\n]+?\$/g, (m) => {
    protectedBlocks.push(m);
    return `${SENTINEL}I${i++}${SENTINEL}`;
  });
  // 쉼표 다음에 공백이 없으면 한 칸 주입. ", " (이미 공백) 은 그대로.
  const spaced = protectedText.replace(/,(?!\s)/g, ", ");
  // 복원.
  return spaced.replace(
    new RegExp(`${SENTINEL}[BI](\\d+)${SENTINEL}`, "g"),
    (_, idx: string) => protectedBlocks[parseInt(idx, 10)] ?? "",
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

/**
 * 모델이 객관식 답을 "9" / "$\\frac{1}{2}$" 같은 *값* 으로 줬을 때, 보기
 * 배열과 대조해서 ①②③ 마커 + 값 으로 정규화.
 *
 * D:\mathlab\src\lib\pdf-extract-engine\ai\post-processor.ts 248~266 줄 포팅.
 *
 * **가드** (mathlab 코드 252 줄 보존): 이미 ①②③④⑤ 마커가 있는 답은 skip.
 * `normalize` 가 `$` 제거 후 비교하므로 `"② $\\frac{1}{2}$"` 같은 형태가
 * *오매치* 될 위험이 있음 — 가드 절대 제거 X.
 *
 * 매칭 실패 시 원본 그대로 반환 (보수적).
 */
export const resolveMCAnswer = (
  answer: string,
  choices: string[] | null | undefined,
): string => {
  if (!answer || !Array.isArray(choices) || choices.length === 0) return answer;
  const trimmed = answer.trim();
  // 이미 올바른 마커 형식이면 건드리지 않음 (CRITICAL — 가드 절대 제거 X).
  if (/^[①②③④⑤⑥⑦⑧⑨⑩,\s]+$/.test(trimmed)) return trimmed;
  if (/^[ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊ,\s]+$/.test(trimmed)) return trimmed;
  if (/^[㉠㉡㉢㉣㉤㉮㉯㉰㉱㉲,\s]+$/.test(trimmed)) return trimmed;

  // 정규화 — `$` 제거 + 공백 제거 + 안전 char 만 남김. 둘 다 같은 처리.
  const normalize = (s: string): string =>
    s
      .replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/, "")
      .replace(/\$/g, "")
      .replace(/\s+/g, "")
      .replace(/[^0-9A-Za-z\-+/\\{}.()]/g, "");

  const normAns = normalize(trimmed);
  if (!normAns) return trimmed;
  const idx = choices.findIndex((c) => normalize(c) === normAns);
  if (idx < 0) return trimmed;
  return "①②③④⑤⑥⑦⑧⑨⑩"[idx] ?? trimmed;
};

/**
 * 객체의 모든 문자열 필드에 sanitize 함수를 재귀 적용.
 *
 * D:\mathlab\src\lib\pdf-extract-engine\ai\post-processor.ts 290~308 줄 포팅.
 *
 * 미래 schema 확장 시 활용. 현재는 `{ solution, answer }` 같은 단순 객체에도
 * 안전하게 적용 가능. maxDepth 가드로 무한 재귀 방지.
 */
export const deepFixText = <T>(
  obj: T,
  fixText: (text: string) => string,
  maxDepth = 5,
): T => {
  if (maxDepth <= 0) return obj;
  if (typeof obj === "string") return fixText(obj) as T;
  if (Array.isArray(obj)) {
    return obj.map((item) => deepFixText(item, fixText, maxDepth - 1)) as T;
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = deepFixText(value, fixText, maxDepth - 1);
    }
    return result as T;
  }
  return obj;
};
