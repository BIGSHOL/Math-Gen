import React from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import katex from "katex";
import { parseBoxCols, resolveCols } from "@app/lib/boxGrid";
import { cleanMalformedLatex, parseImageTitle, preprocessMathText } from "@app/lib/textPreprocess";
import { groupFigureRows, type FigBox } from "@app/lib/figureLayout";

/**
 * Korean math content renderer.
 *
 * Ported pattern-for-pattern from F:\mathlab\src\components\math\MathRenderer.tsx —
 * that component has been hardened against years of real workbook content
 * (모의평가, 학평, 수능, 내신). Specifically:
 *
 *  - **Pipeline**: remark-gfm → remark-math → remark-breaks → rehype-raw →
 *    rehype-katex (strict:false). Order matters: gfm before math so table
 *    pipes don't get treated as math delimiters; breaks last on the remark
 *    side so we honor single-line newlines from the model.
 *  - **`<보기>` cols grid**: blockquote whose first non-empty line contains
 *    `<보기>` or `<보기:cols=N>` is rendered as a bordered card. Items
 *    after the header are arranged in `cols`-many columns. With no marker,
 *    a single column is used (preserves legacy 다단계 계산식 blockquotes).
 *  - **`[그림N]` SVG injection**: if a `diagramSvgs` array is supplied, the
 *    markdown placeholders `[그림1]`, `[그림2]`, etc. are replaced with the
 *    actual SVG. `[그림]` (no number) consumes the list sequentially.
 *  - **`[한글 설명]` → placeholder pill**: bare bracketed Korean text becomes
 *    a dashed-border pill so the AI's diagram descriptions still convey
 *    intent even when no SVG is provided. Math intervals like `[-2, 4]`
 *    and 보기 markers `[ㄱ]` are excluded by the regex guards.
 *  - **Image `width` / `align`**: markdown image titles like
 *    `![alt](url "50% center")` are parsed by `parseImageTitle` (already
 *    in `textPreprocess.ts`) to set width and float/center alignment.
 *
 * The component used to live at root `components/MarkdownRenderer.tsx` and
 * only handled `\lim → \lim\limits`. This rewrite supersedes that — keep
 * the import path stable for legacy callers.
 */

export interface DiagramSvgItem {
  svg: string;
  /** Optional label rendered on hover; currently unused. */
  label?: string;
  align?: "left" | "center" | "right";
  size?: "small" | "medium" | "large" | "full";
  /** full-page bbox [yMin,xMin,yMax,xMax] (0–1000) — 위치 기반 행 배치(Stage 1c)용. */
  box?: [number, number, number, number];
}

/**
 * 5지선다 보기 grid layout (rows × cols). 명명 = 원본 시각 매핑:
 *   - "auto": maxLen 휴리스틱 (default — ≤25 chars → 2 cols, else 1)
 *   - "1x5":  1 행 × 5 열 (가로)
 *   - "2x3":  2 행 × 3 열 (3+2 split)
 *   - "3x2":  3 행 × 2 열 (2+2+1 split)
 *   - "5x1":  5 행 × 1 열 (세로)
 *
 * tall LaTeX (cases/matrix/aligned) 검출 시 layout 무관하게 5x1 강제 (cramped 회피).
 * Phase #7 사용자 보고 — OCRProblem.choicesLayout 에서 전달.
 */
export type ChoicesLayoutHint = "auto" | "1x5" | "2x3" | "3x2" | "5x1";

export interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** Render as inline `<span>` rather than block `<div>` (for blank templates etc.). */
  inline?: boolean;
  /** SVG strings that will replace `[그림N]` placeholders in content. */
  diagramSvgs?: DiagramSvgItem[];
  /**
   * 사용자 결정 (2026-05-27): SVG 없는 [그림N] 자리를 *크롭 이미지* 로 대체.
   * 우선순위 — diagramSvgs[idx] 가 있으면 그것, 없으면 imageCrops[idx] 의 src 를
   * `<img>` 로 inline. 둘 다 없으면 [그림N] placeholder 그대로 유지.
   *
   * indexing 은 `[그림N]` 의 N (1-indexed) → 배열 idx (0-indexed) 변환.
   */
  imageCrops?: Array<{
    src: string;
    label?: string;
    /** full-page bbox [yMin,xMin,yMax,xMax] (0–1000) — 위치 기반 행 배치(Stage 1c)용. */
    box?: [number, number, number, number];
  }>;
  /**
   * Phase #7: 원본 보기 배치 hint. OCR 모델이 인식한 grid 를 그대로 렌더.
   * 기본 "auto" — 옵션 길이 기반 자동 결정. tall LaTeX 검출 시 5x1 강제 override.
   */
  choicesLayout?: ChoicesLayoutHint;
}

const SIZE_STYLE: Record<NonNullable<DiagramSvgItem["size"]>, string> = {
  small: "max-width:160px",
  medium: "max-width:280px",
  large: "max-width:400px",
  full: "width:100%",
};

/**
 * Detects whether a paragraph's children form a complete 5-option
 * multiple-choice row (markers ①②③④⑤ in order, each followed by some
 * content). If so, splits the React children at the markers and wraps each
 * option in `<span class="choice">…</span>` inside a grid container.
 *
 * **Adaptive layout** (mirrors mathlab's `resolveChoiceCols` rule —
 * mathlab never uses 5 columns; default is 2, drop to 1 when options run
 * long enough that 2-column wrapping looks cramped):
 *   - max option length ≤ 25  → 2 columns (3+2 layout — fits most short
 *     numeric and fraction-style options)
 *   - max > 25                → 1 column (long expressions like
 *     "$p = -1/2, q = \\sqrt{5}/2$")
 *
 * Why split at React-children level instead of pre-processing the string:
 * remark-math only sees markdown text, never the inside of raw HTML, so a
 * naive `<span>$1$</span>` would render `$1$` literally. By the time
 * children reach the `<p>` component, math nodes are already rendered
 * React elements — we just regroup them around the ①②③④⑤ characters
 * that appear in adjacent text nodes.
 *
 * Returns `null` when the paragraph doesn't match, letting the caller
 * fall back to the normal paragraph render.
 */
const measureSlotLength = (slot: React.ReactNode[]): number => {
  // KaTeX-rendered React elements have no easily-recoverable raw LaTeX, so
  // we approximate: text contributes its character count, every math/element
  // contributes a fixed weight that roughly matches typical fraction width.
  // The threshold values are calibrated against this weight, not against
  // measured pixels — close enough for layout selection.
  const MATH_WEIGHT = 6;
  let len = 0;
  for (const node of slot) {
    if (typeof node === "string") {
      len += node.replace(/\s+/g, " ").trim().length;
    } else if (React.isValidElement(node)) {
      len += MATH_WEIGHT;
    }
  }
  return len;
};

