import { useEffect, useState } from "react";
import { Card, Heading, Chip, Eyebrow } from "@app/components/ui";
import {
  loadUsageByModel,
  loadUsageSummary,
  loadUsageTimeseries,
  type UsageStatsByModel,
  type UsageStatsTimeseries,
  type UsageSummary,
} from "@app/services/api/admin";

/**
 * Admin §1 — AI 사용량 / 비용 dashboard.
 *
 * 4 요약 카드 (총 호출 / 총 비용 / 총 토큰 / 에러 수) + 모델별 표 + 일별 시계열.
 * 모든 데이터는 *지난 30일* 기준. RLS 가 권한별 필터 (tenant_admin 자기 tenant 만).
 *
 * 차트는 *추가 의존성 0* — Tailwind flexbox + inline SVG bar.
 */
export const UsageDashboard = () => {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [byModel, setByModel] = useState<UsageStatsByModel[]>([]);
  const [timeseries, setTimeseries] = useState<UsageStatsTimeseries[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, m, ts] = await Promise.all([
        loadUsageSummary(30),
        loadUsageByModel(30),
        loadUsageTimeseries(30),
      ]);
      if (cancelled) return;
      setSummary(s);
      setByModel(m);
      setTimeseries(ts);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <Heading level="h2" className="mb-4">사용량 / 비용</Heading>
        <div className="text-muted">불러오는 중…</div>
      </div>
    );
  }

  const maxCost = Math.max(...timeseries.map((t) => t.total_cost_usd), 0.001);

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <Heading level="h2">사용량 / 비용 (지난 30일)</Heading>

      {/* 4 요약 카드 */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryCard label="총 호출" value={summary?.totalCalls.toLocaleString() ?? "0"} unit="회" />
        <SummaryCard
          label="총 비용"
          value={(summary?.totalCostUsd ?? 0).toFixed(3)}
          unit="USD"
          tone="warn"
        />
        <SummaryCard
          label="총 토큰"
          value={((summary?.totalInputTokens ?? 0) + (summary?.totalOutputTokens ?? 0)).toLocaleString()}
          unit="토큰"
        />
        <SummaryCard
          label="에러 수"
          value={(summary?.errorCount ?? 0).toLocaleString()}
          unit="건"
          tone={summary?.errorCount ? "warn" : "ok"}
        />
      </div>

      {/* 일별 시계열 차트 (SVG bar) */}
      {timeseries.length > 0 && (
        <Card pad={16}>
          <Eyebrow className="mb-2">일별 비용 추이</Eyebrow>
          <div className="flex items-end gap-1 h-32">
            {timeseries.map((t) => {
              const h = (t.total_cost_usd / maxCost) * 100;
              return (
                <div
                  key={t.date}
                  className="flex-1 flex flex-col items-center justify-end group relative"
                  title={`${t.date}: ${t.count}회, $${t.total_cost_usd.toFixed(3)}`}
                >
                  <div
                    className="w-full bg-accent rounded-r1 transition-all hover:bg-accent/80"
                    style={{ height: `${Math.max(h, 2)}%` }}
                  />
                  <div className="text-caption text-muted mt-1 truncate w-full text-center">
                    {t.date.slice(5)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* 모델별 표 */}
      {byModel.length > 0 && (
        <Card pad={16}>
          <Eyebrow className="mb-3">모델별 사용량</Eyebrow>
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="text-left py-2 font-medium">모델</th>
                <th className="text-right font-medium">호출</th>
                <th className="text-right font-medium">입력</th>
                <th className="text-right font-medium">출력</th>
                <th className="text-right font-medium">캐시 읽기</th>
                <th className="text-right font-medium">비용 (USD)</th>
              </tr>
            </thead>
            <tbody>
              {byModel.map((m) => (
                <tr key={m.model} className="border-b border-line/50 hover:bg-surface2">
                  <td className="py-2 font-mono">{m.model === "unknown" ? "(알 수 없음)" : m.model}</td>
                  <td className="text-right font-mono">{m.count.toLocaleString()}</td>
                  <td className="text-right font-mono">{m.total_input_tokens.toLocaleString()}</td>
                  <td className="text-right font-mono">{m.total_output_tokens.toLocaleString()}</td>
                  <td className="text-right font-mono">{m.total_cache_read_tokens.toLocaleString()}</td>
                  <td className="text-right font-mono font-bold">${m.total_cost_usd.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {byModel.length === 0 && timeseries.length === 0 && (
        <Card pad={20}>
          <div className="text-center text-muted">
            <Chip tone="soft" size="sm" className="mb-2">데이터 없음</Chip>
            <p className="text-small">지난 30일 AI 호출 기록이 없습니다.</p>
          </div>
        </Card>
      )}
    </div>
  );
};

interface SummaryCardProps {
  label: string;
  value: string;
  unit: string;
  tone?: "ok" | "warn" | "accent";
}

const SummaryCard = ({ label, value, unit, tone }: SummaryCardProps) => (
  <Card pad={14}>
    <Eyebrow>{label}</Eyebrow>
    <div className="mt-1 flex items-baseline gap-1">
      <span
        className={`text-2xl font-bold tabular-nums ${
          tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-text"
        }`}
      >
        {value}
      </span>
      <span className="text-caption text-muted">{unit}</span>
    </div>
  </Card>
);
