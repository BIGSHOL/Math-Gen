import { useMemo } from "react";
import { preprocessMathText } from "@app/lib/textPreprocess";
import { renderKatexSafe } from "@app/lib/katexRender";

/**
 * 경량 인라인 KaTeX 렌더러 (Phase N+ 보정).
 *
 * MarkdownRenderer 는 SVG 추출 + placeholder + ReactMarkdown + rehype full
 * pipeline 이라 *한 화면에 수십 개* 인스턴스 (시험지 분석 표 22 문항 ×
 * ai_comment + 난이도 근거) 가 mount 되면 main thread 가 frozen (CLAUDE.md §21-10).
 *
 * commentary 의 한국어 문장 + 수식만 렌더하면 충분하므로, ReactMarkdown 없이
 * *문자열 정규화 + KaTeX* 만으로 처리. 44 인스턴스도 가볍게 동작.
 *
 * **문자열 정규화는 MarkdownRenderer 와 *동일*** (사용자 목표 2026-06-04 "강력한
 * 후보정"):
 * - `preprocessMathText` — `$` 없이 흘러나온 raw LaTeX 줄까지 line-level
 *   wrap(Step 9) + 가분수→대분수 + uprightGeometryLabels + \frac→\dfrac +
 *   autoSizeBrackets + 모델 typo 정리(cleanMalformedLatex Step 10).
 * - `renderKatexSafe` — `$$`/`$` 를 렌더. **붉은 글씨(katex-error) 절대 금지**
 *   (실패 시 공격적 재시도 → 그래도 실패면 빨강 대신 중립 .math-raw 폴백).
 *   "No character metrics" warn 억제 포함. MarkdownRenderer 와 같은 안전망 →
 *   렌더 경로 분기로 한쪽만 깨지는 multi-path 함정(§2-17) 차단.
 * - KaTeX CSS 의 `.katex` 는 globals.css 의 `svg max-width 360px` / `svg text
 *   italic` 룰에서 `:where(.katex *)` 로 제외돼 있어 영향 없음.
 */
export interface KaTeXInlineProps {
  text: string;
  className?: string;
}

export const renderInlineKatex = (text: string): string => {
  // MarkdownRenderer 의 Stage 2 와 *동일* 한 문자열 정규화 먼저 — `$` 없이
  // 흘러나온 raw LaTeX 줄도 line-level wrap(Step 9) + 모델 typo 정리(Step 10)
  // 를 거친다. 없으면 commentary 의 `\displaystyle Q(x)=\Bigl\left(...` 같은
  // 줄이 통째로 raw 노출(사용자 보고 2026-06-03). 순수 문자열 처리라 가볍다.
  const pre = preprocessMathText(text);
  // $$...$$ (display) 먼저, 그 다음 단독 $...$ (inline) — block 을 먼저 빼야
  // inline 정규식이 `$$` 안쪽을 오인하지 않는다. 렌더는 붉은 글씨 절대 금지
  // 공유 안전망 renderKatexSafe (MarkdownRenderer 와 동일 — multi-path 차단).
  let out = pre.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) =>
    renderKatexSafe(tex.trim(), true),
  );
  out = out.replace(/\$([^$\n]+?)\$/g, (_m, tex: string) =>
    renderKatexSafe(tex, false),
  );
  return out;
};

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
