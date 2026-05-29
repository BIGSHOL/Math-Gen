import { useMemo } from "react";
import katex from "katex";
import { applyMathInnerNormalization } from "@app/lib/textPreprocess";

/**
 * 경량 인라인 KaTeX 렌더러 (Phase N+ 보정).
 *
 * MarkdownRenderer 는 SVG 추출 + placeholder + ReactMarkdown + rehype full
 * pipeline 이라 *한 화면에 수십 개* 인스턴스 (시험지 분석 표 22 문항 ×
 * ai_comment + 난이도 근거) 가 mount 되면 main thread 가 frozen (CLAUDE.md §21-10).
 *
 * commentary 의 짧은 한국어 문장 + 인라인 `$...$` 만 렌더하면 충분하므로,
 * ReactMarkdown 없이 *KaTeX renderToString 만* 으로 `$...$` 치환. 44 인스턴스도
 * 가볍게 동작.
 *
 * - `$...$` (single) 만 처리 — commentary 에 display `$$` 거의 없음
 * - applyMathInnerNormalization — MarkdownRenderer 와 동일 정규화 묶음:
 *   cleanMalformedLatex (모델 typo) + 가분수→대분수 + uprightGeometryLabels
 *   (점·선·면 도형 라벨 직립 Roman, 변수는 italic — CLAUDE.md §2-10) +
 *   \frac→\dfrac + autoSizeBrackets 등
 * - "No character metrics" warn 억제 (①②③ 등이 math 안 들어올 때 폭주 방지)
 * - KaTeX CSS 의 `.katex` 는 globals.css 의 `svg max-width 360px` / `svg text
 *   italic` 룰에서 `:where(.katex *)` 로 제외돼 있어 영향 없음.
 */
export interface KaTeXInlineProps {
  text: string;
  className?: string;
}

const KATEX_METRIC_WARN_RE = /No character metrics for/;

const renderInlineKatex = (text: string): string =>
  text.replace(/\$([^$]+?)\$/g, (_match, tex: string) => {
    const origWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      if (typeof args[0] === "string" && KATEX_METRIC_WARN_RE.test(args[0]))
        return;
      origWarn.apply(console, args);
    };
    try {
      return katex.renderToString(applyMathInnerNormalization(tex), {
        throwOnError: false,
        strict: false,
        output: "html",
        displayMode: false,
        trust: (ctx) => ctx.command === "\\htmlClass",
      });
    } catch {
      return tex;
    } finally {
      console.warn = origWarn;
    }
  });

export const KaTeXInline = ({ text, className }: KaTeXInlineProps) => {
  const html = useMemo(() => renderInlineKatex(text), [text]);
  return (
    <span
      className={className}
      // KaTeX 출력 HTML — input 은 우리 prompt 가 생성한 commentary (신뢰).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

export default KaTeXInline;
