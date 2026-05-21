import MarkdownRenderer from "@app/components/math/MarkdownRenderer";
import { estimateRenderedLength, pickProblemBody } from "@app/lib/printLayout";
import type {
  ExportSource,
  PrintOptions,
  ProblemReview,
} from "@app/stores/wizardStore";
import { PrintableHeader } from "./PrintableHeader";

/**
 * Step 5 의 정답+해설 페이지. mathlab `print/page.tsx` L584-700 패턴 차용.
 *
 * 첫 정답 페이지에 *빠른 정답 그리드* (`flex-wrap` + 동적 basis) 가 추가로
 * 들어가고, 그 아래에 *CSS columns 2단* 으로 정답+해설을 자동 흘려보낸다
 * (`{ columns: 2, columnGap: '2.5rem', columnFill: 'auto' }`).
 *
 * "both" exportSource 일 때는 *variant 정답* 을 우선 표시한다 (variant 가
 * 최종 산출물). 원본 정답이 다른 경우에도 일단 variant 만 — 추후 사용자
 * 피드백에 따라 "원본 정답 같이 보기" 옵션 도입 검토.
 */
export interface PrintAnswerKeyPageProps {
  /** 이 페이지에 포함될 problems 의 1-indexed 글로벌 번호 (paginateAnswerKey 가 결정). */
  questionNumbers: number[];
  /** 시드 problems 전체 (questionNumbers 가 1-indexed 로 인덱싱). */
  allProblems: ProblemReview[];
  options: PrintOptions;
  exportSource: ExportSource;
  /** 시험지 제목 (헤더용). */
  testTitle: string;
  /** "5 / 7" 같은 페이지 인디케이터. */
  pageInfo?: string;
  /** 정답 페이지 중 *첫 번째* 인가 — 빠른 정답 그리드 표시 여부. */
  isFirstAnswerPage: boolean;
  /** 첫 정답 페이지 헤더에 표시할 부제목. */
  gradeBadge?: string;
}

export const PrintAnswerKeyPage = ({
  questionNumbers,
  allProblems,
  options,
  exportSource,
  testTitle,
  pageInfo,
  isFirstAnswerPage,
  gradeBadge,
}: PrintAnswerKeyPageProps) => {
  return (
    <div className="flex flex-col h-full">
      <PrintableHeader
        title={testTitle}
        subtitle={isFirstAnswerPage ? "Answer Key" : ""}
        gradeBadge={gradeBadge}
        isFirstPage={false}
        variant={options.template}
        accentColor={options.color}
        pageInfo={pageInfo}
      />

      {/* 빠른 정답 그리드 — 첫 정답 페이지에만 */}
      {isFirstAnswerPage && (
        <div
          className="mt-3 border rounded-sm p-3"
          style={{ borderColor: `${options.color}20` }}
        >
          <h3 className="text-[10px] font-black text-slate-500 uppercase mb-2">
            빠른 정답
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {allProblems.map((p, idx) => {
              const body = pickProblemBody(p, exportSource);
              const ansLen = estimateRenderedLength(body.answer ?? "");
              const basis = ansLen <= 6 ? "16%" : ansLen <= 16 ? "26%" : "36%";
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-100 rounded text-[11px]"
                  style={{ flex: `1 1 ${basis}`, minWidth: 0 }}
                >
                  <span className="font-black text-slate-400 w-5 shrink-0">
                    {idx + 1}
                  </span>
                  <span className="font-bold text-slate-800 truncate">
                    <MarkdownRenderer content={body.answer ?? ""} inline />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 정답 + 해설 페이지 — CSS columns 자동 흐름 */}
      {!options.quickAnswerOnly && (
        <div
          className="flex-1 min-h-0 mt-2 overflow-hidden"
          style={{ columns: 2, columnGap: "2.5rem", columnFill: "auto" }}
        >
          {questionNumbers.map((globalNum) => {
            const p = allProblems[globalNum - 1];
            if (!p) return null;
            const body = pickProblemBody(p, exportSource);
            return (
              <div
                key={p.id}
                style={{ marginBottom: `${options.spacing}px`, breakInside: "avoid" }}
              >
                {/* 번호 + 정답 헤더 */}
                <div className="flex items-baseline gap-2 mb-1.5">
                  <span className="text-sm font-black text-slate-700">
                    {globalNum}.
                  </span>
                  <span className="text-[10px] font-black text-slate-500">정답:</span>
                  <span className="font-bold text-slate-900 text-[13px]">
                    <MarkdownRenderer content={body.answer ?? ""} inline />
                  </span>
                </div>

                {/* 해설 */}
                {body.solution && (
                  <div className="text-[12px] leading-relaxed text-slate-700 pl-3 border-l-2 border-slate-200">
                    <MarkdownRenderer content={body.solution} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PrintAnswerKeyPage;
