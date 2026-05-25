import { Card, Chip, Heading, Eyebrow, Icon } from "@app/components/ui";

/**
 * Admin §6 — 이상 감지 (Phase D 구현 예정). 현재 stub.
 *
 * Phase D 구현 시:
 *   - admin_anomalies view (high_volume / high_error_rate / high_cost)
 *   - 30초 polling
 *   - Sidebar 메뉴에 count badge
 */
export const Monitoring = () => (
  <div className="p-6 space-y-4 overflow-y-auto">
    <Heading level="h2">이상 감지</Heading>
    <Eyebrow>Phase D — 구현 예정</Eyebrow>

    <Card pad={20}>
      <div className="text-center py-6">
        <Icon name="radar" size={36} color="#9CA3AF" weight="duotone" className="mb-3" />
        <Chip tone="soft" size="sm" className="mb-2">준비 중</Chip>
        <p className="text-small text-muted max-w-md mx-auto leading-relaxed">
          AI 호출 패턴의 이상 징후를 자동 감지 — 시간당 호출 100+ / 에러율 30%+ /
          24시간 비용 $20+ 사용자를 식별해 알림.
        </p>
        <p className="text-caption text-muted mt-3">
          Phase D 에서 supabase view + Sidebar count badge + 30초 polling 통합.
        </p>
      </div>
    </Card>
  </div>
);
