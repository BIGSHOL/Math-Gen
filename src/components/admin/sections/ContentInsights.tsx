import { useEffect, useState } from "react";
import { Card, Chip, Heading, Eyebrow, Icon } from "@app/components/ui";
import {
  loadFeedbackSummary,
  loadFeedbackByModel,
  loadFeedbackByTopic,
  type FeedbackSummary,
  type FeedbackByModel,
  type FeedbackByTopic,
} from "@app/services/api/feedback";

/**
 * Admin §7 — 사용자 콘텐츠 피드백 분석 (Phase E).
 *
 * 데이터:
 *   - 총 피드백 / 부정 비율 / 긍정-부정 분포
 *   - 모델별 평균 rating + 부정 평가 빈도
 *   - 단원별 평균 rating + 부정 평가 빈도
 *
 * Prompt 튜닝 신호 — *자주 부정 평가받는 (model, topic) 조합* 식별.
 */
export const ContentInsights = () => {
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [byModel, setByModel] = useState<FeedbackByModel[]>([]);
  const [byTopic, setByTopic] = useState<FeedbackByTopic[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [s, m, t] = await Promise.all([
        loadFeedbackSummary(30),
        loadFeedbackByModel(30),
        loadFeedbackByTopic(30),
      ]);
      if (cancelled) return;
      setSummary(s);
      setByModel(m);
      setByTopic(t);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <Heading level="h2" className="mb-4">콘텐츠 분석</Heading>
        <div className="text-muted">불러오는 중…</div>
      </div>
    );
  }

  const empty = !summary || summary.total === 0;

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      <Heading level="h2">콘텐츠 분석 (지난 30일)</Heading>

      {empty ? (
        <Card pad={20}>
          <div className="text-center py-6">
            <Icon name="thumbs-up" size={36} color="#9CA3AF" weight="duotone" className="mb-3" />
            <Chip tone="soft" size="sm" className="mb-2">피드백 0건</Chip>
            <p className="text-small text-muted max-w-md mx-auto leading-relaxed">
              아직 사용자 피드백이 없습니다. Step 3 (해설) / Step 4 (변형) 카드의
              👍 / 👎 버튼이 활성화되어 있습니다.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* 요약 카드 */}
          <div className="grid grid-cols-4 gap-3">
            <SummaryCard label="총 피드백" value={summary!.total.toString()} unit="건" />
            <SummaryCard label="👍 긍정" value={summary!.positive.toString()} unit="건" tone="ok" />
            <SummaryCard label="👎 부정" value={summary!.negative.toString()} unit="건" tone="warn" />
            <SummaryCard
              label="부정 비율"
              value={summary!.negativeRate.toFixed(1)}
              unit="%"
              tone={summary!.negativeRate > 30 ? "warn" : "ok"}
            />
          </div>

          {/* 모델별 표 */}
          {byModel.length > 0 && (
            <Card pad={16}>
              <Eyebrow className="mb-3">모델별 평가 (부정 평가 빈도 높은 순)</Eyebrow>
              <table className="w-full text-small">
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th className="text-left py-2 font-medium">모델</th>
                    <th className="text-right font-medium">총 피드백</th>
                    <th className="text-right font-medium">평균 평가</th>
                    <th className="text-right font-medium">👎 부정</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map((m) => (
                    <tr key={m.model} className="border-b border-line/50 hover:bg-surface2">
                      <td className="py-2 font-mono">{m.model}</td>
                      <td className="text-right font-mono">{m.count.toLocaleString()}</td>
                      <td className="text-right font-mono">{m.avg_rating.toFixed(1)} / 5</td>
                      <td className="text-right font-mono">
                        <span className={m.negative_count > 5 ? "text-warn font-bold" : ""}>
                          {m.negative_count}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* 단원별 표 */}
          {byTopic.length > 0 && (
            <Card pad={16}>
              <Eyebrow className="mb-3">단원별 평가 (부정 평가 빈도 높은 순, 상위 20)</Eyebrow>
              <table className="w-full text-small">
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th className="text-left py-2 font-medium">단원</th>
                    <th className="text-right font-medium">총 피드백</th>
                    <th className="text-right font-medium">평균 평가</th>
                    <th className="text-right font-medium">👎 부정</th>
                  </tr>
                </thead>
                <tbody>
                  {byTopic.map((t) => (
                    <tr key={t.topic} className="border-b border-line/50 hover:bg-surface2">
                      <td className="py-2">{t.topic}</td>
                      <td className="text-right font-mono">{t.count.toLocaleString()}</td>
                      <td className="text-right font-mono">{t.avg_rating.toFixed(1)} / 5</td>
                      <td className="text-right font-mono">
                        <span className={t.negative_count > 3 ? "text-warn font-bold" : ""}>
                          {t.negative_count}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
};

interface SummaryCardProps {
  label: string;
  value: string;
  unit: string;
  tone?: "ok" | "warn";
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
