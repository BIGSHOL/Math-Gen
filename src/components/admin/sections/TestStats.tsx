import { useEffect, useState } from "react";
import { Card, Heading, Eyebrow } from "@app/components/ui";
import { loadTestStats, type TestStatsRow } from "@app/services/api/admin";
import { GRADE_LABELS } from "@app/services/ai/mathDefense";

/** 학년 코드 → 한글 라벨 (middle2 → 중2, high1_common1 → 고1 공통수학1). 미지정/미매핑 fallback. */
const gradeLabel = (g: string | null): string =>
  g ? (GRADE_LABELS[g as keyof typeof GRADE_LABELS] ?? g) : "(미지정)";

/**
 * Admin §4 — 시험지 통계. 학년별 분포 + 평균 문항 수.
 */
export const TestStats = () => {
  const [rows, setRows] = useState<TestStatsRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const data = await loadTestStats();
      if (cancelled) return;
      setRows(data.sort((a, b) => b.count - a.count));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const total = rows.reduce((sum, r) => sum + r.count, 0);
  const maxCount = Math.max(...rows.map((r) => r.count), 1);

  return (
    <div className="p-6 space-y-4 overflow-y-auto">
      <Heading level="h2">시험지 통계</Heading>
      <Eyebrow>총 {total} 개 시험지</Eyebrow>

      <Card pad={16}>
        {loading ? (
          <div className="text-muted">불러오는 중…</div>
        ) : rows.length === 0 ? (
          <div className="text-muted">시험지가 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.grade ?? "(미지정)"} className="flex items-center gap-3">
                <div className="w-24 text-small font-semibold">{gradeLabel(r.grade)}</div>
                <div className="flex-1 bg-surface2 rounded-r1 overflow-hidden" style={{ height: 18 }}>
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${(r.count / maxCount) * 100}%` }}
                  />
                </div>
                <div className="w-20 text-right text-small font-mono">{r.count} 개</div>
                <div className="w-24 text-right text-caption text-muted">
                  평균 {r.avg_problem_count.toFixed(1)} 문항
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
};