/**
 * Detect whether a slot contains a "tall" KaTeX block (cases / matrix /
 * aligned / array). prerenderAllKatex marks such placeholders with
 * `data-katex-tall="1"`, components.span propagates it to the rendered span.
 * Here we scan slot nodes for that flag — if any choice option contains a
 * tall block, the whole row must drop to 1-column layout (otherwise two
 * cases blocks side by side get cramped, and ① markers fall to vertical
 * center). CLAUDE.md §2-18.
 */
const slotHasTallContent = (slot: React.ReactNode[]): boolean => {
  for (const node of slot) {
    if (!React.isValidElement(node)) continue;
    const props = node.props as Record<string, unknown> | undefined;
    if (props && props["data-katex-tall"] === "1") return true;
  }
  return false;
};

/**
 * Phase #7: explicit layout hint → grid column count + className suffix.
 * tall LaTeX 시 무관하게 1-col (5x1) 으로 override. auto 는 maxLen 기반.
 */
const resolveChoiceGrid = (
  layout: ChoicesLayoutHint,
  anyTall: boolean,
  maxLen: number,
): { cols: 1 | 2 | 3 | 5; layoutClass: string } => {
  // tall content 검출 시 무조건 1열 (5x1) — cases blocks 가 가로로 압축되면 cramped
  if (anyTall) return { cols: 1, layoutClass: "layout-5x1 has-tall" };
  switch (layout) {
    case "1x5":
      return { cols: 5, layoutClass: "layout-1x5" };
    case "2x3":
      return { cols: 3, layoutClass: "layout-2x3" };
    case "3x2":
      return { cols: 2, layoutClass: "layout-3x2" };
    case "5x1":
      return { cols: 1, layoutClass: "layout-5x1" };
    case "auto":
    default:
      // 기존 자동 휴리스틱 — maxLen 25 기준
      return maxLen > 25
        ? { cols: 1, layoutClass: "layout-auto-1" }
        : { cols: 2, layoutClass: "layout-auto-2" };
  }
};

const renderChoiceRowOrNull = (
  children: React.ReactNode,
  layout: ChoicesLayoutHint = "auto",
): React.ReactNode | null => {
  const markers = ["①", "②", "③", "④", "⑤"] as const;
  type Marker = (typeof markers)[number];
  const isMarker = (s: string): s is Marker => (markers as readonly string[]).includes(s);

  const slots: React.ReactNode[][] = [[], [], [], [], []];
  let currentSlot = -1;
  let seenAllInOrder = false;
  let inheritedKey = 0;

  const flat = React.Children.toArray(children);
  for (const child of flat) {
    if (typeof child === "string") {
      // Split this string into markers and intervening text fragments.
      const parts = child.split(/([①②③④⑤])/).filter((p) => p !== "");
      for (const part of parts) {
        if (isMarker(part)) {
          const idx = markers.indexOf(part);
          // Must arrive in strict order ① → ② → ③ → ④ → ⑤.
          if (idx !== currentSlot + 1) return null;
          currentSlot = idx;
          if (currentSlot === 4) seenAllInOrder = true;
        } else if (currentSlot >= 0) {
          // Text fragment after the current marker — drop leading whitespace
          // since the marker already prints itself with a non-breaking space.
          const trimmed = currentSlot >= 0 ? part.replace(/^\s+/, "") : part;
          if (trimmed.length > 0) slots[currentSlot].push(trimmed);
        }
        // text before the very first ① is dropped — it's whitespace/lead.
      }
    } else if (currentSlot >= 0) {
      // Non-text child (KaTeX math, image, etc.) — append to current slot,
      // assigning a unique key so React doesn't warn about duplicates.
      const node = React.isValidElement(child)
        ? React.cloneElement(child as React.ReactElement, { key: `c-${inheritedKey++}` })
        : child;
      slots[currentSlot].push(node);
    }
  }
  if (!seenAllInOrder) return null;

  // Phase #7: layout hint 우선 적용. tall content 시 무관하게 5x1.
  // Phase #2 (cases harness) 와 통합 — tall 검출은 동일 함수.
  const maxLen = Math.max(...slots.map(measureSlotLength));
  const anyTall = slots.some(slotHasTallContent);
  const { cols, layoutClass } = resolveChoiceGrid(layout, anyTall, maxLen);

  return (
    <div className={`choice-row cols-${cols} ${layoutClass}`}>
      {slots.map((s, i) => (
        <span key={i} className="choice">
          <span className="choice-marker">{markers[i]}</span>
          {s}
        </span>
      ))}
    </div>
  );
};

/**
 * Defensive normalization for inline `<svg>` blocks the model emits as part
 * of the OCR output. Two concerns:
 *
 *   1. **Math typography**: SVG `<text>` cannot host KaTeX, so we make sure
 *      every text element renders in italic Times — the same visual cue
 *      KaTeX uses for variables. If the model already declared a font we
 *      respect it; if not, we inject sensible defaults.
 *
 *   2. **Oversized "point" dots**: occasionally the model emits
 *      `<circle r="6">` for an axis-tick dot, which then dwarfs the 13-px
 *      label. We cap `r` at 4 to keep dots proportional. Larger circles
 *      that are clearly the figure itself (e.g. a full geometry circle)
 *      have `cx`/`cy` farther from any text — but those usually use
 *      `stroke="…" fill="none"` rather than the small filled dot pattern,
 *      so we only clamp when fill is set (or omitted, which defaults to
 *      black-fill).
 *
 * The CSS global rule (`svg text { paint-order: stroke; stroke: white; … }`)
 * provides the third layer of defense — even if a label sits on top of a
 * line, the white outline keeps it legible.
 */
/**
 * Pre-render KaTeX inside raw HTML blocks (most importantly <table>) before
 * react-markdown sees the content.
 *
 * Why this is needed: remark-math only walks the markdown AST — math
 * delimiters that appear INSIDE a raw HTML block (e.g. <td>$y = \frac{1}{2}
 * (x+1)^2$</td>) are never visited by the AST walk, so rehype-katex never
 * processes them and they end up displayed verbatim ("$y = \frac{1}{2}…")
 * in the final DOM. This is the failure mode behind 22번's table where the
 * formula cell shows raw LaTeX with dollar signs.
 *
 * The fix is to render those `$...$` snippets to HTML ourselves via
 * katex.renderToString, then leave the resulting <span class="katex">…</span>
 * in place. rehype-raw passes that HTML through untouched.
 */
/**
 * Pattern of characters KaTeX has no metrics for but our OCR content
 * routinely contains (Korean multiple-choice markers, KaTeX_Main has no
 * "circled digit" glyphs). When seen inside `$...$`, KaTeX logs noisy
 * "No character metrics" warnings to the console (one per char per render)
 * and falls back to default metrics — visually fine, but the console
 * floods. We silently filter just this specific warning while katex runs,
 * letting all other warnings through unchanged.
 */
