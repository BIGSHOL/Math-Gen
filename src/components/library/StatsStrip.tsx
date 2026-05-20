import { StatCard } from "@app/components/ui";

/**
 * 4-up dashboard stats row. Hard-coded values match hifi/library.jsx —
 * Phase 6 (backend) will compute these from real activity logs.
 */
export const StatsStrip = () => (
  <div className="grid grid-cols-4 gap-3">
    <StatCard
      icon="check-circle"
      label="변환 완료"
      value="1,420"
      unit="문항"
      trend="+82"
      trendTone="ok"
      tone="ok"
    />
    <StatCard
      icon="sparkle"
      label="변형 시험지"
      value="9"
      unit="개 생성"
      trend="+2"
      tone="accent"
    />
    <StatCard
      icon="warning-circle"
      label="검토 대기"
      value="23"
      unit="문항"
      tone="warn"
    />
    <StatCard
      icon="trend-up"
      label="평균 정답률"
      value="78"
      unit="%"
      trend="+3pt"
      trendTone="ok"
      tone="ok"
    />
  </div>
);

export default StatsStrip;
