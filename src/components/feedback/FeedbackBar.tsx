import { useState } from "react";
import { Btn, Chip, Icon } from "@app/components/ui";
import { useAuthStore } from "@app/stores/authStore";
import { supabase } from "@app/services/api/supabase";
import {
  submitFeedback,
  type FeedbackTargetKind,
  type SubmitFeedbackInput,
} from "@app/services/api/feedback";

/**
 * 카드 푸터의 👍 / 👎 피드백 UI. 비침습 디자인 — 작은 영역.
 *
 * **흐름**:
 *   1. 사용자가 👍 클릭 → 즉시 submit (rating=5) + ✓ 표시
 *   2. 사용자가 👎 클릭 → 사유 chip + comment textarea popover 전개 →
 *      "제출" 클릭 시 submit (rating=1, reason_chips, comment) + ✓ 표시
 *   3. submit 후 비활성화 — 같은 카드 재평가 안 됨 (component lifetime 안)
 *
 * **anon (비로그인) 차단**: supabase null 또는 user null 이면 null 반환.
 */

interface FeedbackBarProps {
  targetKind: FeedbackTargetKind;
  targetId: string;
  /** model / grade / topic / problem_text_snippet — 후속 분석용. */
  context?: Record<string, unknown>;
  className?: string;
}

const REASON_CHIPS: Array<{ id: string; label: string }> = [
  { id: "accuracy", label: "정확도 X" },
  { id: "terminology", label: "한국 교과서 용어 X" },
  { id: "diagram", label: "도형 안 맞음" },
  { id: "format", label: "형식 문제" },
  { id: "other", label: "기타" },
];

export const FeedbackBar = ({
  targetKind,
  targetId,
  context,
  className,
}: FeedbackBarProps) => {
  const user = useAuthStore((s) => s.user);
  const [submitted, setSubmitted] = useState(false);
  const [showNegativeForm, setShowNegativeForm] = useState(false);
  const [comment, setComment] = useState("");
  const [reasons, setReasons] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // 비로그인 또는 supabase 비활성 시 숨김
  if (!supabase || !user) return null;

  // 평가 완료 시 — ✓ 표시만 (UI 비활성)
  if (submitted) {
    return (
      <div className={`flex items-center gap-1 text-caption text-muted ${className ?? ""}`}>
        <Icon name="check-circle" size={14} color="#10B981" weight="duotone" />
        <span>감사합니다</span>
      </div>
    );
  }

  const handlePositive = async () => {
    setSubmitting(true);
    await submitFeedback({
      target_kind: targetKind,
      target_id: targetId,
      rating: 5,
      context,
    } satisfies SubmitFeedbackInput);
    setSubmitted(true);
  };

  const toggleReason = (id: string) => {
    setReasons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleNegativeSubmit = async () => {
    setSubmitting(true);
    await submitFeedback({
      target_kind: targetKind,
      target_id: targetId,
      rating: 1,
      comment: comment.trim() || undefined,
      reason_chips: Array.from(reasons),
      context,
    });
    setSubmitted(true);
  };

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <div className="flex items-center gap-1 text-caption text-muted">
        <span>이 결과는 어떠셨나요?</span>
        <button
          type="button"
          onClick={handlePositive}
          disabled={submitting}
          aria-label="좋아요"
          className="ml-1 p-1 rounded-r1 hover:bg-ok-soft transition disabled:opacity-50"
        >
          <Icon name="thumbs-up" size={14} color="#10B981" weight="duotone" />
        </button>
        <button
          type="button"
          onClick={() => setShowNegativeForm(true)}
          disabled={submitting}
          aria-label="부정 평가"
          className="p-1 rounded-r1 hover:bg-warn-soft transition disabled:opacity-50"
        >
          <Icon name="thumbs-down" size={14} color="#F59E0B" weight="duotone" />
        </button>
      </div>

      {/* 부정 평가 popover */}
      {showNegativeForm && (
        <div className="border border-warn/30 bg-warn-soft/30 rounded-r2 p-3 space-y-2">
          <div className="text-caption font-semibold text-warn-ink">어떤 점이 문제인가요?</div>
          <div className="flex flex-wrap gap-1">
            {REASON_CHIPS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleReason(c.id)}
                className="focus:outline-none"
              >
                <Chip
                  tone={reasons.has(c.id) ? "warn" : "soft"}
                  size="sm"
                  className={reasons.has(c.id) ? "ring-1 ring-warn" : ""}
                >
                  {c.label}
                </Chip>
              </button>
            ))}
          </div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="추가 의견 (선택)"
            rows={2}
            className="w-full px-2 py-1.5 text-small bg-surface border border-line rounded-r1 focus:outline-none focus:border-warn resize-none"
          />
          <div className="flex justify-end gap-1.5">
            <Btn
              kind="ghost"
              size="sm"
              onClick={() => {
                setShowNegativeForm(false);
                setComment("");
                setReasons(new Set());
              }}
              disabled={submitting}
            >
              취소
            </Btn>
            <Btn
              kind="accent"
              size="sm"
              onClick={handleNegativeSubmit}
              disabled={submitting || (reasons.size === 0 && !comment.trim())}
            >
              제출
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
};
