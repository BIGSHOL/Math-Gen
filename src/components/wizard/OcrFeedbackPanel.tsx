import { useCallback, useEffect, useState } from "react";
import { Btn, Chip, Icon } from "@app/components/ui";
import { ModalShell } from "@app/components/modal";
import { showToast } from "@app/stores/toastStore";
import { useAuthStore } from "@app/stores/authStore";
import { cn } from "@app/lib/tailwind";
import {
  OCR_FEEDBACK_REASON_CODES,
  OCR_FEEDBACK_REASON_LABELS,
  type OcrFeedbackReasonCode,
  type OcrFeedbackRow,
  submitOcrFeedback,
  deleteMyOcrFeedback,
  getMyOcrFeedback,
} from "@app/services/api/ocrFeedback";

/**
 * Phase #6 — OCR 카드 우상단 좋아요/싫어요 + 사유 모달.
 *
 * 사용자 보고: "ocr 처리단계에서도 좋아요와 싫어요 버튼 추가해주고 싫어요
 * 클릭시 대략적인 이유 입력 또는 사전에 정의된 항목중에서 선택할 수
 * 있도록, 싫어요 된 문제는 따로 스크랩하여서 관리자에서 이유 확인할 수 있게."
 *
 * **동작**:
 *  - 👍 클릭 → submitOcrFeedback({ rating: "like" }) 즉시 (사유 X)
 *  - 👎 클릭 → 모달 띄움 → 사유 선택/입력 → 제출 → submitOcrFeedback
 *  - 같은 버튼 재클릭 → deleteMyOcrFeedback (취소)
 *  - 모달 안 "취소" → 모달만 닫음 (DB 변경 X)
 *
 * **로컬 state vs 서버**: optimistic update — 즉시 currentRating 갱신,
 * 실패 시 toast 경고 + revert.
 *
 * **비로그인**: 버튼 자체 숨김 (RLS 가 차단하지만 사용자 혼란 방지).
 */
export interface OcrFeedbackPanelProps {
  ocrProblemId: string;
  testId: string;
  /** mount 시 hydrate 된 기존 피드백 (있으면). null = 없음 (👍/👎 둘 다 비활성). */
  initial?: OcrFeedbackRow | null;
  /** Compact 모드 — OCRItem 헤더에 inline 으로 (border 없음). 기본 false. */
  compact?: boolean;
}

