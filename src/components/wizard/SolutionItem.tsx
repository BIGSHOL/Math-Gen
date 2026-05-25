import { useEffect, useState } from "react";
import { Btn, Card, Chip, Icon } from "@app/components/ui";
import MarkdownRenderer from "@app/components/math/MarkdownRenderer";
import { modelShortName } from "@app/lib/modelLabel";
import { useWizardStore, type OCRProblem } from "@app/stores/wizardStore";
import { cn } from "@app/lib/tailwind";
import { FeedbackBar } from "@app/components/feedback/FeedbackBar";

/**
 * 1 초 tick — `solutionStartedAt` 기준 경과 시간을 매 초 갱신. 카드가 *실제
 * 호출 in-flight* 일 때만 활성 — 대기 중이나 완료 후엔 정리.
 */
const useElapsedTick = (active: boolean): number => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return tick;
};

const formatElapsed = (startedAt: number | undefined): string => {
  if (!startedAt) return "";
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
};

/**
 * Step 3 — solution + answer card for a single OCR problem.
 *
 * Mirrors `OCRItem` two-mode pattern (read / edit). The "재생성" affordance
 * is wired to a parent-supplied callback rather than calling the AI layer
 * directly — `Step3SolutionReview` owns the `useSolutionGen` hook and uses
 * its `resetDispatch` helper so a single source of truth orchestrates
 * dispatch + abort + retry. (See the SolutionItemProps comments below.)
 *
 * Visual states:
 *   - `solutionGenerating` → spinner card ("해설 생성 중…").
 *   - `solutionError`      → warn banner + "재시도" button.
 *   - solution missing + no error + not generating → "대기 중" placeholder
 *     (this happens for items still queued behind pLimit).
 *   - solution present     → answer chip + body + edit button.
 */
export interface SolutionItemProps {
  pageId: string;
  item: OCRProblem;
  /**
   * Caller (Step3SolutionReview) clears the dispatched marker for this item
   * before flipping `solution`/`solutionError` to undefined — that lets
   * `useSolutionGen` pick the item back up on its next effect cycle.
   * Detail view 에선 readonly=true 라 사용 안 됨 — noop 으로 전달.
   */
  onRegenerate: () => void;
  /**
   * Phase C detail view 용. 편집 / 재생성 버튼 숨김 + 편집 모드 진입 차단.
   * in-flight / error 상태는 그대로 표시.
   */
  readonly?: boolean;
}

const ModelBadge = ({ model }: { model: string }) => (
  <span className="text-caption text-muted font-mono">{model}</span>
);

