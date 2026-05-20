import { useState } from "react";
import {
  Btn,
  Card,
  Chip,
  Eyebrow,
  Icon,
  Segmented,
  Toggle,
} from "@app/components/ui";
import MarkdownRenderer from "@app/components/math/MarkdownRenderer";
import { cn } from "@app/lib/tailwind";
import { useAppStore } from "@app/stores/appStore";
import { useLibraryStore } from "@app/stores/libraryStore";

type Intensity = 0 | 1 | 2;
type Difficulty = "easier" | "same" | "harder";

interface OptionsState {
  shuffleProblems: boolean;
  shuffleChoices: boolean;
  withSolutions: boolean;
  redistPoints: boolean;
}

const INTENSITIES: { id: Intensity; title: string; description: string; icon: string }[] = [
  { id: 0, title: "숫자만 바꾸기", description: "거의 동일", icon: "hash" },
  { id: 1, title: "같은 유형 · 다른 문제", description: "변형 중", icon: "shuffle" },
  { id: 2, title: "새 문제", description: "개념만 유지", icon: "magic-wand" },
];

const COUNT_PRESETS = [1, 2, 3, 5] as const;

const OPTION_ROWS: { key: keyof OptionsState; title: string; hint: string }[] = [
  { key: "shuffleProblems", title: "문항 순서 섞기", hint: "각 시험지마다 문제 순서 랜덤" },
  { key: "shuffleChoices", title: "보기 순서 섞기", hint: "선택지 5개 순서 셔플" },
  { key: "withSolutions", title: "풀이 · 해설 함께 생성", hint: "정답지 · 해설지 동시 출력" },
  { key: "redistPoints", title: "배점 자동 재분배", hint: "난이도에 따라 점수 조정" },
];

const REMAINING_CREDITS = 1240;
const FALLBACK_PROBLEM_COUNT = 30;

/**
 * "변형 시험지 만들기" modal — opened from Detail's CTA and the top-right
 * "변형 만들기" button. Mirrors hifi/modal.jsx.
 *
 * Local-only state — nothing persisted. On "Wizard로 진행" we close the
 * modal, wait 100ms for the exit animation, then push the user into the
 * wizard with the selected test id. Phase 4 will pick up the wizard.
 *
 * Why we don't render real preview problems yet: the IndexedDB-backed
 * problems aren't populated until the Phase 4 OCR step. The 3 preview
 * cards are visual mocks that stand in for the "시험지 A / B / C" frame.
 */
