import { useState } from "react";
import { Btn, Card, Eyebrow, Icon } from "@app/components/ui";
import { renderInlineKatex } from "@app/components/math/KaTeXInline";
import { buildNaverV4Html } from "@app/lib/naverV4Renderer";
import type { CommentaryResult, DifficultyBand } from "@app/types/examAnalysis";

/**
 * V4 학원 블로그 뷰 (Phase N+5 — **비활성**).
 *
 * mathlab `v4/V4CommentaryView.tsx` (9섹션) carry-over — mathgen 디자인 (Card/
 * Eyebrow/Tailwind) 으로 재구성. 사용자 결정: V4 만 추가 + 지금은 비활성.
 * `V4_BLOG_ENABLED = false` → StatsTabContent 에서 4번째 탭 미노출.
 *
 * 섹션: 헤더 / 들어가며 / 시험 개요 / 학원 차별화 전략 / 문제 난이도 표 /
 *       출제 특징 / 출제 핵심 포인트 / 이전 시험 비교 / 주요 문항 분석 /
 *       이번 시험 단원별 피드백. + 네이버 블로그 복사 버튼.
 */

/** V4 학원 블로그 활성화 플래그 (사용자 결정 2026-05-29: 지금은 비활성). */
export const V4_BLOG_ENABLED = false;

/** 난이도 5단계 행 배경 (mathlab V4_DIFF_ROW_COLORS). */
const V4_DIFF_ROW_COLORS = ["#E8F5E8", "#F5F5DC", "#FFF4E0", "#FFE0CC", "#FFCCCC"];
const V4_DIFF_LABELS = ["기본", "표준", "응용", "심화", "최고난도"];

export interface V4Meta {
  examTitle: string;
  schoolName: string | null;
  grade: string;
  analyzedAt: string | null;
  academyName?: string | null;
}

export interface V4BlogViewProps {
  commentary: CommentaryResult | null | undefined;
  meta: V4Meta;
  /** V4 생성 트리거 (lazy). */
  onGenerate: () => void;
  /** V4 생성 in-flight. */
  generating?: boolean;
}

// ── body 렌더: $math$ + **bold** + {학원명} + 줄바꿈 ──
const v4BodyHtml = (text: string): string =>
  renderInlineKatex((text || "").replace(/\{학원명\}/g, "우리 학원"))
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");

const V4Body = ({ text, className }: { text: string; className?: string }) => (
  <span className={className} dangerouslySetInnerHTML={{ __html: v4BodyHtml(text) }} />
);

