import { useState } from "react";
import { Btn, Chip, Eyebrow, Icon } from "@app/components/ui";
import type { TestPaper, TopicSlice } from "@app/types";
import { formatVariantLabel } from "@app/lib/conversionLabels";

/** 변형 이력 기본 노출 개수 — 그 이상은 "더보기" 로 펼침 (사용자 결정 2026-06-04). */
const VARIANT_PREVIEW_COUNT = 5;

/**
 * 변형 이력 섹션 노출 플래그 (사용자 결정 2026-06-04, 옵션 A — 지금은 숨김).
 *
 * 현재 비활성 사유: ① 카드가 non-actionable (클릭해도 과거 변형 열기/재출력/비교
 * 불가, 읽기 전용) ② digitize(원본 유지)도 "변형"으로 기록돼 노이즈 ③ 변형 출력
 * 자체가 "준비 중"(PrintOptionsPanel) 이라 추적 실익 적음.
 *
 * 변형 기능 본격 출시 시 *actionable 하게 재설계* 하며 true 로 (옵션 C). 데이터
 * (variant_history / loadVariantHistory) 는 그대로 쌓이므로 플래그만 켜면 복구.
 */
const VARIANT_HISTORY_ENABLED = false;

export interface DetailMetaSidebarProps {
  test: TestPaper;
  /** *변형 만들기* — Step 3 (옵션) 강제 진입. 새 옵션으로 변형 다시 생성. */
  onMakeVariant: () => void;
  /** *이어서 작업* — 미완료 단계 자동 결정 (decideResumeStep). 끊긴 작업 재개. */
  onResume: () => void;
  /** 재개될 단계 라벨 (예: "옵션 (5/7단계)") — 사용자가 어느 단계로 가는지 미리 안내. */
  resumeStepLabel?: string;
  onShare?: () => void;
  onPdf?: () => void;
  resuming?: boolean;
  loading?: boolean;
}

interface InfoRow {
  key: string;
  value: string;
  icon: string;
}

const buildInfo = (test: TestPaper): InfoRow[] => [
  { key: "과목", value: test.subject, icon: "function" },
  { key: "문항", value: `${test.problemCount}개`, icon: "list-numbers" },
  { key: "업로드", value: test.time, icon: "calendar" },
  { key: "변환 방식", value: "OCR + 유사", icon: "magic-wand" },
  { key: "제작자", value: "—", icon: "user" },
];

const accuracyColor = (accuracy?: number): string => {
  if (accuracy === undefined) return "#0EA5E9"; // accent
  if (accuracy >= 80) return "#10B981"; // ok
  if (accuracy >= 60) return "#0EA5E9"; // accent
  return "#F59E0B"; // warn
};

const TopicBar = ({ slice }: { slice: TopicSlice }) => {
  const pct = Math.min(100, Math.max(0, slice.accuracy ?? 0));
  return (
    <div>
      <div className="flex justify-between mb-1 gap-2 text-small">
        <span className="text-text whitespace-nowrap flex-1 min-w-0 truncate">{slice.topic}</span>
        <span className="text-muted font-mono whitespace-nowrap flex-shrink-0">
          {slice.count}
          {slice.accuracy !== undefined ? ` · ${slice.accuracy}%` : ""}
        </span>
      </div>
      <div className="bg-surface2 overflow-hidden" style={{ height: 4, borderRadius: 2 }}>
        <div
          className="h-full transition-[width] duration-[600ms] ease-spring"
          style={{ width: `${pct}%`, background: accuracyColor(slice.accuracy), borderRadius: 2 }}
        />
      </div>
    </div>
  );
};

/**
 * Detail right sidebar — *액션* + info rows, topic distribution bars, variant
 * history cards. 각 블록은 `Eyebrow` 로 목적 라벨.
 *
 * 사용자 보고 (2026-05-26): TopBar 의 공유/PDF/이어서작업 + 하단 CTA 변형
 * 만들기 가 *제각각 위치* — 한 곳에 모으도록 우측 sidebar 최상단에 *액션*
 * 섹션 신설. TopBar 와 하단 CtaBanner 는 비움.
 */
