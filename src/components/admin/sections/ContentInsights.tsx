import { Card, Chip, Heading, Eyebrow, Icon } from "@app/components/ui";

/**
 * Admin §7 — 콘텐츠 분석 (Phase E 구현 예정). 현재 stub.
 *
 * Phase E 구현 시:
 *   - content_feedback 집계 (👍/👎 + 사유 chip + comment)
 *   - 모델별 / 학년별 / 단원별 평균 rating
 *   - 자주 부정 평가받는 (model, topic) 조합 식별
 *   - raw 콘텐츠 익명화 export (CSV / JSON)
 *   - prompt 튜닝 신호로 활용
 */
export const ContentInsights = () => (
  <div className="p-6 space-y-4 overflow-y-auto">
    <Heading level="h2">콘텐츠 분석</Heading>
    <Eyebrow>Phase E — 구현 예정</Eyebrow>

    <Card pad={20}>
      <div className="text-center py-6">
        <Icon name="thumbs-up" size={36} color="#9CA3AF" weight="duotone" className="mb-3" />
        <Chip tone="soft" size="sm" className="mb-2">준비 중</Chip>
        <p className="text-small text-muted max-w-md mx-auto leading-relaxed">
          사용자의 👍 / 👎 피드백을 집계해 prompt 튜닝 신호로 활용. 모델별 /
          학년별 / 단원별 평균 평가 + 자주 부정 평가받는 조합 식별.
        </p>
        <p className="text-caption text-muted mt-3">
          Phase E 에서 FeedbackBar UI + content_feedback 테이블 + 익명화 export.
        </p>
      </div>
    </Card>
  </div>
);