export const SolutionItem = ({ pageId, item, onRegenerate, readonly }: SolutionItemProps) => {
  const updateOCRItem = useWizardStore((s) => s.updateOCRItem);

  const [editing, setEditing] = useState(false);
  const [draftSolution, setDraftSolution] = useState(item.solution ?? "");
  const [draftAnswer, setDraftAnswer] = useState(item.answer ?? "");

  // Sync drafts when the store-side solution lands (initial generation,
  // regenerate). Without this the local draft would stay empty after the
  // first hook run.
  useEffect(() => {
    if (!editing) {
      setDraftSolution(item.solution ?? "");
      setDraftAnswer(item.answer ?? "");
    }
  }, [item.solution, item.answer, editing]);

  const startEdit = () => {
    setDraftSolution(item.solution ?? "");
    setDraftAnswer(item.answer ?? "");
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    updateOCRItem(pageId, item.id, {
      solution: draftSolution,
      answer: draftAnswer.trim(),
    });
    setEditing(false);
  };

  // ─── State branches ─────────────────────────────────────────────
  // solutionGenerating: true 는 dispatched 직후 즉시 set (큐 대기 포함).
  // solutionStartedAt 으로 실제 *진행* 인지 *큐 대기* 인지 구분 — useSolutionGen
  // 의 limit() async fn 첫 줄에서 startedAt 을 set 한다.
  const isInFlight = item.solutionGenerating && Boolean(item.solutionStartedAt);
  useElapsedTick(isInFlight);

  if (item.solutionGenerating) {
    const elapsed = formatElapsed(item.solutionStartedAt);
    return (
      <Card pad={14} className="border-line">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span
            className="grid place-items-center bg-ink text-white rounded-r1 font-mono font-bold"
            style={{ width: 24, height: 24, fontSize: 11 }}
          >
            {item.number}
          </span>
          {isInFlight ? (
            <>
              <Chip size="sm" tone="accent" dot>
                해설 생성 중
              </Chip>
              {item.solutionModel && (
                <span
                  className="text-caption text-muted font-mono"
                  title={item.solutionModel}
                >
                  {modelShortName(item.solutionModel)}
                </span>
              )}
              {elapsed && (
                <span className="text-caption font-mono text-accent">· {elapsed}</span>
              )}
            </>
          ) : (
            <Chip size="sm" tone="soft" icon="hourglass-medium">
              대기 중
            </Chip>
          )}
        </div>
        <div className="flex items-center gap-2 text-muted text-small">
          {isInFlight ? (
            <>
              <Icon name="circle-notch" weight="bold" className="animate-spin" />
              <span>Sonnet 호출 중 — 평균 3~5 초</span>
            </>
          ) : (
            <>
              <Icon name="hourglass-medium" weight="duotone" />
              <span>다른 문항 처리 완료 후 시작합니다 (큐 슬롯 대기)</span>
            </>
          )}
        </div>
      </Card>
    );
  }

  if (item.solutionError) {
    return (
      <Card pad={14} className="border-warn ring-1 ring-warn/10">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="grid place-items-center bg-ink text-white rounded-r1 font-mono font-bold"
            style={{ width: 24, height: 24, fontSize: 11 }}
          >
            {item.number}
          </span>
          <Chip size="sm" tone="warn" dot>
            생성 실패
          </Chip>
          <Btn
            kind="ghost"
            size="sm"
            icon="arrow-clockwise"
            className="ml-auto"
            onClick={() => {
              onRegenerate();
              updateOCRItem(pageId, item.id, {
                solution: undefined,
                solutionError: undefined,
              });
            }}
          >
            재시도
          </Btn>
        </div>
        <div className="text-small text-warnInk whitespace-pre-wrap">
          {item.solutionError}
        </div>
      </Card>
    );
  }

  if (!item.solution) {
    // Queued but not yet started — pLimit hasn't given it a slot.
    return (
      <Card pad={14} className="border-line opacity-70">
        <div className="flex items-center gap-2">
          <span
            className="grid place-items-center bg-muted text-white rounded-r1 font-mono font-bold"
            style={{ width: 24, height: 24, fontSize: 11 }}
          >
            {item.number}
          </span>
          <span className="text-small text-muted">대기 중…</span>
        </div>
      </Card>
    );
  }

  const hasWarnings = Boolean(item.solutionWarnings && item.solutionWarnings.length > 0);

  return (
    <Card pad={14} className={hasWarnings ? "border-warn ring-1 ring-warn/10" : undefined}>
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <span
          className="grid place-items-center bg-ink text-white rounded-r1 font-mono font-bold"
          style={{ width: 24, height: 24, fontSize: 11 }}
        >
          {item.number}
        </span>
        {hasWarnings ? (
          <Chip size="sm" tone="warn" dot>
            정확도 검증 실패 가능성
          </Chip>
        ) : (
          <Chip size="sm" tone="ok" dot>
            해설 완료
          </Chip>
        )}
        {item.solutionModel && <ModelBadge model={item.solutionModel} />}
        {!readonly && (
          <div className="ml-auto flex items-center gap-1">
            {editing ? (
              <>
                <Btn kind="ghost" size="sm" icon="x" onClick={cancelEdit}>
                  취소
                </Btn>
                <Btn kind="accent" size="sm" icon="check" onClick={saveEdit}>
                  저장
                </Btn>
              </>
            ) : (
              <>
                <Btn
                  kind="ghost"
                  size="sm"
                  icon="arrow-clockwise"
                  onClick={() => {
                    onRegenerate();
                    updateOCRItem(pageId, item.id, {
                      solution: undefined,
                      answer: undefined,
                      solutionError: undefined,
                    });
                  }}
                  aria-label="해설 재생성"
                />
                <Btn
                  kind="ghost"
                  size="sm"
                  icon="pencil-simple"
                  onClick={startEdit}
                  aria-label="해설 편집"
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* 정확도 검증 warning banner — solutionValidator 가 *명백한 오류 패턴*
          (예: "서로 다른 N 개" 조건 위반 튜플) 검출 시 노출. 답을 무효화하지
          않고 사용자에게 *재생성 권장* 신호만. false positive 위험 (풀이 안
          명시적 무효 처리) 도 있으니 사용자가 본문 확인 후 결정. */}
      {hasWarnings && (
        <div className="mb-3 p-3 rounded-r2 bg-warn-soft border border-warn/30">
          <div className="flex items-start gap-2">
            <Icon name="warning" size={14} weight="duotone" className="text-warn shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              {item.solutionWarnings!.map((w, wi) => (
                <details key={wi} className="text-small">
                  <summary className="cursor-pointer font-semibold text-warn-ink">
                    {w.summary}
                  </summary>
                  <p className="mt-1.5 text-warn-ink/80 leading-relaxed">{w.detail}</p>
                </details>
              ))}
              <p className="mt-2 text-caption text-muted">
                자동 검증 휴리스틱이므로 false positive 일 수 있습니다. 풀이 본문을
                확인하고 의심되면 재생성하세요.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Answer — highlighted strip just below the header.
          읽기 모드는 w-fit + max-w-full + flex-wrap 으로 content-fit
          (사용자 보고: 짧은 정답이 부모 100% 폭으로 늘어나서 어색). 편집 모드는
          input 이 들어가야 하므로 w-full 유지. flex (block-level) 로 두고
          width 만 fit-content / full 로 분기 — inline-flex 는 mb-3 적용이
          불안정. */}
      <div
        className={cn(
          "mb-3 px-3 py-2 rounded-r2 bg-accent-soft border border-accent/30 flex items-baseline gap-2 flex-wrap",
          editing ? "w-full" : "w-fit max-w-full",
        )}
      >
        <span className="text-caption text-muted font-semibold">정답</span>
        {editing ? (
          <input
            type="text"
            value={draftAnswer}
            onChange={(e) => setDraftAnswer(e.target.value)}
            placeholder='예: "③ 5" 또는 "5"'
            className="flex-1 h-7 px-2 rounded-r1 border border-line-strong bg-surface text-body font-mono focus:outline-none focus:border-accent focus:shadow-accent-glow"
            aria-label="정답"
          />
        ) : (
          <span className="text-[15px] font-semibold text-accent-ink flex items-baseline gap-1">
            {/* 객관식 마커 (①②③④⑤) 가 답 앞에 오면 큰 폰트로 분리 — 사용자
                보고: ①②③ 가 일반 본문 폰트로 그려져 작아 보임. */}
            {(() => {
              const raw = item.answer ?? "";
              const m = raw.match(/^([①②③④⑤])\s*(.*)$/s);
              if (m) {
                return (
                  <>
                    <span className="answer-marker">{m[1]}</span>
                    <MarkdownRenderer content={m[2]} inline />
                  </>
                );
              }
              return <MarkdownRenderer content={raw} inline />;
            })()}
          </span>
        )}
      </div>

      {editing ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <textarea
            value={draftSolution}
            onChange={(e) => setDraftSolution(e.target.value)}
            className="min-h-[180px] px-3 py-2 rounded-r2 border border-line-strong bg-surface text-body font-mono leading-relaxed resize-y focus:outline-none focus:border-accent focus:shadow-accent-glow"
            spellCheck={false}
            aria-label="해설 본문 (Markdown + LaTeX)"
          />
          <div className="min-h-[180px] px-3 py-2 rounded-r2 border border-line bg-surface2 overflow-auto">
            <MarkdownRenderer content={draftSolution} />
          </div>
        </div>
      ) : (
        <div className={cn("text-body text-text")}>
          <MarkdownRenderer content={item.solution} />
        </div>
      )}

      {/* Phase E — 피드백 UI. 완료된 해설에만 표시 (readonly 모드 또는 solution 존재). */}
      {item.solution && !editing && (
        <div className="mt-3 pt-3 border-t border-line">
          <FeedbackBar
            targetKind="solution"
            targetId={item.id}
            context={{
              model: item.solutionModel ?? null,
              topic: item.topic ?? null,
              number: item.number,
              text_snippet: (item.text ?? "").slice(0, 200),
            }}
          />
        </div>
      )}
    </Card>
  );
};

export default SolutionItem;
