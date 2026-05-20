import { Card, Chip } from "@app/components/ui";
import type { TestPaper } from "@app/types";

export interface HeroCardProps {
  test: TestPaper;
}

interface HeroStat {
  label: string;
  value: string;
  unit?: string;
  tone?: "ok" | "warn";
}

const buildStats = (test: TestPaper): HeroStat[] => [
  { label: "문항", value: String(test.problemCount) },
  {
    label: "확정",
    value: String(Math.max(0, test.problemCount - 3)),
    unit: `/${test.problemCount}`,
    tone: "ok",
  },
  { label: "검토 필요", value: "3", tone: "warn" },
  { label: "변형본", value: String(test.variants.length), unit: "개" },
  { label: "평균 난이도", value: "중" },
];

const TONE_COLOR: Record<NonNullable<HeroStat["tone"]>, string> = {
  ok: "#10B981",
  warn: "#F59E0B",
};

/**
 * Detail hero — large faux paper thumbnail + tags + title + 5-up stat row.
 * The thumbnail is the same placeholder pattern as Library's TestCard so
 * the visual rhythm carries from Library → Detail.
 */
export const HeroCard = ({ test }: HeroCardProps) => {
  const stats = buildStats(test);
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
          <div className="text-h1 text-text mb-1">{test.title}</div>
          <div className="text-body text-muted mb-4">
            {test.subject} · {test.problemCount}문항 · {test.tags.length}개 태그 · {test.time}
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
