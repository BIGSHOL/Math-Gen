import { useEffect, useState } from "react";
import { Btn, Card, Chip, Icon } from "@app/components/ui";
import MarkdownRenderer from "@app/components/math/MarkdownRenderer";
import { useWizardStore, type OCRProblem } from "@app/stores/wizardStore";
import { cn } from "@app/lib/tailwind";

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
   */
  onRegenerate: () => void;
}

const ModelBadge = ({ model }: { model: string }) => (
  <span className="text-caption text-muted font-mono">{model}</span>
);

export const SolutionItem = ({ pageId, item, onRegenerate }: SolutionItemProps) => {
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
  if (item.solutionGenerating) {
    return (
      <Card pad={14} className="border-line">
        <div className="flex items-center gap-2 mb-2">
          <span
            className="grid place-items-center bg-ink text-white rounded-r1 font-mono font-bold"
            style={{ width: 24, height: 24, fontSize: 11 }}
          >
            {item.number}
          </span>
          <Chip size="sm" tone="accent" dot>
            해설 생성 중
          </Chip>
        </div>
        <div className="flex items-center gap-2 text-muted text-small">
          <Icon name="circle-notch" weight="bold" className="animate-spin" />
          <span>잠시 기다려 주세요…</span>
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

  return (
    <Card pad={14}>
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <span
          className="grid place-items-center bg-ink text-white rounded-r1 font-mono font-bold"
          style={{ width: 24, height: 24, fontSize: 11 }}
        >
          {item.number}
        </span>
        <Chip size="sm" tone="ok" dot>
          해설 완료
        </Chip>
        {item.solutionModel && <ModelBadge model={item.solutionModel} />}
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
      </div>

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
    </Card>
  );
};

export default SolutionItem;
