import { useMemo } from "react";
import {
  Card,
  Chip,
  Eyebrow,
  Heading,
  Icon,
  Segmented,
  Toggle,
} from "@app/components/ui";
import MarkdownRenderer from "@app/components/math/MarkdownRenderer";
import { cn } from "@app/lib/tailwind";
import {
  useWizardStore,
  type ConversionGoal,
  type DifficultyShift,
  type WizardState,
} from "@app/stores/wizardStore";

/**
 * Wizard Step 3 — pick the global conversion options that apply across
 * all 30+ problems before per-item review in Step 4.
 *
 * Per plan section 4.3:
 *  - Static-mock preview on the right (no API call). Real per-item
 *    variant generation lives in Step 4.
 *  - "다음" button is always active (defaults are already meaningful).
 *  - 4-row 예상 결과 card included — gives the user a quick sense of
 *    the cost/time before they kick off the heavier Step 4 work.
 *
 * State surface: only reads/writes wizardStore — no local UI state.
 * Setting any option immediately persists via the store's sessionStorage
 * middleware so a refresh restores the user's choices.
 */

interface GoalSpec {
  id: ConversionGoal;
  title: string;
  desc: string;
  icon: string;
}

const GOALS: GoalSpec[] = [
  { id: "digitize", title: "디지털화만", desc: "텍스트·수식으로 변환", icon: "text-aa" },
  { id: "similar", title: "유사 문제 생성", desc: "같은 개념·다른 문제", icon: "approximately-equals" },
  { id: "variant", title: "변형 시험지", desc: "난이도·유형 미세 조정", icon: "sparkle" },
  { id: "targeted", title: "맞춤 보충", desc: "단원별 약점 강화", icon: "target" },
];

const DIFFICULTY_OPTIONS: { value: DifficultyShift; label: string; icon: string }[] = [
  { value: "easier", label: "쉽게", icon: "arrow-down" },
  { value: "same", label: "원본 유지", icon: "equals" },
  { value: "harder", label: "어렵게", icon: "arrow-up" },
];

interface ExtraSpec {
  id: keyof WizardState["extras"];
  title: string;
  hint: string;
  icon: string;
}

const EXTRAS: ExtraSpec[] = [
  { id: "solutions", title: "풀이·해설지", hint: "각 문제별 단계별 풀이", icon: "book-open" },
  { id: "answers", title: "정답지 (분리 PDF)", hint: "객관식 + 주관식 답", icon: "list-checks" },
  { id: "oapNote", title: "오답노트 템플릿", hint: "학생용 빈 양식", icon: "notebook" },
  { id: "stats", title: "단원·유형 통계", hint: "엑셀 + 차트", icon: "chart-bar" },
];

/**
 * Compose the "변환 예상" markdown sample. Two knobs drive the visual:
 *  - `goal === "digitize"` → mirror the original (we're not transforming).
 *  - difficulty: shifts the leading coefficient (easier −1, harder +2)
 *    while goal { similar | variant | targeted } adds +1 baseline shift.
 *
 * Purely cosmetic — the math doesn't need to be correct. The point is
 * for the user to *see* their options taking effect.
 */
const buildVariantSample = (goal: ConversionGoal, difficulty: DifficultyShift): string => {
  if (goal === "digitize") return ORIGINAL_SAMPLE;

  const baseShift = 1; // similar / variant / targeted all bump coefficients by 1
  const diffShift = difficulty === "easier" ? -1 : difficulty === "harder" ? 2 : 0;
  const s = baseShift + diffShift;

  const a1 = 2 + s; // A leading coeff
  const a2 = 3 + s; // A x coeff
  const b1 = 1 + s; // B leading coeff
  const b2 = 2 + s; // B x coeff (was −2 in original — flipped for variety)
  const c0 = a1 + b1; // combined leading
  const c1 = a2 + b2; // combined x

  return [
    "두 다항식",
    "",
    `$$A = ${a1}x^{2} + ${a2}x - 1,\\quad B = ${b1}x^{2} + ${b2}x + 5$$`,
    "",
    "에 대하여 $A + B$의 값을 구한 식으로 옳은 것은?",
    "",
    "> <보기>",
    `> ① $${c0}x^{2} + ${c1}x + 4$`,
    `> ② $${c0}x^{2} + ${c1}x + 6$`,
    `> ③ $${c0}x^{2} + ${c1}x + 5$`,
    `> ④ $${c0 + 1}x^{2} + ${c1}x + 4$`,
    `> ⑤ $${c0}x^{2} + ${c1 + 1}x + 4$`,
  ].join("\n");
};