export const OcrFeedbackPanel = ({
  ocrProblemId,
  testId,
  initial,
  compact = false,
}: OcrFeedbackPanelProps) => {
  const user = useAuthStore((s) => s.user);
  const [current, setCurrent] = useState<OcrFeedbackRow | null>(initial ?? null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // initial 이 변경되면 (parent 가 hydrate) 동기화. initial === undefined 면
  // 자체 DB 조회로 hydrate (per-item fetch). bulk hydration 필요 시 parent
  // (Step2OCRReview) 가 useTestOcrFeedback 같은 hook 으로 initial 미리 채움.
  useEffect(() => {
    if (initial !== undefined) {
      setCurrent(initial);
      return;
    }
    if (!user) {
      setCurrent(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const row = await getMyOcrFeedback(ocrProblemId);
      if (!cancelled) setCurrent(row);
    })();
    return () => {
      cancelled = true;
    };
  }, [initial, user, ocrProblemId]);

  const isLiked = current?.rating === "like";
  const isDisliked = current?.rating === "dislike";

  const handleLikeClick = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    if (isLiked) {
      // 취소
      const prev = current;
      setCurrent(null);
      const ok = await deleteMyOcrFeedback(ocrProblemId);
      if (!ok) {
        setCurrent(prev);
        showToast({ kind: "error", message: "취소 실패. 잠시 후 다시 시도하세요." });
      }
    } else {
      // 👍 등록 (또는 👎 → 👍 전환)
      const result = await submitOcrFeedback({
        ocr_problem_id: ocrProblemId,
        test_id: testId,
        rating: "like",
      });
      if (result) {
        setCurrent(result);
        showToast({ kind: "success", message: "좋아요 등록", durationMs: 1500 });
      } else {
        showToast({ kind: "error", message: "등록 실패. 로그인 상태 확인" });
      }
    }
    setSubmitting(false);
  }, [submitting, isLiked, current, ocrProblemId, testId]);

  const handleDislikeClick = useCallback(() => {
    if (submitting) return;
    if (isDisliked) {
      // 이미 dislike → 취소
      void (async () => {
        setSubmitting(true);
        const prev = current;
        setCurrent(null);
        const ok = await deleteMyOcrFeedback(ocrProblemId);
        if (!ok) {
          setCurrent(prev);
          showToast({ kind: "error", message: "취소 실패. 잠시 후 다시 시도하세요." });
        }
        setSubmitting(false);
      })();
    } else {
      // 모달 띄워서 사유 입력
      setModalOpen(true);
    }
  }, [submitting, isDisliked, current, ocrProblemId]);

  const handleReasonSubmit = useCallback(
    async (codes: OcrFeedbackReasonCode[], text: string) => {
      setSubmitting(true);
      const result = await submitOcrFeedback({
        ocr_problem_id: ocrProblemId,
        test_id: testId,
        rating: "dislike",
        reason_codes: codes,
        reason_text: text.trim() || null,
      });
      if (result) {
        setCurrent(result);
        setModalOpen(false);
        showToast({
          kind: "success",
          message: "피드백 등록 — 관리자에게 전달됩니다",
          durationMs: 2500,
        });
      } else {
        showToast({ kind: "error", message: "등록 실패. 로그인 상태 확인" });
      }
      setSubmitting(false);
    },
    [ocrProblemId, testId],
  );

  // 비로그인 시 패널 숨김
  if (!user) return null;

  return (
    <>
      <div className={cn("flex items-center gap-1", compact ? "" : "px-1")}>
        <button
          type="button"
          onClick={handleLikeClick}
          disabled={submitting}
          title={isLiked ? "좋아요 취소" : "좋아요"}
          aria-label={isLiked ? "좋아요 취소" : "좋아요"}
          aria-pressed={isLiked}
          className={cn(
            "h-7 w-7 grid place-items-center rounded-r1 transition-all",
            "hover:bg-accent-soft focus:outline-none focus:ring-2 focus:ring-accent/40",
            isLiked && "bg-accent-soft text-accent",
            !isLiked && "text-muted hover:text-accent",
            submitting && "opacity-50 cursor-wait",
          )}
        >
          <Icon name="thumbs-up" weight={isLiked ? "fill" : "regular"} size={15} />
        </button>
        <button
          type="button"
          onClick={handleDislikeClick}
          disabled={submitting}
          title={isDisliked ? "싫어요 취소 / 사유 수정" : "싫어요 — 사유 입력"}
          aria-label={isDisliked ? "싫어요 취소" : "싫어요"}
          aria-pressed={isDisliked}
          className={cn(
            "h-7 w-7 grid place-items-center rounded-r1 transition-all",
            "hover:bg-warn-soft focus:outline-none focus:ring-2 focus:ring-warn/40",
            isDisliked && "bg-warn-soft text-warnInk",
            !isDisliked && "text-muted hover:text-warnInk",
            submitting && "opacity-50 cursor-wait",
          )}
        >
          <Icon name="thumbs-down" weight={isDisliked ? "fill" : "regular"} size={15} />
        </button>
        {isDisliked && current && (current.reason_codes.length > 0 || current.reason_text) && (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            title="사유 수정"
            className="h-7 px-2 rounded-r1 text-caption text-muted hover:bg-warn-soft hover:text-warnInk transition-colors"
          >
            <Icon name="note-pencil" size={13} className="inline-block mr-0.5" />
            사유
          </button>
        )}
      </div>
      <FeedbackReasonModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleReasonSubmit}
        initialCodes={current?.reason_codes ?? []}
        initialText={current?.reason_text ?? ""}
        submitting={submitting}
      />
    </>
  );
};

