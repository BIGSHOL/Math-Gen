import MarkdownRenderer, {
  type DiagramSvgItem,
} from "@app/components/math/MarkdownRenderer";
import type {
  ExportSource,
  PrintOptions,
  PrintTemplate,
  ProblemReview,
} from "@app/stores/wizardStore";
import type { GeneratedProblem } from "@app/types";
import { resolveChoiceCols } from "@app/lib/printLayout";
import { renderDiagram } from "@app/lib/diagram";
import { DifficultyBadge } from "./DifficultyBadge";

/**
 * Step 5 인쇄 시 한 문항을 표시하는 카드. mathlab `print/page.tsx` L516-573
 * 의 문항 렌더 영역 패턴 차용.
 *
 * exportSource 분기:
 *   - "variant" → variant 본문만
 *   - "original" → original 본문만
 *   - "both" → 같은 카드에 [원본 (작은 chip) + 본문] + dashed 구분선 + [변형
 *     (작은 chip) + 본문]
 *
 * 도형 처리:
 *   - GeneratedProblem.diagramSVG (variant 의 SVG) → MarkdownRenderer 가
 *     `[그림N]` placeholder 치환
 *   - originalDiagrams (OCRImage bbox crop dataUrl) → 본문 아래 `<img>` 로
 *     단순 표시 (Step5Export 가 미리 crop 해서 prop 전달)
 */
export interface PrintQuestionBlockProps {
  problem: ProblemReview;
  /** 1-indexed 글로벌 문항 번호. */
  questionNumber: number;
  options: PrintOptions;
  exportSource: ExportSource;
  /**
   * 원본 도형 (페이지 이미지에서 crop 된 PNG dataUrl). Step5Export 가 mount
   * effect 로 사전 준비. `exportSource === "variant"` 면 undefined.
   */
  originalDiagrams?: Array<{ dataUrl: string; label: string }>;
}

export const PrintQuestionBlock = ({
  problem,
  questionNumber,
  options,
  exportSource,
  originalDiagrams,
}: PrintQuestionBlockProps) => {
  const showOriginal = exportSource === "original" || exportSource === "both";
  const showVariant = exportSource === "variant" || exportSource === "both";

  return (
    <div
      className="break-inside-avoid print-break-inside-avoid"
      style={{ marginBottom: `${options.spacing}px` }}
    >
      <div className="flex items-start gap-4">
        {/* 문항 번호 (template 별 디자인) */}
        <div className="flex flex-col items-center shrink-0">
          <QuestionNumber
            template={options.template}
            num={questionNumber}
            color={options.color}
          />
        </div>

        <div className="flex-1 min-w-0 pt-0.5">
          {/* 문항 메타 (chapter / difficulty 옵션) — 난이도는 디자인된 chip 으로
              분리해 *오타처럼 보이는 인라인 텍스트* 회피 (사용자 보고). */}
          {(options.showChapter || options.showDifficulty) && (
            <div className="flex items-center gap-2 mb-2">
              {options.showChapter && problem.variant.topic && (
                <span className="text-[10px] uppercase font-bold text-slate-400 border-r pr-2 border-slate-200">
                  {problem.variant.topic}
                </span>
              )}
              {options.showDifficulty && problem.variant.difficulty && (
                <DifficultyBadge difficulty={problem.variant.difficulty} />
              )}
            </div>
          )}

          {/* 본문 — exportSource 분기 */}
          {showOriginal && (
            <BodyBlock
              body={problem.original}
              tag={exportSource === "both" ? "원본" : null}
              accentColor={options.color}
              diagrams={originalDiagrams}
            />
          )}

          {/* both 일 때 원본↔변형 dashed 구분 */}
          {exportSource === "both" && showOriginal && showVariant && (
            <div className="my-3 border-t border-dashed border-slate-300" />
          )}

          {showVariant && (
            <BodyBlock
              body={problem.variant}
              tag={exportSource === "both" ? "변형" : null}
              accentColor={options.color}
            />
          )}
        </div>
      </div>
    </div>
  );
};

interface BodyBlockProps {
  body: GeneratedProblem;
  /** 본문 앞에 표시할 작은 chip. "both" 일 때만 노출. */
  tag: "원본" | "변형" | null;
  accentColor: string;
  /** OCRImage bbox crop 된 PNG dataUrl (original 본문에만). */
  diagrams?: Array<{ dataUrl: string; label: string }>;
}

const BodyBlock = ({ body, tag, accentColor, diagrams }: BodyBlockProps) => {
  // 우선순위: (1) diagramParams (vector, Phase E) > (2) diagramSVG (legacy) >
  // (3) diagrams (OCR bbox crop fallback — svgList 가 없을 때만 표시).
  let svgList: DiagramSvgItem[] | undefined;
  if (body.diagramParams && body.diagramParams.length > 0) {
    const items: DiagramSvgItem[] = [];
    for (let i = 0; i < body.diagramParams.length; i++) {
      try {
        items.push({
          svg: renderDiagram(body.diagramParams[i]),
          label: `도형${i + 1}`,
        });
      } catch (err) {
        console.warn(`[PrintQuestionBlock] renderDiagram ${i}:`, (err as Error).message);
      }
    }
    if (items.length > 0) svgList = items;
  } else if (body.diagramSVG) {
    svgList = [{ svg: body.diagramSVG, label: "도형" }];
  }
  const showBboxFallback = !svgList && diagrams && diagrams.length > 0;

  return (
    <div>
      {tag && (
        <span
          className="inline-block text-[9px] font-black tracking-wider text-white px-1.5 py-0.5 rounded-sm mb-1.5"
          style={{
            backgroundColor: tag === "변형" ? accentColor : "#64748b",
          }}
        >
          {tag}
        </span>
      )}
      <div className="text-slate-900 text-[13px] leading-relaxed printable-math-content">
        <MarkdownRenderer content={body.question} diagramSvgs={svgList} />
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
      {body.choices && body.choices.length > 0 && (
        <div
          className={`grid gap-x-4 gap-y-2 text-slate-700 text-[12px] mt-1.5 ${
            resolveChoiceCols(body.choices) === 1 ? "grid-cols-1" : "grid-cols-2"
          }`}
        >
          {body.choices.map((choice, ci) => {
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

// ── Question Number (template 별 디자인) ─────────────────────────
interface QuestionNumberProps {
  template: PrintTemplate;
  num: number;
  color: string;
}

const QuestionNumber = ({ template, num, color }: QuestionNumberProps) => {
  const printStyle = { WebkitPrintColorAdjust: "exact" as const };

  switch (template) {
    case "exam":
      return (
        <>
          <div
            className="w-8 h-8 flex items-center justify-center border-2 border-slate-800 rounded-none bg-white font-black text-sm"
            style={printStyle}
          >
            {num}
          </div>
          <div className="mt-1 h-3 w-px bg-slate-300" />
        </>
      );
    case "minimal":
      return (
        <div
          className="text-lg font-light text-slate-300 tabular-nums w-6 text-right"
          style={printStyle}
        >
          {num}
        </div>
      );
    case "classic":
      return (
        <div className="flex items-baseline gap-0.5">
          <span className="text-sm font-black" style={{ color, ...printStyle }}>
            {num}
          </span>
          <span className="text-[10px] font-bold text-slate-400">.</span>
        </div>
      );
    default: // "default"
      return (
        <div
          className="text-xl font-black italic tracking-tighter"
          style={{ color, ...printStyle }}
        >
          {String(num).padStart(2, "0")}
        </div>
      );
  }
};

export default PrintQuestionBlock;
