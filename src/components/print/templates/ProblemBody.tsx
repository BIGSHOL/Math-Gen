// ProblemBody.tsx
// 인쇄 시 한 문항의 *본문 + 도형 + 선택지* 만 그리는 재사용 컴포넌트.
//
// 6 신규 template (PyeonggaTemplate / JeongtongTemplate / ...) 들이 모두 호출.
// PrintQuestionBlock.tsx 의 기존 `BodyBlock` 로직을 *그대로 추출* — 변경 0,
// 단지 standalone 컴포넌트로 분리. design_handoff 의 ProblemBody placeholder
// 시그니처 (`{ problem, fontSize }`) 호환 + Mathgen 추가 prop (tag /
// accentColor / diagrams) 옵션.

import MarkdownRenderer, {
  type DiagramSvgItem,
} from "@app/components/math/MarkdownRenderer";
import type { GeneratedProblem } from "@app/types";
import { resolveChoiceCols } from "@app/lib/printLayout";
import { renderDiagram } from "@app/lib/diagram";

export interface ProblemBodyProps {
  /** 문항. design_handoff 의 prop name (`problem`) 그대로 통일. */
  problem: GeneratedProblem;
  /** 본문 글자 크기 (px). 기본 13. template 별로 다름 (pyeongga 13.2, workbook 12.5 등). */
  fontSize?: number;
  /** "원본" / "변형" chip — exportSource === "both" 일 때만 표시. */
  tag?: "원본" | "변형" | null;
  /** tag 배경 색 (변형). */
  accentColor?: string;
  /** OCRImage bbox crop 된 PNG dataUrl (original 본문 fallback). */
  diagrams?: Array<{ dataUrl: string; label: string }>;
  /** 선택지 grid 숨김 — workbook/jaseup 의 풀이공간 영역 분리 등에서 활용. */
  hideChoices?: boolean;
}

export const ProblemBody = ({
  problem,
  fontSize = 13,
  tag,
  accentColor,
  diagrams,
  hideChoices,
}: ProblemBodyProps) => {
  // 우선순위: (1) diagramParams (vector, Phase E) > (2) diagramSVG (legacy) >
  // (3) diagrams (OCR bbox crop fallback — svgList 가 없을 때만 표시).
  let svgList: DiagramSvgItem[] | undefined;
  if (problem.diagramParams && problem.diagramParams.length > 0) {
    const items: DiagramSvgItem[] = [];
    for (let i = 0; i < problem.diagramParams.length; i++) {
      try {
        items.push({
          svg: renderDiagram(problem.diagramParams[i]),
          label: `도형${i + 1}`,
        });
      } catch (err) {
        console.warn(`[ProblemBody] renderDiagram ${i}:`, (err as Error).message);
      }
    }
    if (items.length > 0) svgList = items;
  } else if (problem.diagramSVG) {
    svgList = [{ svg: problem.diagramSVG, label: "도형" }];
  }
  const showBboxFallback = !svgList && diagrams && diagrams.length > 0;

  return (
    <div>
      {tag && (
        <span
          className="inline-block text-[9px] font-black tracking-wider text-white px-1.5 py-0.5 rounded-sm mb-1.5"
          style={{
            backgroundColor: tag === "변형" ? (accentColor ?? "#0E0E10") : "#64748b",
          }}
        >
          {tag}
        </span>
      )}
      <div
        className="text-slate-900 leading-relaxed printable-math-content"
        style={{ fontSize: `${fontSize}px` }}
      >
        <MarkdownRenderer content={problem.question} diagramSvgs={svgList} />
      </div>

      {/* 원본 OCR bbox crop 도형 (vector spec 이 없을 때만 fallback) */}
      {showBboxFallback && (
        <div className="mt-1.5 flex flex-wrap gap-2">
          {diagrams!.map((d, di) => (
            <img
              key={di}
              src={d.dataUrl}
              alt={d.label}
              className="max-w-[280px] border border-slate-200 rounded"
            />
          ))}
        </div>
      )}

      {/* Choices grid */}
      {!hideChoices && problem.choices && problem.choices.length > 0 && (
        <div
          className={`grid gap-x-4 gap-y-2 text-slate-700 mt-1.5 ${
            resolveChoiceCols(problem.choices) === 1 ? "grid-cols-1" : "grid-cols-2"
          }`}
          style={{ fontSize: `${Math.max(10, fontSize - 1)}px` }}
        >
          {problem.choices.map((choice, ci) => {
            const cleanChoice = choice.replace(/^[①②③④⑤]\s*/, "").trim();
            return (
              <div key={ci} className="flex items-start gap-1.5">
                <span className="shrink-0 font-medium text-slate-800 opacity-90 text-[1.1em] leading-none translate-y-px">
                  {["①", "②", "③", "④", "⑤"][ci]}
                </span>
                <div className="flex-1">
                  <MarkdownRenderer content={cleanChoice} inline />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProblemBody;
