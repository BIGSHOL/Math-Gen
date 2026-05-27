import { useCallback, useEffect, useMemo, useState } from "react";
import { Btn, Card, Chip, Eyebrow, Heading, Icon } from "@app/components/ui";
import { Segmented } from "@app/components/ui";
import MarkdownRenderer from "@app/components/math/MarkdownRenderer";
import {
  listScrappedOcrItems,
  resolveOcrFeedback,
  unresolveOcrFeedback,
  loadOcrFeedbackSummary,
  OCR_FEEDBACK_REASON_LABELS,
  type OcrFeedbackReasonCode,
  type ScrappedOcrItem,
  type OcrFeedbackSummary,
} from "@app/services/api/ocrFeedback";
import { showToast } from "@app/stores/toastStore";

/**
 * Admin §8 — OCR 단계 사용자 👎 스크랩 list (Phase #6).
 *
 * 사용자 보고: "싫어요 된 문제는 따로 스크랩하여서 관리자에서 이유 확인할 수 있게."
 *
 * **데이터**:
 *  - 30일 요약 카드 (총 👍 / 총 👎 / 검토 대기 / 검토 완료)
 *  - 스크랩 리스트 (검토 대기 / 검토 완료 / 전체 토글)
 *  - 각 행: 시험지·페이지·문항번호·사유 chip·자유텍스트·신고자·시각
 *  - 액션: 검토 완료 표시 / 되돌리기
 *
 * **RLS**: tenant_admin = 같은 학원만, system_admin = 전체 (서비스 함수 단에서 자동).
 */

type FilterMode = "pending" | "resolved" | "all";

