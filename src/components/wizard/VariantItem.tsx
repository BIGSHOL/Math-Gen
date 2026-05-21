import { useEffect, useState } from "react";
import { Btn, Card, Chip, Icon } from "@app/components/ui";
import MarkdownRenderer from "@app/components/math/MarkdownRenderer";
import { modelShortName } from "@app/lib/modelLabel";
import { useWizardStore, type ProblemReview } from "@app/stores/wizardStore";
import { cn } from "@app/lib/tailwind";

/**
 * Step 4 — variant problem card.
 *
 * `SolutionItem` 의 5-state 패턴 차용:
 *   - `genError`     → warn 배너 + "재시도" 버튼
 *   - `generating`   → 스피너 ("변형 생성 중…")
 *   - `status="pending"` + variant === original → "대기 중" placeholder
 *   - `status="review"` → 변형 본문 + 정답 chip + "확정" 토글 + "재생성"
 *   - `status="confirmed"` → 같은 본문 + ok 배지 + 토글 해제 가능
 *
 * **diff highlight**: `original.answer` !== `variant.answer` 이면 "답 변경"
 * chip 표시. 답 구조 (객관식·주관식) 가 같은지도 검증 표시.
 *
 * **도형 미변형 chip**: 본 phase 는 도형 재생성 X — UI 에서 명시.
 * (caller 가 `hasDiagram` prop 으로 전달.)
 */
export interface VariantItemProps {
  problem: ProblemReview;
  /**
   * 원본이 도형 포함 문항인지 (OCRProblem.images.length > 0). caller 가
   * 페이지 OCR 결과에서 미리 판정해 전달. true 면 "도형 미변형" chip 노출.
   */
  hasDiagram?: boolean;
  /**
   * 재생성 클릭 시 호출. parent (Step4Review) 가 `useVariantGen.resetDispatch`
   * 호출 + `updateProblem({ variant: original, status: "pending", genError: undefined })`.
   */
  onRegenerate: () => void;
  /** 카드의 표시 번호 (시드 순서 기반). */
  index: number;
}

const ModelBadge = ({ model }: { model: string }) => (
  <span
    className="text-caption text-muted font-mono"
    title={`변형 생성 모델: ${model}`}
  >
    {modelShortName(model)}
  </span>
);