// ============================================================================
// Reason modal — 사전 정의 6 사유 (multi-select) + 자유 입력
// ============================================================================

interface FeedbackReasonModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (codes: OcrFeedbackReasonCode[], text: string) => void | Promise<void>;
  initialCodes?: OcrFeedbackReasonCode[];
  initialText?: string;
  submitting?: boolean;
}

const FeedbackReasonModal = ({
  open,
  onClose,
  onSubmit,
  initialCodes = [],
  initialText = "",
  submitting = false,
}: FeedbackReasonModalProps) => {
  const [codes, setCodes] = useState<Set<OcrFeedbackReasonCode>>(
    () => new Set(initialCodes),
  );
  const [text, setText] = useState(initialText);

  // open / initial 변경 시 reset
  useEffect(() => {
    if (open) {
      setCodes(new Set(initialCodes));
      setText(initialText);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggleCode = (code: OcrFeedbackReasonCode) => {
    setCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleSubmit = () => {
    if (submitting) return;
    if (codes.size === 0 && text.trim().length === 0) {
      showToast({ kind: "warn", message: "사유를 한 개 이상 선택하거나 입력하세요." });
      return;
    }
    void onSubmit(Array.from(codes), text);
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      className="w-full max-w-[560px]"
      aria-labelledby="ocr-feedback-modal-title"
    >
      <div className="px-5 py-4 border-b border-line">
        <h2 id="ocr-feedback-modal-title" className="text-subhead font-semibold text-ink">
          무엇이 잘못됐나요?
        </h2>
        <p className="text-caption text-muted mt-1">
          관리자에게 전달되어 OCR 정확도 개선에 사용됩니다. 복수 선택 가능.
        </p>
      </div>
      <div className="px-5 py-4 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {OCR_FEEDBACK_REASON_CODES.map((code) => {
            const active = codes.has(code);
            return (
              <button
                key={code}
                type="button"
                onClick={() => toggleCode(code)}
                aria-pressed={active}
                className={cn(
                  "px-3 py-2 rounded-r2 text-small font-medium transition-all border",
                  active
                    ? "border-warn bg-warn-soft text-warnInk shadow-sm"
                    : "border-line bg-surface text-text hover:border-warn/50 hover:bg-warn-soft/40",
                )}
              >
                {active && (
                  <Icon name="check" size={12} className="inline-block mr-1" />
                )}
                {OCR_FEEDBACK_REASON_LABELS[code]}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ocr-feedback-text" className="text-caption text-muted">
            추가 설명 (선택)
          </label>
          <textarea
            id="ocr-feedback-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="예: '본문 마지막 줄이 잘려서 누락됨'"
            rows={3}
            maxLength={500}
            className="px-3 py-2 rounded-r2 border border-line bg-surface text-body focus:outline-none focus:border-accent focus:shadow-accent-glow resize-none"
          />
          <div className="text-caption text-muted text-right">{text.length} / 500</div>
        </div>
        {codes.size > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 py-2 rounded-r2 bg-surface2 border border-line">
            <span className="text-caption text-muted">선택됨:</span>
            {Array.from(codes).map((c) => (
              <Chip key={c} size="sm" tone="warn">
                {OCR_FEEDBACK_REASON_LABELS[c]}
              </Chip>
            ))}
          </div>
        )}
      </div>
      <div className="px-5 py-3 border-t border-line flex items-center justify-end gap-2 bg-surface2">
        <Btn kind="ghost" onClick={onClose} disabled={submitting}>
          취소
        </Btn>
        <Btn
          kind="accent"
          onClick={handleSubmit}
          disabled={submitting || (codes.size === 0 && text.trim().length === 0)}
          icon={submitting ? "spinner" : "paper-plane-right"}
        >
          {submitting ? "제출 중..." : "사유 제출"}
        </Btn>
      </div>
    </ModalShell>
  );
};
