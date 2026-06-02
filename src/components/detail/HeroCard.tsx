import { useState } from "react";
import { Card, Chip, Icon } from "@app/components/ui";
import type { TestPaper } from "@app/types";
import type { OCRProblem } from "@app/stores/wizardStore";
import { useLibraryStore } from "@app/stores/libraryStore";

export interface HeroCardProps {
  test: TestPaper;
  /** Detail view 의 실제 OCR 문항 — 통계를 실측값으로 계산. 없으면 test 메타 폴백. */
  problems?: OCRProblem[];
}

interface HeroStat {
  label: string;
  value: string;
  unit?: string;
  tone?: "ok" | "warn";
}

/**
 * 5-up 통계 행. problems 가 있으면 *실측값*, 없으면 test 메타로 폴백.
 * 이전엔 확정 = 총합−3, 검토 필요 = "3" 고정, 평균 난이도 = "중" 고정 같은
 * placeholder 였다 — 실제 데이터와 어긋난다는 사용자 보고로 실측 계산으로 교체.
 */
const buildStats = (test: TestPaper, problems: OCRProblem[]): HeroStat[] => {
  const hasData = problems.length > 0;
  const total = hasData ? problems.length : test.problemCount;
  const confirmed = problems.filter((p) => p.status === "ok").length;
  const review = problems.filter(
    (p) => p.status === "warn" || p.status === "pending",
  ).length;
  const solved = problems.filter((p) => Boolean(p.solution)).length;
  return [
    { label: "문항", value: String(total) },
    {
      label: "확정",
      value: hasData ? String(confirmed) : "—",
      unit: hasData ? `/${total}` : undefined,
      tone: "ok",
    },
    { label: "검토 필요", value: hasData ? String(review) : "—", tone: "warn" },
    {
      label: "해설",
      value: hasData ? String(solved) : "—",
      unit: hasData ? `/${total}` : undefined,
    },
    { label: "변형본", value: String(test.variants.length), unit: "개" },
  ];
};

const TONE_COLOR: Record<NonNullable<HeroStat["tone"]>, string> = {
  ok: "#10B981",
  warn: "#F59E0B",
};

/**
 * Detail hero — large faux paper thumbnail + tags + title + 5-up stat row.
 * The thumbnail is the same placeholder pattern as Library's TestCard so
 * the visual rhythm carries from Library → Detail.
 */
export const HeroCard = ({ test, problems }: HeroCardProps) => {
  const probs = problems ?? [];
  const stats = buildStats(test, probs);
  const displayCount = probs.length > 0 ? probs.length : test.problemCount;

  // 제목 인라인 편집 (사용자 보고 2026-06-02): 제목 옆 연필 → input → Enter/blur
  // 저장 (libraryStore.renameTest = 로컬 즉시 + DB persist), Esc 취소.
  const renameTest = useLibraryStore((s) => s.renameTest);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(test.title);
  const commitTitle = () => {
    const t = titleDraft.trim();
    if (t && t !== test.title) renameTest(test.id, t);
    setEditingTitle(false);
  };
  return (
    <Card pad={24}>
      <div className="flex gap-6 items-start">
        {/* Faux thumbnail */}
        <div
          className="flex-shrink-0 bg-white border border-line shadow-s2 rounded-r2 relative"
          style={{ width: 124, height: 158, padding: "10px 14px" }}
        >
          <div
            className="flex justify-between font-bold"
            style={{
              fontSize: 8,
              paddingBottom: 3,
              marginBottom: 6,
              borderBottom: "0.8px solid #1A1D24",
            }}
          >
            <span>수학영역</span>
            <span>1</span>
          </div>
          {[1, 2].map((n) => (
            <div key={n} style={{ marginTop: 5 }}>
              <div className="flex items-baseline gap-0.5 mb-0.5">
                <span style={{ fontSize: 7, fontWeight: 700 }}>{n}.</span>
                <div className="flex-1 bg-surface3 rounded-[1px]" style={{ height: 2 }} />
              </div>
              <div
                className="ml-[7px] bg-surface3 rounded-[1px]"
                style={{ height: 2, width: "70%" }}
              />
            </div>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-2 flex-wrap">
            {test.tags.map((t) => (
              <Chip key={t} size="sm">
                {t}
              </Chip>
            ))}
          </div>
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitTitle();
                } else if (e.key === "Escape") {
                  setTitleDraft(test.title);
                  setEditingTitle(false);
                }
              }}
              className="text-h1 text-text mb-1 w-full bg-surface border border-accent rounded-r1 px-2 py-0.5 focus:outline-none focus:shadow-accent-glow"
              aria-label="시험지 제목"
            />
          ) : (
            <div className="text-h1 text-text mb-1 flex items-center gap-2 group">
              <span className="min-w-0 break-words">{test.title}</span>
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(test.title);
                  setEditingTitle(true);
                }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted hover:text-accent flex-shrink-0"
                aria-label="제목 수정"
                title="제목 수정"
              >
                <Icon name="pencil-simple" size={16} />
              </button>
            </div>
          )}
          <div className="text-body text-muted mb-4">
            {test.subject} · {displayCount}문항 · {test.tags.length}개 태그 · {test.time}
          </div>

          <div className="grid gap-7" style={{ gridTemplateColumns: "repeat(5, max-content)" }}>
            {stats.map((s) => (
              <div key={s.label} className="whitespace-nowrap">
                <div className="text-micro uppercase text-muted mb-1">{s.label}</div>
                <div className="flex items-baseline gap-1">
                  <span
                    className="font-mono"
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: s.tone ? TONE_COLOR[s.tone] : "#1A1D24",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {s.value}
                  </span>
                  {s.unit && <span className="text-small text-muted">{s.unit}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default HeroCard;
