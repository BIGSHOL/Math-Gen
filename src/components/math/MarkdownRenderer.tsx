import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import katex from "katex";
import { parseBoxCols, resolveCols } from "@app/lib/boxGrid";
import { parseImageTitle, preprocessMathText } from "@app/lib/textPreprocess";

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
}

export interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** Render as inline `<span>` rather than block `<div>` (for blank templates etc.). */
  inline?: boolean;
  /** SVG strings that will replace `[그림N]` placeholders in content. */
  diagramSvgs?: DiagramSvgItem[];
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

const renderChoiceRowOrNull = (children: React.ReactNode): React.ReactNode | null => {
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

  // Adaptive column count based on the longest option (mathlab's rule:
  // default to 2 columns, drop to 1 when any option goes over ~25 chars).
  const maxLen = Math.max(...slots.map(measureSlotLength));
  const cols: 1 | 2 = maxLen <= 25 ? 2 : 1;

  return (
    <div className={`choice-row cols-${cols}`}>
      {slots.map((s, i) => (
        <span key={i} className="choice">
          <span className="choice-marker">{markers[i]}</span>
          &nbsp;
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
    return katex.renderToString(tex, {
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
const prerenderAllKatex = (
  text: string,
): { content: string; katexMap: Map<string, string> } => {
  const map = new Map<string, string>();
  let nextId = 0;
  const reserve = (html: string, kind: "inline" | "block"): string => {
    const id = String(nextId++);
    map.set(id, html);
    return kind === "block"
      ? `\n\n<div data-katex-id="${id}"></div>\n\n`
      : `<span data-katex-id="${id}"></span>`;
  };
  // Block math first ($$...$$). Use a tight non-greedy match so we don't
  // accidentally swallow multiple paragraphs.
  let out = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex: string) =>
    reserve(renderKatex(tex.trim(), true), "block"),
  );
  // Inline math: $...$ on a single line. We bail out on newlines so a
  // stray $ doesn't pair across paragraphs.
  out = out.replace(/\$([^$\n]+?)\$/g, (_, tex: string) =>
    reserve(renderKatex(tex, false), "inline"),
  );
  return { content: out, katexMap: map };
};

const normalizeInlineSvgs = (html: string): string => {
  // Pass A — inject Times-italic defaults onto every <text> element that
  // doesn't already specify them. Using a permissive `<text(\s[^>]*)?` so
  // we catch both `<text>` and `<text x="…">` cases. (No risk of matching
  // `<textarea>` because that token doesn't appear in our markdown.)
  let out = html.replace(/<text(\s[^>]*)?>/g, (_, attrs: string | undefined) => {
    let a = attrs ?? "";
    if (!/\bfont-family\s*=/i.test(a)) a += ' font-family="Times New Roman, serif"';
    if (!/\bfont-style\s*=/i.test(a)) a += ' font-style="italic"';
    return `<text${a}>`;
  });

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

  return out;
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = "",
  inline,
  diagramSvgs,
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

  // Stage 3: bare `[한글 설명]` brackets → styled placeholder pill, but only
  // for actual diagram descriptions — math intervals, 보기 markers, and
  // common semantic labels (정답/풀이/해설/예시/문제 …) must pass through.
  // The placeholder pill was intended for AI-emitted diagram captions that
  // never got an SVG; OCR'd workbook text routinely uses [정답], [풀이],
  // [해설], [예시] etc. as section labels and those should render as plain
  // bracketed text, not as a dashed pill.
  const COMMON_LABEL_WORDS = new Set([
    "정답",
    "답",
    "해설",
    "풀이",
    "예시",
    "예제",
    "문제",
    "보기",
    "조건",
    "참고",
    "주의",
    "단원",
    "평가",
    "유형",
    "확인",
    "정리",
    "개념",
    "공식",
    "용어",
    "서술형",
    "객관식",
    "주관식",
    "단답형",
    "출제",
    "배점",
    "점수",
  ]);
  const processedContent = svgReplacedContent.replace(
    /(?<!!)\[([가-힣\s\d/,×÷+\-a-zA-Z]+)\](?!\()/g,
    (match, desc: string) => {
      if (/^[ㄱ-ㅎ]/.test(desc) || /^그림/.test(desc)) return match;
      if (/^[\s\d.,+\-−/]+$/.test(desc)) return match;
      // Section/semantic labels — leave as plain "[정답]" text.
      const compact = desc.trim().replace(/\s+/g, "");
      if (COMMON_LABEL_WORDS.has(compact)) return match;
      return `<span class="diagram-placeholder">${desc}</span>`;
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
              return (
                <div
                  className={classes}
                  style={
                    styleStr
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
                      : undefined
                  }
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
              return (
                <span
                  className="katex-inline-wrap"
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
                const choiceRow = renderChoiceRowOrNull(children);
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
              <div className="border border-line-strong px-5 py-3 my-3 rounded-r2 bg-surface2 text-text not-italic w-fit max-w-full">
                {header.map((h, i) => (
                  <div key={`h-${i}`}>{h}</div>
                ))}
                {items.length > 0 && (
                  <div className={gridClass}>
                    {items.map((item, i) => (
                      <div key={`i-${i}`}>{item}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          },
          img: ({ src: rawSrc, alt, title }) => {
            const src = typeof rawSrc === "string" ? rawSrc : "";
            if (!src) {
              return <span className="text-muted text-sm">[{alt || "이미지"}]</span>;
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