const KATEX_METRIC_WARN_RE = /No character metrics for/;

const renderKatex = (tex: string, displayMode: boolean): string => {
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (typeof args[0] === "string" && KATEX_METRIC_WARN_RE.test(args[0])) return;
    origWarn.apply(console, args);
  };
  try {
    // Final guard — preprocessMathText / sanitize 가 어떤 path 로 와도 못
    // 잡은 모델 typo (\left\left, \approx, 빈 분수 등) 가 KaTeX 까지 도달하면
    // 빨간 에러 fallback 으로 표시됨. KaTeX 가 받기 직전에 한 번 더 정상화.
    // + 중첩/leak 된 `$` 제거 — `$$...$$` 안에 `$...$` 가 중첩되면 block 추출이
    //   inner 의 `$` 까지 잡아 KaTeX 에 넘김 → `$` 가 math 모드 무효라 빨간
    //   에러(사용자 보고 2026-06-02). `\$` (리터럴 달러)는 보존.
    const safeTex = cleanMalformedLatex(tex).replace(/(?<!\\)\$/g, "");
    return katex.renderToString(safeTex, {
      throwOnError: false,
      strict: false,
      output: "html",
      displayMode,
      // Allow `\htmlClass` only — used by `uprightGeometryLabels` to tag
      // arc-notation spans (`.geom-arc-wrap`) so CSS can draw a smooth ⌒
      // curve via border-radius (KaTeX has no native smooth-arc accent).
      // We deliberately don't allow `\href` / `\htmlData` / `\url` because
      // OCR'd content is untrusted and those could inject links.
      trust: (ctx) => ctx.command === "\\htmlClass",
    });
  } catch {
    // Render failure → return the original LaTeX wrapped in <code> so the
    // user can still see what was supposed to be there.
    return `<code>${tex}</code>`;
  } finally {
    console.warn = origWarn;
  }
};

/**
 * Pre-render EVERY `$...$` and `$$...$$` in the input to HTML, store the
 * KaTeX output in a Map, and leave behind a placeholder span/div.
 *
 * Why this exists (independent of the prior table-only version):
 * KaTeX implements √, ‖, large parens etc. as inline `<svg><path/></svg>`
 * elements. When that SVG passes through react-markdown's normal pipeline
 * (remark-math → rehype-katex → React), React's `createElement('svg')`
 * gets called WITHOUT a parent SVG namespace context, so the resulting
 * DOM node is HTML-namespaced — the `<path>` inside renders invisibly,
 * leaving sqrt glyphs as empty boxes (the "5 sits in the slot but √
 * doesn't appear" bug the user reported).
 *
 * Doing the KaTeX render here, BEFORE react-markdown sees the content,
 * lets us route the entire KaTeX HTML through our existing Stage-0
 * dangerouslySetInnerHTML escape hatch. The browser parses the SVG itself
 * and gets the namespace right.
 *
 * Returns the rewritten string AND the map of placeholder-id → HTML so the
 * caller can hand it to the components renderer.
 */
/**
 * Tall (multi-row) LaTeX environments. When a `$...$` contains one of these,
 * the rendered output extends *vertically beyond a normal text line*, so the
 * surrounding layout needs special handling — most notably the 5-option
 * 보기 grid needs to (a) drop to 1-column layout and (b) align ① markers to
 * the TOP of the tall block instead of baseline (which would put ① in the
 * vertical middle of the cases). CLAUDE.md §2-18 — 사용자 보고: "보기번호
 * 와 문항이 따로 노는것 같네 ... 실제 문제처럼 보기번호 우측에 연립방정식으로."
 */
const TALL_LATEX_RE =
  /\\begin\{(cases|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|Bmatrix|aligned|gathered|array|split)\}/;

const prerenderAllKatex = (
  text: string,
): { content: string; katexMap: Map<string, string> } => {
  const map = new Map<string, string>();
  let nextId = 0;
  const reserve = (html: string, kind: "inline" | "block", tall: boolean): string => {
    const id = String(nextId++);
    map.set(id, html);
    const tallAttr = tall ? ' data-katex-tall="1"' : "";
    return kind === "block"
      ? `\n\n<div data-katex-id="${id}"${tallAttr}></div>\n\n`
      : `<span data-katex-id="${id}"${tallAttr}></span>`;
  };
  // Block math first ($$...$$). Use a tight non-greedy match so we don't
  // accidentally swallow multiple paragraphs.
  let out = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) =>
    reserve(renderKatex(tex.trim(), true), "block", TALL_LATEX_RE.test(tex)),
  );
  // Inline math: $...$ on a single line. We bail out on newlines so a
  // stray $ doesn't pair across paragraphs.
  out = out.replace(/\$([^$\n]+?)\$/g, (_, tex: string) =>
    reserve(renderKatex(tex, false), "inline", TALL_LATEX_RE.test(tex)),
  );
  return { content: out, katexMap: map };
};

/**
 * Phase #10: SVG <text> content 분석 후 font-style 자동 결정.
 * 본문 KaTeX 의 uprightGeometryLabels (textPreprocess.ts) 와 *완전 일관*:
 *  - 점 라벨 (단일 또는 다중 대문자 + 옵션 prime: A, ABCD, A', P'') → 직립
 *  - 점 라벨 + 숫자 첨자 (P1, A2, X3) → 직립
 *  - 순수 숫자·상수 (-3, 1/2, 0.5, π, °) → 직립
 *  - 변수 / 다중 문자 변수 표현 / 혼합 (x, sin, 5y) → italic (default)
 *
 * 사용자 보고 (2026-05-27 재): "여전히 문제 내의 글자와 그림으로 표현된
 * 글자가 폰트가 달라. 폰트 일치화 작업할것."
 *
 * **본문 KaTeX 와의 정합성 검증 (2026-05-27 검토)**:
 *   본문 PURE_LABEL_REGEX = /^\s*([A-Z][A-Z']*)\s*$/
 *   본문은 `$ABCD$` 같은 다중 대문자도 `\mathrm{ABCD}` 로 직립 wrap.
 *   따라서 SVG POINT_LABEL_RE 도 단일이 아니라 다중 대문자 매치해야 함.
 *   (이전 정규식은 단일 대문자만 매치 → 본문 ABCD 직립 vs SVG ABCD italic
 *   불일치 발생.)
 */
// 단일/다중 대문자 + 옵션 prime + 옵션 1자리 숫자 첨자 (P1, A2).
// 본문 uprightGeometryLabels 의 PURE_LABEL_REGEX 와 동일 패턴.
const POINT_LABEL_RE = /^[A-Z][A-Z'′]*[0-9]?$/;
// 정수, 음수, 소수, 분수 표기, π·°·√·± 같은 상수 기호.
const PURE_NUMERIC_RE = /^-?\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)?$|^[π°√±∞∅]$/;

