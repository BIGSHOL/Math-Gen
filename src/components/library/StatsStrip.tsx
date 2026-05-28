import { useMemo } from "react";
import { StatCard } from "@app/components/ui";
import type { TestPaper } from "@app/types";

export interface StatsStripProps {
  /** 통계 계산 source — LibraryScreen 의 tests 배열 전체 (필터 적용 *전*). */
  tests: TestPaper[];
}

/**
 * 4-up dashboard stats — *실 데이터 기반*.
 *
 * 이전: hifi/library.jsx 의 hardcoded 1,420/9/23/78% + trend chip +82/+2/+3pt.
 * 현재: 받은 tests 배열로 즉시 계산. trend chip 은 *변화 추적 인프라 (예:
 * activity log) 가 없으므로* 일단 제거 — Phase 6 backend rewrite 시 일 단위
 * 변화량 추적 → trend 복귀.
 *
 * 통계 정의:
 *   - 변환 완료 — 모든 tests 의 problemCount 합. 학원 입장에서 *지금까지
 *     누적 변환된 문항 수*. 평균 22 문항 × 5 시험지 = 110 등.
 *   - 변형 시험지 — variants.length > 0 인 tests 수. *변형이 만들어진* 시험지.
 *   - 검토 대기 — status="warn" 인 tests 수. *손이 더 필요한* 시험지.
 *   - 완료 시험지 — status="ok" 인 tests 수. *확정* 된 시험지.
 *
 * 평균 정답률 (이전 78%) 은 *응시 결과 데이터* 가 있어야 의미 — 현 pipeline 은
 * 변환·생성·인쇄까지만 다룸. Phase 6 (응시 결과 추적) 시 stat 추가 또는 4번째
 * "완료 시험지" 자리 교체.
 */
export const StatsStrip = ({ tests }: StatsStripProps) => {
  const stats = useMemo(() => {
    let totalProblems = 0;
    let variantCount = 0;
    let reviewing = 0;
    let completed = 0;
    for (const t of tests) {
      totalProblems += t.problemCount ?? 0;
      if (t.variants.length > 0) variantCount++;
      if (t.status === "warn") reviewing++;
      if (t.status === "ok") completed++;
    }
    return { totalProblems, variantCount, reviewing, completed };
  }, [tests]);

  return (
    // 카드 폭 260 px 고정 — 하단 TestCard 와 정확히 동일한 폭으로 통일.
    // `1fr` 분배 안 씀 — 사용자 의도가 "와이드 모니터에서 카드 자체가
    // 늘어나는 것이 아니라 열 수만 분기되는 것".
    <div
      className="grid gap-3 justify-start"
      style={{ gridTemplateColumns: "repeat(auto-fill, 260px)" }}
    >
      <StatCard
        icon="check-circle"
        label="변환 완료"
        value={stats.totalProblems.toLocaleString()}
        unit="문항"
        tone="ok"
      />
      <StatCard
        icon="sparkle"
        label="변형 시험지"
        value={stats.variantCount.toString()}
        unit="개 생성"
        tone="accent"
      />
      <StatCard
        icon="warning-circle"
        label="검토 대기"
        value={stats.reviewing.toString()}
        unit="개"
        tone="warn"
      />
      <StatCard
        icon="trend-up"
        label="완료 시험지"
        value={stats.completed.toString()}
        unit="개"
        tone="ok"
      />
    </div>
  );
};

export default StatsStrip;