const ORIGINAL_SAMPLE = [
  "두 다항식",
  "",
  "$$A = 2x^{2} + 3x - 1,\\quad B = x^{2} - 2x + 5$$",
  "",
  "에 대하여 $A + B$의 값을 구한 식으로 옳은 것은?",
  "",
  "> <보기>",
  "> ① $3x^{2} + x + 4$",
  "> ② $3x^{2} + x + 6$",
  "> ③ $3x^{2} + x + 5$",
  "> ④ $4x^{2} + x + 4$",
  "> ⑤ $3x^{2} + 2x + 4$",
].join("\n");

const formatDuration = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `약 ${s}초`;
  if (s === 0) return `약 ${m}분`;
  return `약 ${m}분 ${s}초`;
};

const enabledExtrasLabel = (extras: WizardState["extras"]): string => {
  const labels: string[] = [];
  if (extras.solutions) labels.push("풀이지");
  if (extras.answers) labels.push("정답지");
  if (extras.oapNote) labels.push("오답노트");
  if (extras.stats) labels.push("통계");
  return labels.length === 0 ? "없음" : labels.join(" · ");
};

export const Step3Options = () => {
  const goal = useWizardStore((s) => s.goal);
  const difficulty = useWizardStore((s) => s.difficulty);
  const extras = useWizardStore((s) => s.extras);
  const setOptions = useWizardStore((s) => s.setOptions);
  const pages = useWizardStore((s) => s.pages);

  // OCR 결과에서 *변형 가능* 문항 수 정확히 계산. Step 2 통과 후 진입이므로
  // pages[].ocrResult 가 채워져 있음. text 없거나 bodyMissing 인 결손 문항은
  // 변형 불가 → useVariantGen 의 eligible 필터와 *일관성 유지* 필요 (B10 방어).
  const problemCount = useMemo(() => {
    const items = pages
      .filter((p) => p.isProblemPage || p.forceOcr)
      .flatMap((p) => p.ocrResult)
      .filter((it) => it.text && !it.bodyMissing);
    return items.length > 0 ? items.length : 30;
  }, [pages]);

  const variantMarkdown = useMemo(
    () => buildVariantSample(goal, difficulty),
    [goal, difficulty],
  );

  const handleExtra = (id: keyof WizardState["extras"]) =>
    setOptions({ extras: { ...extras, [id]: !extras[id] } });

  return (
    <div className="max-w-[1400px] mx-auto px-12 py-8 grid grid-cols-[1.15fr_1fr] gap-8">
      {/* ── Left column — pick goals + difficulty + extras ───────────── */}
      <div>
        <Heading
          level="h1"
          sub={`${problemCount}개 문항 전체에 적용됩니다. 다음 단계에서 개별 조정 가능합니다.`}
          className="mb-6"
        >
          어떻게 변형할까요?
        </Heading>

        {/* 변환 목표 — 2x2 card grid */}
        <div className="mb-6">
          <Eyebrow className="mb-2.5">변환 목표</Eyebrow>
          <div className="grid grid-cols-2 gap-2.5">
            {GOALS.map((g) => {
              const on = g.id === goal;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setOptions({ goal: g.id })}
                  aria-pressed={on}
                  className={cn(
                    "relative p-4 rounded-r3 text-left transition-all duration-[140ms] ease-out",
                    "focus-visible:outline-none focus-visible:shadow-accent-glow",
                    "border-[1.5px]",
                    on
                      ? "border-accent bg-accent-soft shadow-accent-glow"
                      : "border-line bg-surface shadow-s1 hover:border-line-strong",
                  )}
                >
                  <span
                    className={cn(
                      "w-8 h-8 rounded-r1 grid place-items-center mb-2.5",
                      on ? "bg-white text-accent" : "bg-surface2 text-muted",
                    )}
                  >
                    <Icon name={g.icon} size={18} weight={on ? "bold" : "regular"} />
                  </span>
                  <div
                    className={cn(
                      "text-h3",
                      on ? "text-accent-ink" : "text-text",
                    )}
                  >
                    {g.title}
                  </div>
                  <div className="text-small text-muted mt-0.5">{g.desc}</div>
                  {on && (
                    <span
                      className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-accent text-white grid place-items-center"
                      aria-hidden
                    >
                      <Icon name="check" size={12} weight="bold" color="white" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 난이도 조정 */}
        <div className="mb-6">
          <Eyebrow className="mb-2.5">난이도 조정</Eyebrow>
          <Segmented<DifficultyShift>
            value={difficulty}
            onChange={(v) => setOptions({ difficulty: v })}
            options={DIFFICULTY_OPTIONS}
            size="md"
            full
          />
        </div>

        {/* 함께 만들 자료 */}
        <div>
          <Eyebrow className="mb-2.5">함께 만들 자료</Eyebrow>
          <Card pad={4}>
            {EXTRAS.map((ex, i) => {
              const on = extras[ex.id];
              const last = i === EXTRAS.length - 1;
              // 외곽 wrapper 는 `<div role="button">` 으로 — Toggle 내부 `<button>` 과
              // nested `<button>` 이 되면 React 가 hydration warning + DOM spec 위반.
              return (
                <div
                  key={ex.id}
                  role="button"
                  tabIndex={0}
                  aria-pressed={on}
                  onClick={() => handleExtra(ex.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleExtra(ex.id);
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer",
                    "transition-colors duration-[120ms]",
                    "focus-visible:outline-none focus-visible:bg-hover",
                    !last && "border-b border-line",
                  )}
                >
                  <span
                    className={cn(
                      "w-8 h-8 rounded-r1 grid place-items-center flex-shrink-0",
                      on ? "bg-accent-soft text-accent" : "bg-surface2 text-muted",
                    )}
                  >
                    <Icon name={ex.icon} size={15} weight={on ? "bold" : "regular"} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-body text-text font-[550]">{ex.title}</div>
                    <div className="text-caption text-muted mt-px">{ex.hint}</div>
                  </div>
                  {/* Toggle 클릭 시 propagation 중지 — 한 번의 onClick 으로 충분
                      (외곽 div 의 onClick 이 같은 핸들러 호출, 중복 토글 방지). */}
                  <div onClick={(e) => e.stopPropagation()}>
                    <Toggle
                      value={on}
                      onChange={() => handleExtra(ex.id)}
                      size="sm"
                      aria-label={ex.title}
                    />
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      </div>

      {/* ── Right column — preview + summary ─────────────────────────── */}
      <div>
        <Eyebrow className="mb-2.5">실시간 미리보기 · 1번 문항</Eyebrow>
        <Card pad={0} className="overflow-hidden">
          <div className="grid grid-cols-2">
            <div className="p-4 border-r border-line">
              <Chip size="sm" className="mb-2.5">
                원본
              </Chip>
              <MarkdownRenderer
                content={ORIGINAL_SAMPLE}
                className="text-[12.5px] leading-[1.6] text-text [&_.katex]:text-[13px] [&_p]:!my-1.5"
              />
            </div>
            <div className="p-4 bg-accent-soft/30">
              <Chip tone="accent" size="sm" className="mb-2.5">
                변환 예상
              </Chip>
              <MarkdownRenderer
                content={variantMarkdown}
                className="text-[12.5px] leading-[1.6] text-text [&_.katex]:text-[13px] [&_p]:!my-1.5"
              />
            </div>
          </div>
        </Card>

        {/* Info banner */}
        <div className="mt-2.5 px-3 py-2 rounded-r2 bg-warn-soft text-warn-ink text-small flex items-center gap-1.5">
          <Icon name="info" size={13} weight="fill" color="#F59E0B" />
          옵션을 바꿀 때마다 1번 문항으로 즉시 미리보기됩니다.
        </div>

        {/* 예상 결과 */}
        <Card pad={16} className="mt-[22px] bg-surface2 border-line">
          <Eyebrow className="mb-3">예상 결과</Eyebrow>
          <div className="flex flex-col gap-2.5">
            <SummaryRow
              icon="clock"
              label="변환 시간"
              value={formatDuration(problemCount * 5)}
            />
            <SummaryRow
              icon="list-numbers"
              label="변환 문항"
              value={`${problemCount}개`}
            />
            <SummaryRow
              icon="files"
              label="함께 생성될 자료"
              value={enabledExtrasLabel(extras)}
            />
            <SummaryRow
              icon="lightning"
              label="크레딧 사용"
              value={`${problemCount} / 잔여 1,240`}
              valueClassName="text-accent"
            />
          </div>
        </Card>
      </div>
    </div>
  );
};

interface SummaryRowProps {
  icon: string;
  label: string;
  value: string;
  valueClassName?: string;
}

const SummaryRow = ({ icon, label, value, valueClassName }: SummaryRowProps) => (
  <div className="flex justify-between items-center text-body">
    <span className="text-text2 flex items-center gap-1.5">
      <Icon name={icon} size={14} />
      {label}
    </span>
    <span className={cn("font-semibold", valueClassName ?? "text-text")}>
      {value}
    </span>
  </div>
);

export default Step3Options;
