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
import { extractChoices, stripChoicesLine } from "@app/lib/problemAdapter";

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

  // 보기 일관 렌더 (사용자 보고 2026-06-04: 인쇄 1단/2단 보기 크기 불일치).
  // choices[] 가 있으면 그대로, 비어있고 question 본문에 ①②③④⑤ 가 inline 으로
  // 남아 있으면 추출해서 *동일한 choices grid* 로 렌더한다. 그렇지 않으면 그 보기는
  // MarkdownRenderer 가 본문 크기(fontSize, 더 큼)로 inline 렌더돼 다른 문항의
  // grid 보기(fontSize-1)와 크기/폰트가 달라 보였다. 추출 성공 시 본문에서 보기
  // 줄을 제거해 grid 와 중복 inline 을 방지.
  const hasChoicesArr = !!problem.choices && problem.choices.length > 0;
  const extractedChoices = hasChoicesArr ? null : extractChoices(problem.question);
  const effectiveChoices = hasChoicesArr ? problem.choices : (extractedChoices ?? undefined);
  const questionBody = extractedChoices
    ? stripChoicesLine(problem.question)
    : problem.question;

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
        <MarkdownRenderer content={questionBody} diagramSvgs={svgList} />
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

      {/* 이미지 도형 (작품 사진 user-crop · AI 생성 ai-gen — 벡터 불가). 내보내기
          표시 (#14, 사용자 보고 2026-06-04: 21번 고흐 작품). diagramParams(벡터)와
          별개 도형 — 둘이 겹치는 문항 없음. */}
      {problem.images && problem.images.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-2 justify-center">
          {problem.images.map((img, ii) => (
            <img
              key={ii}
              src={img.dataUrl}
              alt={img.label || `이미지${ii + 1}`}
              className="max-w-[320px] max-h-[260px] border border-slate-200 rounded"
            />
          ))}
        </div>
      )}

      {/* Choices grid — Phase #7: original 보기 layout 상속 (auto fallback 시 길이 휴리스틱). */}
      {!hideChoices && effectiveChoices && effectiveChoices.length > 0 && (
        <div
          className={`grid gap-x-4 gap-y-2 text-slate-700 mt-1.5 ${printGridClass(
            effectiveChoices,
            problem.choicesLayout,
          )}`}
          style={{ fontSize: `${Math.max(10, fontSize - 1)}px` }}
        >
          {effectiveChoices.map((choice, ci) => {
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

/**
 * Phase #7: 원본 choicesLayout 을 print Tailwind grid class 로 변환.
 * "auto" 또는 누락 시 기존 resolveChoiceCols 휴리스틱 (1 또는 2 col) fallback.
 */
const printGridClass = (
  choices: string[] | undefined,
  layout: GeneratedProblem["choicesLayout"] | undefined,
): string => {
  switch (layout) {
    case "1x5":
      return "grid-cols-5";
    case "2x3":
      return "grid-cols-3";
    case "3x2":
      return "grid-cols-2";
    case "5x1":
      return "grid-cols-1";
    case "auto":
    default:
      return resolveChoiceCols(choices ?? []) === 1
        ? "grid-cols-1"
        : "grid-cols-2";
  }
};

export default ProblemBody;
