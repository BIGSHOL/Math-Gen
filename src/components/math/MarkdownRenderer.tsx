import React from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
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

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className = "",
  inline,
  diagramSvgs,
}) => {
  // Stage 1: SVG placeholder substitution. Must run BEFORE preprocessMathText
  // so the LaTeX inside the SVG isn't mangled.
  let svgReplacedContent = content;
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

      // If the placeholder sits inside a `>` blockquote line, render as
      // inline (lets the SVG flow with text instead of breaking the box).
      const before = input.substring(0, offset);
      const lastNewline = before.lastIndexOf("\n");
      const currentLine = before.substring(lastNewline + 1);
      const inBlockquote = currentLine.trimStart().startsWith(">");
      if (inBlockquote) {
        const singleLineSvg = svg.replace(/\n\s*/g, "");
        return `<span class="diagram-svg-inline-bq${alignClass}">${singleLineSvg}</span>`;
      }
      return `\n\n<div class="diagram-svg-inline${alignClass}" style="${sizeStyle}">${svg}</div>\n\n`;
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

  // Stage 2: normalize LaTeX delimiters, `\dfrac`, unicode → LaTeX commands.
  svgReplacedContent = preprocessMathText(svgReplacedContent);

  // Stage 3: bare `[한글 설명]` brackets → styled placeholder pill, but only
  // for actual diagram descriptions — math intervals and 보기 markers must
  // pass through untouched.
  const processedContent = svgReplacedContent.replace(
    /(?<!!)\[([가-힣\s\d/,×÷+\-a-zA-Z]+)\](?!\()/g,
    (match, desc: string) => {
      if (/^[ㄱ-ㅎ]/.test(desc) || /^그림/.test(desc)) return match;
      if (/^[\s\d.,+\-−/]+$/.test(desc)) return match;
      return `<span class="diagram-placeholder">${desc}</span>`;
    },
  );

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