export const V4BlogView = ({
  commentary,
  meta,
  onGenerate,
  generating,
}: V4BlogViewProps) => {
  const [copied, setCopied] = useState(false);
  const hasV4 = Boolean(commentary?.v4_exam_overview);

  // ── 미생성 / 생성 중 — CTA ──
  if (!hasV4) {
    return (
      <Card className="text-center py-12">
        <div className="w-14 h-14 mx-auto rounded-full bg-accent-soft grid place-items-center mb-4">
          <Icon name="newspaper" size={26} className="text-accent" weight="bold" />
        </div>
        <div className="text-h3 text-text">학원 블로그 (V4)</div>
        <p className="text-small text-muted mt-2 max-w-md mx-auto leading-relaxed">
          학원 블로그에 게시할 시험 기출 분석 글을 생성합니다 (9개 섹션 · 네이버 복사).
        </p>
        <div className="mt-5 flex justify-center">
          <Btn
            kind="accent"
            size="lg"
            icon="sparkle"
            disabled={generating}
            onClick={onGenerate}
          >
            {generating ? "생성 중" : "학원 블로그 생성"}
          </Btn>
        </div>
      </Card>
    );
  }

  const c = commentary!;
  const o = c.v4_exam_overview!;

  const handleCopy = async () => {
    const html = buildNaverV4Html({ commentary: c, meta });
    try {
      if (navigator.clipboard && "ClipboardItem" in window) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([html], { type: "text/plain" }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(html);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      await navigator.clipboard.writeText(html).catch(() => {});
    }
  };

  return (
    <div className="space-y-4">
      {/* 액션 바 */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-caption text-muted">
          학원 블로그 형식 — 네이버 SmartEditor 에 붙여넣기 가능
        </span>
        <div className="flex gap-2">
          <Btn
            kind={copied ? "secondary" : "accent"}
            size="sm"
            icon={copied ? "check" : "clipboard-text"}
            onClick={handleCopy}
          >
            {copied ? "복사됨" : "네이버 블로그 복사"}
          </Btn>
          <Btn
            kind="ghost"
            size="sm"
            icon="arrow-clockwise"
            disabled={generating}
            onClick={onGenerate}
          >
            재생성
          </Btn>
        </div>
      </div>

      {/* 헤더 */}
      <Card>
        <div className="text-caption font-semibold tracking-wide text-accent">
          {[o.school, o.grade].filter(Boolean).join(" · ")}
        </div>
        <h2 className="text-h2 font-bold text-text mt-1">{o.title}</h2>
        {o.one_liner && (
          <V4Body
            text={o.one_liner}
            className="block text-small text-text2 mt-2 leading-relaxed"
          />
        )}
      </Card>

      {/* 들어가며 */}
      {c.v4_intro && (
        <Card>
          <Eyebrow icon="pencil-simple">들어가며</Eyebrow>
          <V4Body
            text={c.v4_intro}
            className="block text-small text-text2 mt-2 leading-relaxed"
          />
        </Card>
      )}

      {/* 시험 개요 + 1등급 컷 */}
      <Card>
        <Eyebrow icon="clipboard-text">시험 개요 및 1등급 컷 예상</Eyebrow>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
          {(
            [
              ["문항 · 만점", `${o.total_questions}문항 · ${o.total_points}점`],
              ["출제 범위", o.range],
              ["전체 난이도", o.avg_difficulty_label],
              ["최고 난이도", o.peak_difficulty],
              ...(o.essay_summary ? [["서술형", o.essay_summary]] : []),
              ...(o.expected_grade_cut ? [["예상 등급 컷", o.expected_grade_cut]] : []),
            ] as Array<[string, string]>
          ).map(([label, value]) => (
            <div key={label} className="flex gap-2 text-small">
              <span className="text-muted w-20 shrink-0">{label}</span>
              <V4Body text={value} className="text-text2 flex-1" />
            </div>
          ))}
        </div>
      </Card>

      {/* 학원 차별화 전략 */}
      {c.v4_academy_strategy && c.v4_academy_strategy.length > 0 && (
        <Card>
          <Eyebrow icon="target">
            1등급 수학을 위한 학원 차별화 전략
          </Eyebrow>
          <div className="mt-3 space-y-2.5">
            {c.v4_academy_strategy.map((item, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="w-6 h-6 shrink-0 rounded-full bg-accent-soft text-accent text-caption font-bold grid place-items-center">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <V4Body
                    text={item.title}
                    className="block text-small font-semibold text-text"
                  />
                  <V4Body
                    text={item.body}
                    className="block text-caption text-text2 mt-0.5 leading-relaxed"
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 문제 난이도 · 출제 단원 (색상 코딩 표) */}
      {c.v4_difficulty_rows && c.v4_difficulty_rows.length > 0 && (
        <Card>
          <Eyebrow icon="table">문제 난이도 · 출제 단원</Eyebrow>
          <div className="mt-3 overflow-hidden rounded-r2 border border-line">
            <div className="flex bg-surface2 text-caption font-semibold text-muted px-3 py-1.5">
              <span className="w-14 shrink-0">번호</span>
              <span className="flex-1">단원 · 핵심 개념</span>
              <span className="w-20 shrink-0">난이도</span>
              <span className="w-12 shrink-0 text-right">배점</span>
            </div>
            {c.v4_difficulty_rows.map((row, i) => {
              const lv = Number(row.difficulty);
              const validLv = lv >= 1 && lv <= 5 ? lv : 3;
              return (
                <div
                  key={i}
                  className="flex items-start px-3 py-1.5 text-caption border-t border-line"
                  style={{ backgroundColor: V4_DIFF_ROW_COLORS[validLv - 1] }}
                >
                  <span className="w-14 shrink-0 font-bold text-[#1A1A1A]">
                    {row.question_number}
                  </span>
                  <span className="flex-1 min-w-0 text-[#2A2A2A]">
                    <V4Body text={row.topic} />
                    {row.analysis_short && (
                      <span className="block text-[11px] text-[#666] mt-0.5">
                        ↳ <V4Body text={row.analysis_short} />
                      </span>
                    )}
                  </span>
                  <span className="w-20 shrink-0 font-semibold text-[#1A1A1A]">
                    Lv{validLv}{" "}
                    <span className="text-[#888] font-normal">
                      {V4_DIFF_LABELS[validLv - 1]}
                    </span>
                  </span>
                  <span className="w-12 shrink-0 text-right font-bold text-[#1A1A1A]">
                    {row.points}점
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 출제 특징 요약 */}
      {c.v4_exam_features && (
        <Card>
          <Eyebrow icon="lightbulb">출제 특징 요약</Eyebrow>
          <V4Body
            text={c.v4_exam_features.headline}
            className="block text-small font-semibold text-text mt-2"
          />
          <V4Body
            text={c.v4_exam_features.body}
            className="block text-caption text-text2 mt-1.5 leading-relaxed"
          />
        </Card>
      )}

      {/* 출제 핵심 포인트 (영역별) */}
      {c.v4_main_analysis && c.v4_main_analysis.length > 0 && (
        <Card>
          <Eyebrow icon="list-bullets">출제 핵심 포인트</Eyebrow>
          <div className="mt-3 space-y-3">
            {c.v4_main_analysis.map((m, i) => (
              <div key={i}>
                <V4Body
                  text={m.heading}
                  className="block text-small font-semibold text-accent"
                />
                <V4Body
                  text={m.body}
                  className="block text-caption text-text2 mt-1 leading-relaxed"
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 이전 시험 비교 */}
      {c.v4_previous_comparison && (
        <Card>
          <Eyebrow icon="chart-line">이전 시험과의 비교 · 대조</Eyebrow>
          <V4Body
            text={c.v4_previous_comparison.headline}
            className="block text-small font-semibold text-text mt-2"
          />
          <V4Body
            text={c.v4_previous_comparison.body}
            className="block text-caption text-text2 mt-1.5 leading-relaxed"
          />
        </Card>
      )}

      {/* 주요 문항 분석 (킬러) */}
      {c.v4_key_questions && c.v4_key_questions.length > 0 && (
        <Card>
          <Eyebrow icon="warning-octagon">주요 문항 분석</Eyebrow>
          <div className="mt-3 space-y-2.5">
            {c.v4_key_questions.map((kq, i) => (
              <div
                key={i}
                className="rounded-r2 border border-warn/20 bg-warn-soft/20 p-3"
              >
                <V4Body
                  text={kq.title}
                  className="block text-small font-semibold text-text"
                />
                <V4Body
                  text={kq.body}
                  className="block text-caption text-text2 mt-1 leading-relaxed"
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 이번 시험 단원별 피드백 */}
      {c.v4_final_strategy && c.v4_final_strategy.length > 0 && (
        <Card>
          <Eyebrow icon="strategy">이번 시험 단원별 피드백</Eyebrow>
          <div className="mt-3 space-y-2.5">
            {c.v4_final_strategy.map((row, i) => (
              <div key={i} className="rounded-r2 border border-line p-3">
                <V4Body
                  text={row.area}
                  className="block text-small font-semibold text-accent"
                />
                <div className="mt-1.5 flex gap-1.5">
                  <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-warn-soft text-warn shrink-0 h-fit">
                    현재
                  </span>
                  <V4Body
                    text={row.current_status}
                    className="text-caption text-text2 leading-relaxed"
                  />
                </div>
                <div className="mt-1 flex gap-1.5">
                  <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-bold bg-ok-soft text-ok shrink-0 h-fit">
                    액션
                  </span>
                  <V4Body
                    text={row.action}
                    className="text-caption text-text2 leading-relaxed"
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default V4BlogView;
