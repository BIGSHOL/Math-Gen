import { useEffect, useState } from "react";
import { Card, Chip, Heading, Eyebrow, Icon } from "@app/components/ui";
import { loadAnomalies, type AnomalyRow, type AnomalyKind } from "@app/services/api/admin";

/**
 * Admin §6 — 이상 감지 (Phase D).
 *
 * admin_anomalies view 폴링 (30초). 3 kind:
 *   - high_volume      : 시간당 호출 100+
 *   - high_error_rate  : 24h 누적 50+ 회 + 에러율 30%+
 *   - high_cost        : 24h 비용 $20+
 *
 * 빈 array = 정상 — 안내 카드 표시.
 */
export const Monitoring = () => {
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetchAt, setLastFetchAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchAnomalies = async () => {
      const data = await loadAnomalies();
      if (cancelled) return;
      setAnomalies(data);
      setLoading(false);
      setLastFetchAt(new Date());
    };
    void fetchAnomalies();
    // 30초 polling
    const interval = setInterval(fetchAnomalies, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="p-6 space-y-4 overflow-y-auto">
      <div className="flex items-center justify-between gap-4">
        <Heading level="h2">이상 감지</Heading>
        {lastFetchAt && (
          <span className="text-caption text-muted">
            마지막 갱신: {lastFetchAt.toLocaleTimeString("ko-KR")} (30초마다 자동)
          </span>
        )}
      </div>
      <Eyebrow>{anomalies.length} 건 감지</Eyebrow>

      {loading ? (
        <Card pad={20}><div className="text-center text-muted">불러오는 중…</div></Card>
      ) : anomalies.length === 0 ? (
        <Card pad={20}>
          <div className="text-center py-4">
            <Icon name="check-circle" size={36} color="#10B981" weight="duotone" className="mb-2" />
            <div className="text-small font-semibold text-ok mb-1">이상 패턴 없음</div>
            <p className="text-caption text-muted max-w-md mx-auto leading-relaxed">
              지난 1시간 / 24시간 동안 비정상적 사용 패턴이 감지되지 않았습니다.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {anomalies.map((a, idx) => (
            <AnomalyCard key={`${a.kind}-${a.user_id ?? "null"}-${idx}`} anomaly={a} />
          ))}
        </div>
      )}
    </div>
  );
};

const KIND_LABEL: Record<AnomalyKind, string> = {
  high_volume: "과다 호출",
  high_error_rate: "높은 에러율",
  high_cost: "비용 급증",
};

const KIND_ICON: Record<AnomalyKind, string> = {
  high_volume: "lightning",
  high_error_rate: "warning-octagon",
  high_cost: "currency-circle-dollar",
};

const KIND_TONE: Record<AnomalyKind, "warn" | "danger" | "accent"> = {
  high_volume: "accent",
  high_error_rate: "warn",
  high_cost: "warn",
};

const AnomalyCard = ({ anomaly }: { anomaly: AnomalyRow }) => {
  return (
    <Card pad={14}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-warn-soft flex items-center justify-center">
          <Icon name={KIND_ICON[anomaly.kind]} size={20} color="#F59E0B" weight="duotone" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Chip tone={KIND_TONE[anomaly.kind]} size="sm">
              {KIND_LABEL[anomaly.kind]}
            </Chip>
            <span className="text-caption text-muted">
              {new Date(anomaly.last_at).toLocaleString("ko-KR", { hour12: false })}
            </span>
          </div>
          <div className="text-small text-text">{anomaly.description}</div>
          <div className="text-caption text-muted mt-1 font-mono">
            사용자: {anomaly.user_id ? anomaly.user_id.slice(0, 12) + "…" : "(비로그인)"}
            {anomaly.tenant_id && ` · 학원: ${anomaly.tenant_id.slice(0, 8)}…`}
          </div>
        </div>
      </div>
    </Card>
  );
};