export const OcrScrapsManagement = () => {
  const [summary, setSummary] = useState<OcrFeedbackSummary | null>(null);
  const [items, setItems] = useState<ScrappedOcrItem[]>([]);
  const [filter, setFilter] = useState<FilterMode>("pending");
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Load summary + list whenever filter or refreshKey changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const resolvedFlag =
        filter === "pending" ? false : filter === "resolved" ? true : "all";
      const [s, list] = await Promise.all([
        loadOcrFeedbackSummary(30),
        listScrappedOcrItems({ resolved: resolvedFlag, limit: 200 }),
      ]);
      if (cancelled) return;
      setSummary(s);
      setItems(list);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, refreshKey]);

  const handleResolve = useCallback(async (feedbackId: string) => {
    const ok = await resolveOcrFeedback(feedbackId);
    if (ok) {
      showToast({ kind: "success", message: "검토 완료 표시", durationMs: 1500 });
      setRefreshKey((k) => k + 1);
    } else {
      showToast({ kind: "error", message: "처리 실패" });
    }
  }, []);

  const handleUnresolve = useCallback(async (feedbackId: string) => {
    const ok = await unresolveOcrFeedback(feedbackId);
    if (ok) {
      showToast({ kind: "info", message: "검토 대기로 되돌림", durationMs: 1500 });
      setRefreshKey((k) => k + 1);
    } else {
      showToast({ kind: "error", message: "처리 실패" });
    }
  }, []);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <Heading level="h2" className="mb-1">
            OCR 스크랩
          </Heading>
          <p className="text-caption text-muted">
            사용자가 OCR 결과에 👎 한 문제 모음. 사유를 검토하고 처리 완료 표시.
          </p>
        </div>
        <Btn
          kind="ghost"
          size="sm"
          icon="arrows-clockwise"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          새로고침
        </Btn>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <SummaryCard
          label="👍 좋아요 (30일)"
          value={summary?.total_likes ?? 0}
          icon="thumbs-up"
          tone="ok"
        />
        <SummaryCard
          label="👎 싫어요 (30일)"
          value={summary?.total_dislikes ?? 0}
          icon="thumbs-down"
          tone="warn"
        />
        <SummaryCard
          label="검토 대기"
          value={summary?.pending_scraps ?? 0}
          icon="hourglass-medium"
          tone="accent"
        />
        <SummaryCard
          label="검토 완료"
          value={summary?.resolved_scraps ?? 0}
          icon="check-circle"
          tone="muted"
        />
      </div>

      {/* 필터 */}
      <div className="mb-4 flex items-center gap-3">
        <Eyebrow>필터</Eyebrow>
        <Segmented<FilterMode>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "pending", label: "검토 대기" },
            { value: "resolved", label: "검토 완료" },
            { value: "all", label: "전체" },
          ]}
        />
        <span className="text-caption text-muted ml-auto">
          총 {items.length} 건
        </span>
      </div>

      {loading ? (
        <Card className="p-6 text-center text-muted">불러오는 중…</Card>
      ) : items.length === 0 ? (
        <Card className="p-6 text-center text-muted">
          {filter === "pending"
            ? "검토 대기 중인 스크랩이 없습니다."
            : filter === "resolved"
              ? "아직 검토 완료된 스크랩이 없습니다."
              : "스크랩된 항목이 없습니다."}
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((it) => (
            <ScrapItemCard
              key={it.feedback.id}
              item={it}
              onResolve={() => handleResolve(it.feedback.id)}
              onUnresolve={() => handleUnresolve(it.feedback.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// Sub-components
// ============================================================================

interface SummaryCardProps {
  label: string;
  value: number;
  icon: string;
  tone: "ok" | "warn" | "accent" | "muted";
}

const SummaryCard = ({ label, value, icon, tone }: SummaryCardProps) => {
  const toneClass =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warnInk"
        : tone === "accent"
          ? "text-accent"
          : "text-muted";
  return (
    <Card pad={14}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon name={icon} size={16} className={toneClass} />
        <Eyebrow>{label}</Eyebrow>
      </div>
      <div className={`text-display font-bold ${toneClass}`}>{value}</div>
    </Card>
  );
};

interface ScrapItemCardProps {
  item: ScrappedOcrItem;
  onResolve: () => void;
  onUnresolve: () => void;
}

const ScrapItemCard = ({ item, onResolve, onUnresolve }: ScrapItemCardProps) => {
  const f = item.feedback;
  const [expanded, setExpanded] = useState(false);
  const createdAt = useMemo(() => formatDateTime(f.created_at), [f.created_at]);
  const resolvedAt = useMemo(
    () => (f.resolved_at ? formatDateTime(f.resolved_at) : null),
    [f.resolved_at],
  );

  return (
    <Card
      pad={16}
      className={`border ${f.resolved ? "border-line bg-surface2" : "border-warn/40 bg-warn-soft/20"}`}
    >
      {/* 헤더 */}
      <div className="flex items-start gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-caption font-mono font-bold text-ink bg-surface2 px-2 py-0.5 rounded-r1">
              #{item.problem_number ?? "?"}
            </span>
            {item.test_title && (
              <span className="text-small font-semibold text-text truncate">
                {item.test_title}
              </span>
            )}
            {item.test_grade && (
              <Chip size="sm" tone="soft">
                {gradeLabel(item.test_grade)}
              </Chip>
            )}
            {item.page_num != null && (
              <Chip size="sm" tone="soft">
                pg {item.page_num}
              </Chip>
            )}
            {f.resolved && (
              <Chip size="sm" tone="ok">
                <Icon name="check" size={11} className="inline-block mr-0.5" />
                검토 완료
              </Chip>
            )}
          </div>

          {/* 사유 chips */}
          {f.reason_codes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {f.reason_codes.map((code: OcrFeedbackReasonCode) => (
                <Chip key={code} size="sm" tone="warn">
                  {OCR_FEEDBACK_REASON_LABELS[code] ?? code}
                </Chip>
              ))}
            </div>
          )}

          {/* 자유 입력 */}
          {f.reason_text && (
            <div className="mt-2 px-3 py-2 rounded-r2 bg-surface border border-line text-small text-text">
              <Icon name="quotes" size={12} className="inline-block mr-1 text-muted" />
              {f.reason_text}
            </div>
          )}

          {/* 메타 */}
          <div className="mt-2 text-caption text-muted flex flex-wrap gap-x-3 gap-y-1">
            <span>
              <Icon name="user" size={11} className="inline-block mr-1" />
              {item.reporter_name ?? item.reporter_email ?? "익명"}
            </span>
            <span>
              <Icon name="clock" size={11} className="inline-block mr-1" />
              {createdAt}
            </span>
            {f.resolved && resolvedAt && (
              <span>
                <Icon name="check-circle" size={11} className="inline-block mr-1" />
                완료 {resolvedAt}
              </span>
            )}
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Btn
            kind="ghost"
            size="sm"
            icon={expanded ? "caret-up" : "caret-down"}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "접기" : "본문 보기"}
          </Btn>
          {f.resolved ? (
            <Btn
              kind="ghost"
              size="sm"
              icon="arrow-counter-clockwise"
              onClick={onUnresolve}
            >
              되돌리기
            </Btn>
          ) : (
            <Btn kind="accent" size="sm" icon="check" onClick={onResolve}>
              검토 완료
            </Btn>
          )}
        </div>
      </div>

      {/* 본문 (접힘) */}
      {expanded && item.problem_text && (
        <div className="mt-3 pt-3 border-t border-line">
          <Eyebrow>OCR 본문</Eyebrow>
          <div className="mt-2 px-3 py-2 rounded-r2 bg-surface border border-line max-h-[400px] overflow-y-auto">
            <MarkdownRenderer content={item.problem_text} />
            {item.problem_choices && item.problem_choices.length > 0 && (
              <div className="mt-2 pt-2 border-t border-line">
                <Eyebrow>보기</Eyebrow>
                <ul className="mt-1 text-small text-text">
                  {item.problem_choices.map((c, i) => (
                    <li key={i}>
                      {String.fromCharCode(0x2460 + i)} {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {item.problem_answer && (
              <div className="mt-2 pt-2 border-t border-line">
                <Eyebrow>정답</Eyebrow>
                <div className="mt-1 text-small font-semibold text-text">
                  {item.problem_answer}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

// ============================================================================
// Utility helpers
// ============================================================================

const formatDateTime = (iso: string): string => {
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return iso;
  }
};

const pad = (n: number): string => n.toString().padStart(2, "0");

const gradeLabel = (grade: string): string => {
  const map: Record<string, string> = {
    middle1: "중1",
    middle2: "중2",
    middle3: "중3",
    high1: "고1",
    high2_calc1: "고2 미적1",
    high2_stat: "고2 확통",
    high3_calc2: "고3 미적2",
  };
  return map[grade] ?? grade;
};