export const VariantItem = ({
  problem,
  hasDiagram,
  onRegenerate,
  index,
}: VariantItemProps) => {
  const updateProblem = useWizardStore((s) => s.updateProblem);

  const [editing, setEditing] = useState(false);
  const [draftQ, setDraftQ] = useState(problem.variant.question);
  const [draftA, setDraftA] = useState(problem.variant.answer);
  const [draftS, setDraftS] = useState(problem.variant.solution);

  useEffect(() => {
    if (!editing) {
      setDraftQ(problem.variant.question);
      setDraftA(problem.variant.answer);
      setDraftS(problem.variant.solution);
    }
  }, [problem.variant, editing]);

  const startEdit = () => {
    setDraftQ(problem.variant.question);
    setDraftA(problem.variant.answer);
    setDraftS(problem.variant.solution);
    setEditing(true);
  };
  const cancelEdit = () => setEditing(false);
  const saveEdit = () => {
    updateProblem(problem.id, {
      variant: {
        ...problem.variant,
        question: draftQ,
        answer: draftA,
        solution: draftS,
      },
    });
    setEditing(false);
  };

  const toggleConfirmed = () => {
    updateProblem(problem.id, {
      status: problem.status === "confirmed" ? "review" : "confirmed",
    });
  };

  const isVariantSameAsOriginal = problem.variant === problem.original;
  const answerChanged =
    problem.variant.answer && problem.variant.answer !== problem.original.answer;

  // ── State 1: 생성 실패 ────────────────────────────────────────────
  if (problem.genError) {
    return (
      <Card pad={14} className="border-warn border-l-4">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span
            className="grid place-items-center bg-warn text-white rounded-r1 font-mono font-bold"
            style={{ width: 24, height: 24, fontSize: 11 }}
          >
            {index}
          </span>
          <Chip size="sm" tone="warn" dot>
            변형 생성 실패
          </Chip>
          <Btn
            kind="ghost"
            size="sm"
            icon="arrow-clockwise"
            className="ml-auto"
            onClick={onRegenerate}
          >
            재시도
          </Btn>
        </div>
        <div className="text-small text-warn-ink whitespace-pre-wrap">
          {problem.genError}
        </div>
      </Card>
    );
  }

  // ── State 2: 생성 중 ────────────────────────────────────────────
  if (problem.generating) {
    return (
      <Card pad={14} className="border-line opacity-80">
        <div className="flex items-center gap-2">
          <span
            className="grid place-items-center bg-accent text-white rounded-r1 font-mono font-bold"
            style={{ width: 24, height: 24, fontSize: 11 }}
          >
            {index}
          </span>
          <Icon name="spinner-gap" size={14} className="animate-spin text-accent" />
          <span className="text-small text-muted">변형 생성 중…</span>
        </div>
      </Card>
    );
  }

  // ── State 3: 대기 중 (pending + 아직 dispatch 안 됨) ─────────────────
  if (problem.status === "pending" && isVariantSameAsOriginal) {
    return (
      <Card pad={14} className="border-line opacity-70">
        <div className="flex items-center gap-2">
          <span
            className="grid place-items-center bg-muted-soft text-text2 rounded-r1 font-mono font-bold"
            style={{ width: 24, height: 24, fontSize: 11 }}
          >
            {index}
          </span>
          <span className="text-small text-muted">대기 중…</span>
        </div>
      </Card>
    );
  }

  // ── State 4 / 5: review (생성 완료 + 미확정) 또는 confirmed ────────────
  return (
    <Card
      pad={14}
      className={cn(problem.status === "confirmed" && "border-ok border-l-4")}
    >
      <div className="flex items-center gap-2 mb-2.5 flex-wrap">
        <span
          className="grid place-items-center bg-ink text-white rounded-r1 font-mono font-bold"
          style={{ width: 24, height: 24, fontSize: 11 }}
        >
          {index}
        </span>
        {problem.status === "confirmed" ? (
          <Chip size="sm" tone="ok" dot>
            확정
          </Chip>
        ) : (
          <Chip size="sm" tone="accent" dot>
            검토 필요
          </Chip>
        )}
        {answerChanged && (
          <Chip size="sm" tone="warn">
            답 변경
          </Chip>
        )}
        {hasDiagram && (
          <span title="원본 도형 그대로 사용 (변형 X)">
            <Chip size="sm" tone="soft">
              도형 미변형
            </Chip>
          </span>
        )}
        {problem.genModel && <ModelBadge model={problem.genModel} />}
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
                kind={problem.status === "confirmed" ? "secondary" : "accent"}
                size="sm"
                icon={problem.status === "confirmed" ? "check-circle" : "check"}
                onClick={toggleConfirmed}
              >
                {problem.status === "confirmed" ? "확정 해제" : "확정"}
              </Btn>
              <Btn
                kind="ghost"
                size="sm"
                icon="arrow-clockwise"
                onClick={onRegenerate}
                aria-label="변형 재생성"
              />
              <Btn
                kind="ghost"
                size="sm"
                icon="pencil-simple"
                onClick={startEdit}
                aria-label="변형 편집"
              />
            </>
          )}
        </div>
      </div>

      {/* Answer strip */}
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
            value={draftA}
            onChange={(e) => setDraftA(e.target.value)}
            placeholder='예: "③ 5"'
            className="flex-1 h-7 px-2 rounded-r1 border border-line-strong bg-surface text-body font-mono focus:outline-none focus:border-accent focus:shadow-accent-glow"
            aria-label="정답"
          />
        ) : (
          <span className="text-[15px] font-semibold text-accent-ink">
            <MarkdownRenderer content={problem.variant.answer ?? ""} inline />
          </span>
        )}
      </div>

      {/* Question + (객관식이면) choices */}
      {editing ? (
        <textarea
          value={draftQ}
          onChange={(e) => setDraftQ(e.target.value)}
          className="w-full min-h-[120px] px-3 py-2 rounded-r2 border border-line-strong bg-surface text-body font-mono leading-relaxed resize-y focus:outline-none focus:border-accent focus:shadow-accent-glow"
          spellCheck={false}
          aria-label="변형 본문"
        />
      ) : (
        <div className="prose max-w-none">
          <MarkdownRenderer content={problem.variant.question} />
          {problem.variant.choices && problem.variant.choices.length > 0 && (
            <ul className="mt-2 space-y-1 list-none pl-0">
              {problem.variant.choices.map((c, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="text-text2 font-mono">
                    {"①②③④⑤"[i] ?? `(${i + 1})`}
                  </span>
                  <span className="flex-1">
                    <MarkdownRenderer content={c} inline />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Solution (collapsible later — for now always show) */}
      {!editing && problem.variant.solution && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-small text-muted hover:text-text font-medium select-none">
            풀이 보기
          </summary>
          <div className="mt-2 prose max-w-none border-l-2 border-line pl-3">
            <MarkdownRenderer content={problem.variant.solution} />
          </div>
        </details>
      )}
      {editing && (
        <textarea
          value={draftS}
          onChange={(e) => setDraftS(e.target.value)}
          className="mt-3 w-full min-h-[180px] px-3 py-2 rounded-r2 border border-line-strong bg-surface text-body font-mono leading-relaxed resize-y focus:outline-none focus:border-accent focus:shadow-accent-glow"
          spellCheck={false}
          aria-label="변형 풀이"
        />
      )}
    </Card>
  );
};

export default VariantItem;