export const DetailMetaSidebar = ({
  test,
  onMakeVariant,
  onResume,
  resumeStepLabel,
  onShare,
  onPdf,
  resuming,
  loading,
}: DetailMetaSidebarProps) => {
  const info = buildInfo(test);
  const [collapsed, setCollapsed] = useState(false);
  const [showAllVariants, setShowAllVariants] = useState(false);

  // ── 접힌 상태 — 액션 아이콘 버튼만 (변형/이어서/공유/PDF) + 펼치기 토글 ──
  if (collapsed) {
    return (
      <aside className="w-[56px] flex-shrink-0 py-4 border-l border-line bg-surface flex flex-col items-center gap-2.5">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="사이드바 펼치기"
          aria-label="사이드바 펼치기"
          className="w-9 h-9 rounded-r2 grid place-items-center text-muted hover:text-text hover:bg-hover transition-colors"
        >
          <Icon name="caret-left" size={16} />
        </button>
        <div className="w-7 h-px bg-line my-0.5" />
        <button
          type="button"
          onClick={onMakeVariant}
          disabled={resuming || loading}
          title="변형 만들기"
          aria-label="변형 만들기"
          className="w-9 h-9 rounded-r2 grid place-items-center bg-accent text-white hover:bg-accent-strong transition-colors disabled:opacity-50"
        >
          <Icon name="sparkle" size={16} weight="fill" />
        </button>
        <button
          type="button"
          onClick={onResume}
          disabled={resuming || loading}
          title="이어서 작업"
          aria-label="이어서 작업"
          className="w-9 h-9 rounded-r2 grid place-items-center bg-surface2 text-text hover:bg-hover transition-colors disabled:opacity-50"
        >
          <Icon name="play" size={15} />
        </button>
        <button
          type="button"
          onClick={onShare}
          disabled={!onShare || loading}
          title="공유"
          aria-label="공유"
          className="w-9 h-9 rounded-r2 grid place-items-center text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-40"
        >
          <Icon name="share-network" size={15} />
        </button>
        <button
          type="button"
          onClick={onPdf}
          disabled={!onPdf || loading}
          title="PDF"
          aria-label="PDF"
          className="w-9 h-9 rounded-r2 grid place-items-center text-muted hover:text-text hover:bg-hover transition-colors disabled:opacity-40"
        >
          <Icon name="download-simple" size={15} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-[296px] flex-shrink-0 px-5 py-6 border-l border-line bg-surface overflow-auto">
      {/* ── 액션 (최상단) — 우측에 접기 토글 ──────────────────────────── */}
      <div className="flex items-center justify-between mb-3">
        <Eyebrow>액션</Eyebrow>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          title="사이드바 접기"
          aria-label="사이드바 접기"
          className="w-6 h-6 rounded-r1 grid place-items-center text-muted hover:text-text hover:bg-hover transition-colors"
        >
          <Icon name="caret-right" size={14} />
        </button>
      </div>
      <div className="flex flex-col gap-2 mb-7">
        {/* 변형 만들기 — Step 3 (옵션) 강제 진입. 새 옵션으로 변형 다시 생성. */}
        <div>
          <Btn
            kind="accent"
            icon="sparkle"
            iconRight="arrow-right"
            full
            onClick={onMakeVariant}
            disabled={resuming || loading}
            title="새 옵션으로 변형을 다시 만듭니다 — Step 3 (옵션) 부터 시작"
          >
            변형 만들기
          </Btn>
          <p className="mt-1 text-caption text-muted leading-tight">
            새 옵션으로 변형 시험지 생성 (옵션 → 검토)
          </p>
        </div>
        {/* 이어서 작업 — decideResumeStep 의 미완료 단계 자동 진입. */}
        <div>
          <Btn
            kind="secondary"
            icon="play"
            full
            onClick={onResume}
            disabled={resuming || loading}
            title={
              resumeStepLabel
                ? `${resumeStepLabel}부터 재개`
                : "끊긴 작업의 미완료 단계부터 재개"
            }
          >
            {resuming
              ? "불러오는 중…"
              : resumeStepLabel
                ? `이어서 작업 — ${resumeStepLabel}`
                : "이어서 작업"}
          </Btn>
          <p className="mt-1 text-caption text-muted leading-tight">
            {resumeStepLabel
              ? `${resumeStepLabel}부터 재개합니다`
              : "끊긴 작업의 미완료 단계부터 재개"}
          </p>
        </div>
        <div className="flex gap-2">
          <Btn
            kind="ghost"
            icon="share-network"
            full
            size="sm"
            onClick={onShare}
            disabled={!onShare || loading}
          >
            공유
          </Btn>
          <Btn
            kind="ghost"
            icon="download-simple"
            full
            size="sm"
            onClick={onPdf}
            disabled={!onPdf || loading}
          >
            PDF
          </Btn>
        </div>
      </div>

      <Eyebrow className="mb-3">정보</Eyebrow>
      <div className="flex flex-col gap-2.5 mb-7">
        {info.map((row) => (
          <div key={row.key} className="flex justify-between items-center gap-2 text-small">
            <span className="text-muted flex items-center gap-1.5 whitespace-nowrap">
              <Icon name={row.icon} size={13} />
              {row.key}
            </span>
            <span className="text-text font-[550] whitespace-nowrap overflow-hidden text-ellipsis">
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {test.topicDistribution.length > 0 && (
        <>
          <Eyebrow className="mb-3">단원별 분포</Eyebrow>
          <div className="flex flex-col gap-3 mb-7">
            {test.topicDistribution.map((t) => (
              <TopicBar key={t.topic} slice={t} />
            ))}
          </div>
        </>
      )}

      {/* 변형 이력 — 옵션 A (지금은 숨김). VARIANT_HISTORY_ENABLED 플래그 참고.
          최근 N개 + 더보기 로직은 actionable 재설계(옵션 C) 전까지 보존. */}
      {VARIANT_HISTORY_ENABLED && (
        <>
          <Eyebrow className="mb-3">
            변형 이력
            {test.variants.length > 0 && (
              <span className="ml-1.5 text-caption text-muted font-normal">
                {test.variants.length}
              </span>
            )}
          </Eyebrow>
          {test.variants.length === 0 ? (
            <div className="text-small text-muted">아직 생성된 변형이 없습니다.</div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {(showAllVariants
                ? test.variants
                : test.variants.slice(0, VARIANT_PREVIEW_COUNT)
              ).map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-r2 bg-surface2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-small font-semibold text-text truncate">
                      {formatVariantLabel(v.label) ?? `ver.${v.id} · ${v.count}개`}
                    </div>
                    <div className="text-caption text-muted truncate">{v.createdAt}</div>
                  </div>
                  <Chip tone="ok" size="sm" dot>
                    완료
                  </Chip>
                </div>
              ))}
              {/* 최근 VARIANT_PREVIEW_COUNT 개만 기본 노출 + 더보기/접기. */}
              {test.variants.length > VARIANT_PREVIEW_COUNT && (
                <button
                  type="button"
                  onClick={() => setShowAllVariants((s) => !s)}
                  className="mt-1 self-start inline-flex items-center gap-1 text-caption text-accent hover:underline"
                >
                  <Icon name={showAllVariants ? "caret-up" : "caret-down"} size={11} />
                  {showAllVariants
                    ? "접기"
                    : `더보기 (${test.variants.length - VARIANT_PREVIEW_COUNT}개 더)`}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </aside>
  );
};

export default DetailMetaSidebar;