const defaultFontStyleForText = (textContent: string): "normal" | "italic" => {
  const t = textContent.trim();
  if (!t) return "italic";
  if (POINT_LABEL_RE.test(t)) return "normal"; // 점 라벨 = 직립
  if (PURE_NUMERIC_RE.test(t)) return "normal"; // 순수 숫자·상수 = 직립
  return "italic"; // 변수 / 다중 문자 / 혼합 = italic
};

const normalizeInlineSvgs = (html: string): string => {
  // Pass A — <text> element 마다 font-family / font-style default 주입.
  // 사용자 보고 (2026-05-27): 도형 안 점 라벨이 italic 인데 본문은 직립 →
  // 시각 불일치. content 분석해 점/숫자 = normal, 변수 = italic 으로 분기.
  // 모델이 직접 명시한 font-style/font-family 는 *그대로 존중* (override X).
  let out = html.replace(
    /<text(\s[^>]*)?>([\s\S]*?)<\/text>/g,
    (_match, attrs: string | undefined, content: string) => {
      let a = attrs ?? "";
      if (!/\bfont-family\s*=/i.test(a)) {
        a += ' font-family="Times New Roman, serif"';
      }
      if (!/\bfont-style\s*=/i.test(a)) {
        // text content 의 내부 markup (예: <tspan>) 제거 후 분석
        const plainText = content.replace(/<[^>]+>/g, "");
        const style = defaultFontStyleForText(plainText);
        a += ` font-style="${style}"`;
      }
      return `<text${a}>${content}</text>`;
    },
  );

  // Pass B — clamp small-dot radii so labels aren't overwhelmed.
  out = out.replace(/<circle\b([^>]*?)\br\s*=\s*"(\d+(?:\.\d+)?)"/g, (m, pre: string, rStr: string) => {
    const r = parseFloat(rStr);
    // Heuristic: a small filled dot has r < 10 and no `fill="none"`. We
    // only clamp those (so geometry-defining circles like inscribed circles
    // pass through untouched).
    if (r > 4 && r < 10 && !/fill\s*=\s*"none"/i.test(pre)) {
      return m.replace(/\br\s*=\s*"\d+(?:\.\d+)?"/, 'r="3.5"');
    }
    return m;
  });

  // Pass C — ensure every <svg> root carries `shape-rendering="geometricPrecision"`.
  // Browsers default to `auto`, which can favour speed over smooth curves;
  // forcing geometricPrecision keeps Bézier paths crisp at any zoom level.
  // Per AI Studio's diagnosis, this is one of the cheap wins for diagram quality.
  // Also inject explicit width/height from the viewBox if the model emitted
  // a viewBox-only <svg>. Without intrinsic dimensions the browser collapses
  // the SVG to 0×0 (the SVG is in the DOM but renders invisibly) — this is
  // the failure mode that made figures appear missing even after the
  // namespace fix landed.
  out = out.replace(/<svg(\s[^>]*)?>/g, (_, rawAttrs: string | undefined) => {
    let a = rawAttrs ?? "";
    if (!/\bshape-rendering\s*=/i.test(a)) a += ' shape-rendering="geometricPrecision"';
    const hasWidth = /\bwidth\s*=/i.test(a);
    const hasHeight = /\bheight\s*=/i.test(a);
    if (!hasWidth && !hasHeight) {
      const vb = a.match(/\bviewBox\s*=\s*"([^"]+)"/i);
      if (vb) {
        const parts = vb[1].split(/\s+/).map((n) => parseFloat(n));
        if (parts.length === 4 && Number.isFinite(parts[2]) && Number.isFinite(parts[3])) {
          a += ` width="${parts[2]}" height="${parts[3]}"`;
        }
      }
    }
    return `<svg${a}>`;
  });

  // Pass D — 폐곡선 자동 닫기. 사용자 보고 (2026-05-27): "사각형이 마무리가
  // 안되었네. 변이 하나 없어". 모델이 4 개 <line> 으로 사각형을 그렸는데
  // 마지막 변을 emit 안 하는 케이스 보정.
  //
  // 알고리즘: SVG 안의 <line> endpoint 들을 grouping (tolerance = bbox 대각선
  // 의 2%). degree-1 endpoint 가 정확히 2 개이고 그 두 점 사이 거리가 도형
  // bbox 대각선의 60% 이내면 → 자동 닫는 line 추가.
  //
  // 안전 가드 (false positive 차단):
  //  - line 개수 3~12 일 때만 (3 미만 = 후보 X, 12 초과 = 복잡 도형 위험)
  //  - degree-1 endpoint 정확히 2 개 (1 개 = 닫힌 도형, 4 개+ = 복잡)
  //  - dangling 간격 < bbox 대각선 60% (멀면 의도된 열린 도형)
  out = out.replace(/<svg\b[\s\S]*?<\/svg>/g, (svgBlock) => closeOpenPolygons(svgBlock));

  return out;
};

/**
 * SVG 한 블록 안의 unclosed line-polygon 을 검출해 닫는 line 자동 삽입.
 * normalizeInlineSvgs Pass D 의 helper — KaTeX SVG 는 prerenderAllKatex 가
 * 별도 처리하므로 여기 들어오지 않음 (본문 도형 SVG 만 대상).
 */