export const NewVariantModal = ({ onClose }: { onClose: () => void }) => {
  const selectedTestId = useAppStore((s) => s.selectedTestId);
  const startWizard = useAppStore((s) => s.startWizard);
  const getTest = useLibraryStore((s) => s.getTest);

  const test = selectedTestId ? getTest(selectedTestId) : undefined;
  const problemCount = test?.problemCount ?? FALLBACK_PROBLEM_COUNT;

  const [intensity, setIntensity] = useState<Intensity>(1);
  const [difficulty, setDifficulty] = useState<Difficulty>("same");
  const [count, setCount] = useState<number>(3);
  const [opts, setOpts] = useState<OptionsState>({
    shuffleProblems: true,
    shuffleChoices: true,
    withSolutions: true,
    redistPoints: false,
  });

  const creditsNeeded = count * problemCount;
  const previewCount = Math.min(count, 3);

  const proceedToWizard = () => {
    onClose();
    // 100ms delay so the modal exit animation finishes before the wizard
    // enter animation begins — prevents a visual collision.
    setTimeout(() => {
      startWizard(selectedTestId ?? "");
    }, 100);
  };

  return (
    <div
      className="flex flex-col"
      style={{ width: 980, maxWidth: "94vw", height: 660, maxHeight: "90vh" }}
    >
      {/* Header */}
      <div className="px-[22px] py-4 border-b border-line flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div
            className="grid place-items-center text-white shadow-s2 rounded-r2"
            style={{
              width: 32,
              height: 32,
              background: "linear-gradient(135deg, #0EA5E9, #075985)",
            }}
          >
            <Icon name="sparkle" size={16} weight="fill" color="white" />
          </div>
          <div>
            <div id="new-variant-title" className="text-h2 text-text">
              변형 시험지 만들기
            </div>
            <div className="text-small text-muted mt-px">
              원본 1개 → 변형 {count}개 일괄 생성
            </div>
          </div>
        </div>
        <Btn kind="ghost" size="sm" icon="x" onClick={onClose} aria-label="모달 닫기" />
      </div>

      {/* Body */}
      <div
        className="flex-1 grid overflow-hidden"
        style={{ gridTemplateColumns: "1fr 1.3fr" }}
      >
        {/* Left column */}
        <div className="p-[22px] border-r border-line overflow-auto">
          <Eyebrow className="mb-2.5">① 원본 선택</Eyebrow>
          <Card pad={12} className="flex gap-3 mb-2.5">
            <div className="w-[52px] h-16 bg-surface2 rounded-r1 grid place-items-center border border-line flex-shrink-0">
              <Icon name="file-pdf" size={22} weight="duotone" color="#0EA5E9" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-h3 text-text truncate">
                {test?.title ?? "2024 6월 모의평가"}
              </div>
              <div className="text-small text-muted mt-0.5">
                {problemCount}문항 · {test?.subject ?? "공통+미적분"}
              </div>
              <div className="mt-1.5 flex gap-1 flex-wrap">
                {(test?.tags ?? ["고3"]).slice(0, 3).map((t) => (
                  <Chip key={t} size="sm">
                    {t}
                  </Chip>
                ))}
              </div>
            </div>
          </Card>
          <Btn kind="ghost" size="sm" full icon="arrows-left-right" disabled>
            다른 시험지 선택
          </Btn>

          <Eyebrow className="mt-6 mb-2.5">② 변형 강도</Eyebrow>
          <div
            className="flex flex-col gap-1.5"
            role="radiogroup"
            aria-label="변형 강도"
          >
            {INTENSITIES.map((o) => {
              const on = o.id === intensity;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setIntensity(o.id)}
                  className={cn(
                    "p-3 rounded-r2 flex items-center gap-3 cursor-pointer border text-left w-full",
                    "transition-all duration-[140ms] ease-out",
                    "focus-visible:outline-none focus-visible:shadow-accent-glow",
                    on
                      ? "border-accent bg-accent-soft shadow-accent-glow"
                      : "border-line bg-surface hover:border-line-strong",
                  )}
                >
                  <div
                    className={cn(
                      "w-8 h-8 rounded-r1 grid place-items-center",
                      on ? "bg-white text-accent" : "bg-surface2 text-muted",
                    )}
                  >
                    <Icon name={o.icon} size={16} weight={on ? "fill" : "regular"} />
                  </div>
                  <div className="flex-1">
                    <div className="text-body text-text font-[550]">{o.title}</div>
                    <div className="text-caption text-muted mt-px">{o.description}</div>
                  </div>
                  <div
                    className={cn(
                      "rounded-full transition-all duration-[140ms]",
                      on ? "shadow-[inset_0_0_0_3px_#0EA5E9] bg-white" : "bg-transparent",
                    )}
                    style={{
                      width: 16,
                      height: 16,
                      border: `2px solid ${on ? "#0EA5E9" : "#D9DCE0"}`,
                    }}
                  />
                </button>
              );
            })}
          </div>

          <Eyebrow className="mt-6 mb-2.5">③ 난이도 조정</Eyebrow>
          <Segmented<Difficulty>
            value={difficulty}
            onChange={setDifficulty}
            full
            options={[
              { value: "easier", label: "쉽게" },
              { value: "same", label: "유지" },
              { value: "harder", label: "어렵게" },
            ]}
          />
        </div>

        {/* Right column */}
        <div className="p-[22px] overflow-auto bg-bg">
          <Eyebrow className="mb-2.5">④ 생성할 시험지 수</Eyebrow>
          <div className="flex gap-2 mb-6">
            {COUNT_PRESETS.map((n) => {
              const on = n === count;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  className={cn(
                    "rounded-r2 grid place-items-center font-mono font-bold cursor-pointer transition-all duration-[140ms]",
                    "focus-visible:outline-none focus-visible:shadow-accent-glow",
                    on
                      ? "bg-accent text-white border-accent shadow-s2"
                      : "bg-white text-text border-line-strong shadow-s1 hover:border-accent",
                  )}
                  style={{ width: 60, height: 60, fontSize: 22, borderWidth: 1 }}
                >
                  {n}
                </button>
              );
            })}
            <div
              className="px-3.5 rounded-r2 bg-white border-dashed border grid place-items-center text-small text-muted"
              style={{ height: 60, borderColor: "#D9DCE0", borderWidth: 1 }}
            >
              직접 입력
            </div>
          </div>

          <Eyebrow className="mb-2.5">⑤ 미리보기 (시험지 A · 1번 문항)</Eyebrow>
          <div
            className="grid gap-2.5 mb-4"
            style={{ gridTemplateColumns: `repeat(${previewCount}, 1fr)` }}
          >
            {Array.from({ length: previewCount }).map((_, i) => {
              // Mock variant — `i` is the variant index (A=0, B=1, C=2).
              // Use real LaTeX so MarkdownRenderer/KaTeX renders these the
              // same way they'll appear in the final exported test paper.
              const a = 2 + i;
              const b = i + 3;
              const questionMd = `두 다항식의 합 $A = ${a}x^{2} + ${b}x$를 구하시오.`;
              return (
                <div
                  key={i}
                  className={cn(
                    "bg-white rounded-r2 p-3",
                    i === 0
                      ? "border-[1.5px] border-accent shadow-s2"
                      : "border-[1.5px] border-line shadow-s1",
                  )}
                >
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-micro uppercase text-muted">
                      시험지 {String.fromCharCode(65 + i)}
                    </span>
                    {i === 0 && (
                      <Chip tone="accent" size="sm" dot>
                        현재
                      </Chip>
                    )}
                  </div>
                  <MarkdownRenderer
                    content={questionMd}
                    className="text-[11px] leading-[1.55] text-text2 [&_.katex]:text-[12px] [&_p]:!my-0"
                  />
                  <div className="flex flex-col gap-1 mt-2">
                    {[1, 2, 3].map((k) => {
                      const coeffA = k * (i + 1);
                      const coeffB = k + i;
                      const choiceMd = `$${coeffA}x^{2} + ${coeffB}x$`;
                      return (
                        <div
                          key={k}
                          className="flex gap-1.5 items-center text-[10px] text-text2"
                        >
                          <span className="w-[11px] h-[11px] text-[7px] font-mono text-muted rounded-full border border-line grid place-items-center flex-shrink-0">
                            {k}
                          </span>
                          <MarkdownRenderer
                            inline
                            content={choiceMd}
                            className="[&_.katex]:text-[11px]"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <Card pad={16} className="bg-white">
            <Eyebrow className="mb-2.5">⑥ 옵션</Eyebrow>
            <div className="flex flex-col gap-2">
              {OPTION_ROWS.map((row) => (
                <Toggle
                  key={row.key}
                  value={opts[row.key]}
                  onChange={(v) => setOpts((prev) => ({ ...prev, [row.key]: v }))}
                  label={row.title}
                  hint={row.hint}
                />
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <div className="px-[22px] py-3.5 border-t border-line flex justify-between items-center">
        <div className="flex items-center gap-2 text-small text-text2">
          <Icon name="lightning" size={14} weight="fill" color="#0EA5E9" />
          <span>
            {count} × {problemCount} ={" "}
            <span className="font-bold text-text font-mono">크레딧 {creditsNeeded}</span> 사용 / 잔여 {REMAINING_CREDITS.toLocaleString()}
          </span>
        </div>
        <div className="flex gap-2">
          <Btn kind="ghost" onClick={onClose}>
            취소
          </Btn>
          <Btn kind="accent" iconRight="arrow-right" onClick={proceedToWizard}>
            Wizard로 진행
          </Btn>
        </div>
      </div>
    </div>
  );
};

export default NewVariantModal;