const closeOpenPolygons = (svgBlock: string): string => {
  // <line ... /> 또는 <line ...></line> 양쪽 매치.
  const LINE_RE = /<line\b([^>]*?)\/?>/g;
  const getAttr = (attrs: string, name: string): string | null => {
    const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]+)"`));
    return m ? m[1] : null;
  };
  interface LineSeg {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    raw: string;
  }
  const lines: LineSeg[] = [];
  let m: RegExpExecArray | null;
  while ((m = LINE_RE.exec(svgBlock)) !== null) {
    const attrs = m[1] ?? "";
    const x1 = parseFloat(getAttr(attrs, "x1") ?? "");
    const y1 = parseFloat(getAttr(attrs, "y1") ?? "");
    const x2 = parseFloat(getAttr(attrs, "x2") ?? "");
    const y2 = parseFloat(getAttr(attrs, "y2") ?? "");
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;
    // 점선·축 보조선 등은 제외 — stroke-dasharray 있으면 후처리 대상 X.
    if (/stroke-dasharray\s*=/i.test(attrs)) continue;
    lines.push({ x1, y1, x2, y2, raw: m[0] });
  }
  // line 개수 가드 — 너무 적거나 많으면 사각형 후보 아님.
  if (lines.length < 3 || lines.length > 12) return svgBlock;

  // bbox + tolerance.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const L of lines) {
    minX = Math.min(minX, L.x1, L.x2);
    maxX = Math.max(maxX, L.x1, L.x2);
    minY = Math.min(minY, L.y1, L.y2);
    maxY = Math.max(maxY, L.y1, L.y2);
  }
  const D = Math.hypot(maxX - minX, maxY - minY);
  if (D <= 0) return svgBlock;
  const TOL = Math.max(1, D * 0.02);

  // endpoint grouping + degree 계산.
  interface Pt {
    x: number;
    y: number;
    degree: number;
  }
  const pts: Pt[] = [];
  const findOrAdd = (x: number, y: number): void => {
    for (const p of pts) {
      if (Math.hypot(p.x - x, p.y - y) <= TOL) {
        p.degree += 1;
        return;
      }
    }
    pts.push({ x, y, degree: 1 });
  };
  for (const L of lines) {
    findOrAdd(L.x1, L.y1);
    findOrAdd(L.x2, L.y2);
  }

  // degree-1 (= dangling) 후보 정확히 2 개여야 안전.
  const dangling = pts.filter((p) => p.degree === 1);
  if (dangling.length !== 2) return svgBlock;
  const [a, b] = dangling;
  const gap = Math.hypot(a.x - b.x, a.y - b.y);
  if (gap < TOL) return svgBlock; // 이미 거의 닫힘
  if (gap > D * 0.6) return svgBlock; // 너무 멀면 의도된 열린 도형 (예: arrow tail)

  // 첫 line 의 stroke 속성을 그대로 따라간 닫는 line 생성.
  const sample = lines[0].raw;
  const strokeMatch = sample.match(/stroke\s*=\s*"([^"]+)"/);
  const widthMatch = sample.match(/stroke-width\s*=\s*"([^"]+)"/);
  const stroke = strokeMatch ? strokeMatch[1] : "black";
  const sw = widthMatch ? widthMatch[1] : "2";
  const closingLine = `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${stroke}" stroke-width="${sw}"/>`;

  // </svg> 직전에 삽입.
  return svgBlock.replace(/<\/svg>/, `${closingLine}</svg>`);
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = "",
  inline,
  diagramSvgs,
  imageCrops,
  choicesLayout = "auto",
}) => {
  // Stage 0: inline <svg>…</svg> extraction.
  //
  // Why this exists: when raw SVG ships through react-markdown + rehype-raw,
  // React turns each <svg>/<text>/<circle>/<line>/<path> child into an HTML
  // element via createElement('text'), which inherits the HTML namespace
  // ("The tag <text> is unrecognized in this browser") and rejects kebab-case
  // SVG attributes ("Invalid DOM property `font-family`"). Result: the
  // diagram either doesn't render at all or renders in the wrong namespace
  // with the wrong attribute names. AI Studio sidesteps this by using
  // dangerouslySetInnerHTML — the browser parses the SVG itself and gets
  // the namespace right.
  //
  // We do the same: pull every <svg>…</svg> block out of the markdown
  // before rehype-raw ever sees it, store the normalized SVG string in a
  // Map, and leave behind a unique placeholder <div data-svg-id="…">. The
  // ReactMarkdown components map below intercepts those placeholder divs
  // and renders them via dangerouslySetInnerHTML so the browser parses the
  // SVG natively and gets the namespace right.
  const svgPlaceholders = new Map<string, string>();
  // Stage 1c(위치 기반 행 배치)용 — placeholder key → full-page box.
  // key = svg 의 data-svg-id (Stage 1) 또는 "img-<idx>" (Stage 1b). box 없으면
  // 미기록 → 행에 편입 안 됨(세로 스택 유지).
  const figureBoxes = new Map<string, FigBox | undefined>();
  let nextPlaceholderId = 0;
  let svgExtractedContent = content.replace(
    /<svg\b[\s\S]*?<\/svg>/gi,
    (match) => {
      const id = String(nextPlaceholderId++);
      svgPlaceholders.set(id, normalizeInlineSvgs(match));
      return `\n\n<div data-svg-id="${id}"></div>\n\n`;
    },
  );

  // Stage 1: SVG placeholder substitution. Must run BEFORE preprocessMathText
  // so the LaTeX inside the SVG isn't mangled.
  let svgReplacedContent = svgExtractedContent;
  if (diagramSvgs && diagramSvgs.length > 0) {
    let nextIdx = 0;
    const replaceSvg = (
      _fullMatch: string,
      svg: string,
      input: string,
      offset: number,
      idx?: number,
    ) => {
      const dIdx = idx ?? nextIdx++;
      const item = diagramSvgs[dIdx];
      if (!item) return _fullMatch;
      const align = item.align;
      const alignClass =
        align === "center"
          ? " diagram-align-center"
          : align === "right"
            ? " diagram-align-right"
            : "";
      const sizeStyle = SIZE_STYLE[item.size ?? "full"] ?? SIZE_STYLE.full;

      // [그림N] SVGs use the same placeholder mechanism as the inline
      // <svg> extraction above — store the SVG string in the map and emit a
      // data-svg-id placeholder div. The components.div renderer below
      // injects via dangerouslySetInnerHTML, which gets the SVG namespace
      // right; otherwise the raw SVG would hit the same "<text> is
      // unrecognized in this browser" trap.
      const phId = String(nextPlaceholderId++);
      svgPlaceholders.set(phId, normalizeInlineSvgs(svg));
      figureBoxes.set(phId, item.box); // Stage 1c 위치 배치용 (없으면 undefined)

      // If the placeholder sits inside a `>` blockquote line, render as
      // inline span instead of a block div (keeps the SVG inside the box).
      const before = input.substring(0, offset);
      const lastNewline = before.lastIndexOf("\n");
      const currentLine = before.substring(lastNewline + 1);
      const inBlockquote = currentLine.trimStart().startsWith(">");
      if (inBlockquote) {
        return `<span data-svg-id="${phId}" data-svg-inline="bq${alignClass ? " " + alignClass.trim() : ""}"></span>`;
      }
      return `\n\n<div data-svg-id="${phId}" data-svg-classes="diagram-svg-inline${alignClass}" data-svg-style="${sizeStyle}"></div>\n\n`;
    };

    svgReplacedContent = svgReplacedContent.replace(
      /\[그림(\d+)\]/g,
      (match, numStr, offset, input) => {
        const idx = parseInt(numStr) - 1;
        if (idx >= 0 && idx < diagramSvgs.length) {
          return replaceSvg(match, diagramSvgs[idx].svg, input, offset, idx);
        }
        return match;
      },
    );
    svgReplacedContent = svgReplacedContent.replace(
      /\[그림\](?!\d)/g,
      (match, offset, input) => {
        if (nextIdx < diagramSvgs.length) {
          const svg = diagramSvgs[nextIdx].svg;
          nextIdx++;
          return replaceSvg(match, svg, input, offset);
        }
        return match;
      },
    );
  }

  // Stage 1b: 사용자 결정 (2026-05-27) — SVG 가 채우지 못한 [그림N] 을 *크롭 이미지* 로 대체.
  // 본문에 `[그림1]` 텍스트 잔류 + 별도 하단 이미지 = 사용자가 redundant 라고 보고.
  // → SVG 우선, image fallback. 둘 다 없으면 placeholder 그대로.
  const inlinedImageIndices = new Set<number>();
  if (imageCrops && imageCrops.length > 0) {
    svgReplacedContent = svgReplacedContent.replace(
      /\[그림(\d+)\]/g,
      (match, numStr) => {
        const idx = parseInt(numStr) - 1;
        if (idx < 0 || idx >= imageCrops.length) return match;
        const im = imageCrops[idx];
        if (!im?.src) return match;
        inlinedImageIndices.add(idx);
        figureBoxes.set(`img-${idx}`, im.box); // Stage 1c 위치 배치용
        // alt 텍스트 escape
        const altRaw = im.label ?? `도형 ${idx + 1}`;
        const alt = altRaw.replace(/"/g, "&quot;");
        // 스타일은 .diagram-inline-img CSS 클래스로 (globals.css). 인라인 style 을
        // 두면 Stage 1c figure-row 의 flex override 가 불가능해서 클래스로 이전.
        // data-fig-key 로 figureBoxes 와 매칭.
        return `\n\n<img src="${im.src}" alt="${alt}" class="diagram-inline-img" data-fig-key="img-${idx}" />\n\n`;
      },
    );
  }

  // Stage 1c (Phase A): 위치 기반 행 배치. 인접한 figure placeholder 들의 full-page
  // box(figureBoxes)가 좌우로 나란하면 `<div data-figure-row>` 로 묶어 flex 행 렌더.
  // box 없으면 no-op(세로 스택 유지) — 회귀 0. (preprocessMathText 이전에 실행해야
  // wrapper div 안 $…$ 오염 없음.)
  svgReplacedContent = groupFigureRows(svgReplacedContent, figureBoxes);

  // Stage 1.5: defensive SVG normalization — inject italic Times defaults
  // on <text> elements that didn't declare a font, and clamp oversized
  // point-dot radii so labels stay readable. Combined with the global CSS
  // outline rule (`svg text { paint-order: stroke … }`) this gives three
  // independent layers of protection against text/line overlap and
  // sans-serif math typography.
  svgReplacedContent = normalizeInlineSvgs(svgReplacedContent);

  // Stage 2: normalize LaTeX delimiters, `\dfrac`, unicode → LaTeX commands.
  svgReplacedContent = preprocessMathText(svgReplacedContent);

  // Stage 2.5: pre-render EVERY `$...$` / `$$...$$` to HTML and stash in a Map.
  //
  // Why: KaTeX implements √, ‖, large parens, ∑, ∫ etc. as inline
  // `<svg viewBox="…"><path d="…"/></svg>`. When that SVG passes through
  // remark-math → rehype-katex → React, `createElement('svg')` runs WITHOUT
  // an SVG-namespace parent, so the resulting node ends up HTML-namespaced
  // and the inner `<path>` paints nothing — leaving sqrt as an empty slot
  // (the "5 is offset to the right but √ doesn't appear" bug).
  //
  // By rendering KaTeX to HTML strings here and routing them through the
  // same data-id placeholder mechanism we use for diagram SVGs (Stage 0),
  // the browser parses the resulting SVG itself via innerHTML, which keeps
  // the namespace intact.
  const katexResult = prerenderAllKatex(svgReplacedContent);
  svgReplacedContent = katexResult.content;
  const katexPlaceholders = katexResult.katexMap;

  // Stage 3 (사용자 보고 2026-06-02, CLAUDE.md §18-3): `[한글]` → 대시드 박스
  // 변환을 *INCLUDE-list* 로 전환.
  //
  // 기존엔 exclude-list (정답/풀이/단계/경우/동작명사 …) 로 "이것들만 빼고 전부
  // 박스" 였는데, 새 동작명사("적용" 등)가 나올 때마다 풀이 단계 라벨이 대시드
  // 박스로 새어나가는 whack-a-mole 이었다 (사용자가 "삼각형 조건 적용" 이 박스로
  // 렌더된 것을 보고 — "적용" 이 suffix 목록에 없었음).
  //
  // → *명시적 도형 캡션* (도형/그래프/좌표평면/수직선/표/다이어그램 으로 시작하는
  //   noun 캡션) 만 박스화한다. 풀이의 단계·동작·개념 라벨(`[삼각형 조건 적용]`,
  //   `[절댓값 분해]`, `[1단계: …]`, `[정답]`), 수학 구간(`[-2, 4]`), 보기
  //   마커(`[ㄱ]`) 는 *전부* 일반 텍스트로 보존. (`[그림N]` 은 Stage 1 에서 이미
  //   SVG/이미지로 처리됨 → 여기 도달 안 함.)
  const FIGURE_CAPTION_RE =
    /^(?:도형|그래프|좌표평면|좌표|수직선|벤\s*다이어그램|다이어그램|표)\b/;
  // 도형 키워드로 시작해도 동작명사로 *끝나면* 캡션이 아니라 단계 라벨
  // (`[그래프 분석]`, `[도형 그리기]`) → 박스 X.
  const ACTION_LABEL_SUFFIX =
    /(적용|분석|분해|변환|계산|정리|비교|검토|확인|증명|결론|검증|전개|치환|대입|소거|이항|약분|통분|구하기|그리기|풀이|해석|관찰|이용)$/;
  const processedContent = svgReplacedContent.replace(
    /(?<!!)\[([가-힣\s\d/,×÷+\-a-zA-Z]+)\](?!\()/g,
    (match, desc: string) => {
      const trimmed = desc.trim();
      const compact = trimmed.replace(/\s+/g, "");
      // 명시적 도형 캡션 + 동작 라벨 아님 → 대시드 박스 (드문 케이스).
      if (FIGURE_CAPTION_RE.test(trimmed) && !ACTION_LABEL_SUFFIX.test(compact)) {
        return `<span class="diagram-placeholder">${desc}</span>`;
      }
      // 그 외 모두 일반 텍스트로 보존 (단계/동작/개념 라벨, 수학 구간, 보기 마커).
      return match;
    },
  );

  // Stage 4 (multiple-choice grid) is implemented at the React `<p>`
  // component level — see `renderChoiceRowOrNull` below. We can't do this
  // at the string level because remark-math runs only on markdown text,
  // not on the inside of raw HTML blocks, so any pre-emitted
  // `<span>$1$</span>` would render `$1$` literally instead of as KaTeX.

  const Tag = inline ? "span" : "div";
  const wrapperClass = inline
    ? className
    : `prose prose-slate max-w-none prose-p:my-2 prose-headings:my-3 ${className}`;

  return (
    <Tag className={wrapperClass}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
        rehypePlugins={[rehypeRaw, [rehypeKatex, { strict: false }]]}
        // react-markdown 의 기본 urlTransform 은 보안상 `data:` URI 를 *제거* →
        // src="" 가 됨. 우리 크롭 이미지(작품·도형)는 cropPageImageData 가 만든
        // `data:image/...` dataURL 이라 [그림N] inline 치환(Stage 1b) 시 통째로
        // 사라져 img 컴포넌트가 `[alt]` fallback span 만 렌더 (사용자 보고
        // 2026-06-03: "고흐의 의자" 작품이 텍스트 라벨로만 보임). 우리가 직접
        // 생성한 data:image/ 만 허용, 그 외 URL 은 기본 sanitize 유지 (XSS 방어).
        urlTransform={(url) =>
          url.startsWith("data:image/") ? url : defaultUrlTransform(url)
        }
        components={{
          // Intercept placeholder divs/spans emitted by Stage 0/1 (SVG) and
          // Stage 2.5 (KaTeX) and inject their HTML via dangerouslySetInnerHTML
          // — browsers parse the SVG natively, which is the only way to get
          // the SVG namespace right for nested <text>/<circle>/<path>/etc
          // inside react-markdown. KaTeX uses inline <svg><path/></svg> for
          // √, large parens, etc., so it suffers from the same namespace bug
          // and gets the same treatment.
          div: ({ node, children, ...props }) => {
            const dataset = node?.properties as Record<string, unknown> | undefined;
            // Stage 1c: 위치 기반 행 컨테이너 — 자식(svg div / img)을 flex 로 좌우 배치.
            const figRow =
              (dataset?.dataFigureRow as string | undefined) ??
              ((props as Record<string, unknown>)["data-figure-row"] as string | undefined);
            if (figRow) {
              return <div className="figure-row">{children}</div>;
            }
            const svgId =
              (dataset?.dataSvgId as string | undefined) ??
              ((props as Record<string, unknown>)["data-svg-id"] as string | undefined);
            if (typeof svgId === "string" && svgPlaceholders.has(svgId)) {
              const classes =
                (dataset?.dataSvgClasses as string | undefined) ?? "diagram-svg-inline";
              const styleStr = (dataset?.dataSvgStyle as string | undefined) ?? "";
              // 방어선 — Stage 0 의 normalizeInlineSvgs 가 어떤 이유로
              // width/height 주입에 실패한 케이스 (모델이 emit 한 SVG opener
              // 가 우리 정규식 가정과 미세하게 어긋났을 때) 를 대비해 여기서
              // 한 번 더 확인 + 주입. viewBox 만 있고 width/height 없으면
              // viewBox 값을 그대로 attribute 으로 박는다.
              let svgHtml = svgPlaceholders.get(svgId)!;
              if (svgHtml.startsWith("<svg") && !/<svg[^>]*\bwidth\s*=/i.test(svgHtml)) {
                const vb = svgHtml.match(/<svg[^>]*\bviewBox\s*=\s*"([^"]+)"/i);
                if (vb) {
                  const parts = vb[1].split(/\s+/).map((n) => parseFloat(n));
                  if (
                    parts.length === 4 &&
                    Number.isFinite(parts[2]) &&
                    Number.isFinite(parts[3]) &&
                    parts[2] > 0 &&
                    parts[3] > 0
                  ) {
                    svgHtml = svgHtml.replace(
                      /<svg(\s[^>]*)?>/,
                      `<svg$1 width="${parts[2]}" height="${parts[3]}">`,
                    );
                  }
                }
              }
              const baseStyle: Record<string, unknown> = styleStr
                ? Object.fromEntries(
                    styleStr
                      .split(";")
                      .map((s) => s.split(":").map((p) => p.trim()))
                      .filter(([k, v]) => k && v)
                      .map(([k, v]) => [
                        k!.replace(/-([a-z])/g, (_, c) => c.toUpperCase()),
                        v,
                      ]),
                  )
                : {};
              // Stage 1c figure-row 멤버면 flex share 적용 (box 폭 비례).
              const flexGrow = dataset?.dataFlexgrow as string | undefined;
              const style: Record<string, unknown> = flexGrow
                ? { ...baseStyle, flexGrow: Number(flexGrow), flexShrink: 1, flexBasis: 0, minWidth: 0 }
                : baseStyle;
              return (
                <div
                  className={classes}
                  style={Object.keys(style).length ? (style as React.CSSProperties) : undefined}
                  dangerouslySetInnerHTML={{ __html: svgHtml }}
                />
              );
            }
            const katexId =
              (dataset?.dataKatexId as string | undefined) ??
              ((props as Record<string, unknown>)["data-katex-id"] as string | undefined);
            if (typeof katexId === "string" && katexPlaceholders.has(katexId)) {
              return (
                <div
                  className="katex-block-wrap"
                  dangerouslySetInnerHTML={{ __html: katexPlaceholders.get(katexId)! }}
                />
              );
            }
            return <div {...props}>{children}</div>;
          },
          span: ({ node, children, ...props }) => {
            const dataset = node?.properties as Record<string, unknown> | undefined;
            const svgId =
              (dataset?.dataSvgId as string | undefined) ??
              ((props as Record<string, unknown>)["data-svg-id"] as string | undefined);
            if (typeof svgId === "string" && svgPlaceholders.has(svgId)) {
              const inlineKind = (dataset?.dataSvgInline as string | undefined) ?? "";
              const cls = inlineKind.startsWith("bq")
                ? `diagram-svg-inline-bq${inlineKind.length > 2 ? " " + inlineKind.slice(3) : ""}`
                : "diagram-svg-inline";
              return (
                <span
                  className={cls}
                  dangerouslySetInnerHTML={{ __html: svgPlaceholders.get(svgId)! }}
                />
              );
            }
            const katexId =
              (dataset?.dataKatexId as string | undefined) ??
              ((props as Record<string, unknown>)["data-katex-id"] as string | undefined);
            if (typeof katexId === "string" && katexPlaceholders.has(katexId)) {
              // tall flag (cases/matrix/aligned 등) 를 React prop 으로 propagate
              // — renderChoiceRowOrNull 이 1열 강제 판단에 사용. CLAUDE.md §2-18.
              const tallFlag =
                (dataset?.dataKatexTall as string | undefined) ??
                ((props as Record<string, unknown>)["data-katex-tall"] as string | undefined);
              return (
                <span
                  className="katex-inline-wrap"
                  data-katex-tall={tallFlag === "1" ? "1" : undefined}
                  dangerouslySetInnerHTML={{ __html: katexPlaceholders.get(katexId)! }}
                />
              );
            }
            return <span {...props}>{children}</span>;
          },
          p: inline
            ? ({ children }) => <span>{children}</span>
            : ({ children, ...props }) => {
                // If the only child is an image, render as block div so the
                // image gets natural margin instead of being squeezed inline.
                const childArray = React.Children.toArray(children);
                const hasOnlyImage =
                  childArray.length === 1 &&
                  React.isValidElement(childArray[0]) &&
                  (childArray[0] as React.ReactElement<{ src?: string }>).props?.src;
                if (hasOnlyImage) {
                  return <div className="my-2">{children}</div>;
                }
                // 5-option multiple-choice row → flex grid (see helper).
                // Phase #7: choicesLayout hint 전달 — OCR 모델이 인식한 grid 우선.
                const choiceRow = renderChoiceRowOrNull(children, choicesLayout);
                if (choiceRow) return <div className="my-2">{choiceRow}</div>;
                return (
                  <p
                    className="text-inherit mb-2 last:mb-0"
                    style={{ lineHeight: "1.8" }}
                    {...props}
                  >
                    {children}
                  </p>
                );
              },
          blockquote: ({ children }) => {
            // Recursive text extraction — needed because the line-splitting
            // logic below has to inspect rendered text for `<보기:cols=N>`
            // markers that survived the markdown→react conversion.
            const extractText = (node: React.ReactNode): string => {
              if (typeof node === "string") return node;
              if (typeof node === "number") return String(node);
              if (React.isValidElement(node)) {
                const props = node.props as Record<string, unknown>;
                if (props.children) {
                  return React.Children.toArray(props.children as React.ReactNode)
                    .map(extractText)
                    .join("");
                }
              }
              return "";
            };

            const lines: { nodes: React.ReactNode[]; text: string }[] = [];
            const splitByBr = (inner: React.ReactNode): boolean => {
              let hasBr = false;
              let current: React.ReactNode[] = [];
              React.Children.forEach(inner, (c) => {
                if (React.isValidElement(c) && c.type === "br") {
                  hasBr = true;
                  if (current.length > 0) {
                    lines.push({
                      nodes: [...current],
                      text: current.map(extractText).join(""),
                    });
                  }
                  current = [];
                } else {
                  current.push(c);
                }
              });
              if (hasBr && current.length > 0) {
                lines.push({
                  nodes: [...current],
                  text: current.map(extractText).join(""),
                });
              }
              return hasBr;
            };
            const flattenP = (child: React.ReactNode) => {
              if (!React.isValidElement(child)) {
                if (child != null) lines.push({ nodes: [child], text: String(child) });
                return;
              }
              const props = child.props as Record<string, unknown>;
              if (props.children) {
                if (!splitByBr(props.children as React.ReactNode)) {
                  lines.push({ nodes: [child], text: extractText(child) });
                }
              } else {
                lines.push({ nodes: [child], text: extractText(child) });
              }
            };
            React.Children.forEach(children, flattenP);

            // Separate `<보기>` header line from item lines, parse cols.
            const header: React.ReactNode[][] = [];
            const items: React.ReactNode[][] = [];
            let parsedCols = parseBoxCols("");
            for (const line of lines) {
              const maybeCols = parseBoxCols(line.text);
              if (maybeCols !== null && parsedCols === null) parsedCols = maybeCols;
              if (items.length === 0 && (line.text.includes("보기") || line.text.trim() === "")) {
                if (maybeCols !== null) {
                  header.push([<strong key="hdr">&lt;보기&gt;</strong>]);
                } else {
                  header.push(line.nodes);
                }
              } else {
                items.push(line.nodes);
              }
            }
            // Only switch to grid if there's an explicit `<보기>` marker —
            // a plain blockquote (계산식 등) should stay single-column.
            const effectiveCols =
              parsedCols !== null ? resolveCols(parsedCols, items.length) : 1;

            const colsClass =
              effectiveCols === 3
                ? "grid-cols-3"
                : effectiveCols === 2
                  ? "grid-cols-2"
                  : "grid-cols-1";
            const gridClass = items.length >= 2 ? `grid ${colsClass} gap-x-6 gap-y-1` : "";

            return (
              // 오버플로우 강력 보정 (사용자 보고 2026-06-02: <조건> 내용이 박스 밖으로
              // 나옴). grid 아이템 기본 min-width:auto 가 긴 줄·넓은 수식을 못 줄여
              // 박스를 밀어내는 함정 → min-w-0 + break-words 로 줄바꿈 강제. 넓은
              // display 수식은 가로 스크롤로 박스 안에 가둠 ([&_.katex-display]).
              <div className="border border-line-strong px-5 py-3 my-3 rounded-r2 bg-surface2 text-text not-italic w-fit max-w-full overflow-hidden [&_.katex-display]:overflow-x-auto">
                {header.map((h, i) => (
                  <div key={`h-${i}`} className="min-w-0 break-words">
                    {h}
                  </div>
                ))}
                {items.length > 0 && (
                  <div className={`min-w-0 ${gridClass}`}>
                    {items.map((item, i) => (
                      <div key={`i-${i}`} className="min-w-0 break-words">
                        {item}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          },
          img: ({ node, src: rawSrc, alt, title }) => {
            const src = typeof rawSrc === "string" ? rawSrc : "";
            if (!src) {
              return <span className="text-muted text-sm">[{alt || "이미지"}]</span>;
            }
            // Stage 1c figure-row 멤버 — 중앙 정렬 span 없이 *직접 flex item* 으로
            // (box 폭 비례 flex share 적용). 그 외 경로는 기존 동작 그대로.
            const flexGrow = (node?.properties as Record<string, unknown> | undefined)
              ?.dataFlexgrow as string | undefined;
            if (flexGrow) {
              return (
                <img
                  src={src}
                  alt={alt || ""}
                  className="rounded-sm"
                  style={{
                    flexGrow: Number(flexGrow),
                    flexShrink: 1,
                    flexBasis: 0,
                    minWidth: 0,
                    maxWidth: "100%",
                    height: "auto",
                  }}
                />
              );
            }
            const { width, align } = parseImageTitle(title ?? undefined);
            const style: React.CSSProperties = {};
            if (width) style.width = width;
            if (!width) style.maxWidth = "100%";

            if (align === "left") {
              return (
                <img
                  src={src}
                  alt={alt || ""}
                  style={style}
                  className="float-left mr-4 mb-2 rounded-sm"
                />
              );
            }
            if (align === "right") {
              return (
                <img
                  src={src}
                  alt={alt || ""}
                  style={style}
                  className="float-right ml-4 mb-2 rounded-sm"
                />
              );
            }
            return (
              <span className="flex justify-center my-2">
                <img src={src} alt={alt || ""} style={style} className="rounded-sm" />
              </span>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </Tag>
  );
};

export default MarkdownRenderer;
