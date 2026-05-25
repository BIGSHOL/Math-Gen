import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Card, Chip, Icon } from "@app/components/ui";
import MarkdownRenderer from "@app/components/math/MarkdownRenderer";
import { pLimitWithGap } from "@app/lib/concurrency";
import { ocrToGenerated } from "@app/lib/problemAdapter";
import { modelShortName } from "@app/lib/modelLabel";
import { generateVariant } from "@app/services/ai/variants";
import type { OCRModel } from "@app/services/ai/ocr";
import { GEMINI_3_FLASH, GEMINI_3_1_PRO } from "@app/services/ai/gemini";
import { GPT_5_5 } from "@app/services/ai/openai";
import { SONNET_MODEL } from "@app/services/ai/client";
import { useWizardStore, type OCRProblem } from "@app/stores/wizardStore";
import type {
  ConversionGoal,
  DifficultyShift,
} from "@app/stores/wizardStore";
import type { GradeKey } from "@app/services/ai/mathDefense";
import type { GeneratedProblem } from "@app/types";
import { cn } from "@app/lib/tailwind";

/**
 * 변형 테스트 페이지 (URL 게이트 `?varianttest`).
 *
 * **목적**: 전체 시험지 변형 재생성 (~20 호출, ~$1+) 없이 *1-3 문항만 임시*
 * 변형 호출해 schema / prompt / 모델 변경 검증.
 *
 * **데이터 소스**: 현재 탭 wizardStore 의 `pages.flatMap(p => p.ocrResult)` —
 * 라이브러리 별도 fetch X. 사용자가 위자드 Step 1+ 진행한 세션에서만 사용 가능.
 * empty state 안내 표시.
 *
 * **인프라 재사용**:
 * - `pLimitWithGap(1, 1500)` — Sonnet 4.6 RPM 보호 (useVariantGen 패턴)
 * - `ocrToGenerated` — OCRProblem → GeneratedProblem 변환
 * - `MarkdownRenderer` — KaTeX + diagram 정상
 * - `modelShortName` — 모델 chip 라벨 (G3F / G3.1P / GPT5.5 / Sonnet)
 *
 * **회귀 방지**: wizardStore *read only*. 테스트 결과는 컴포넌트 state 만.
 * 검증 후 위자드로 돌아가 정상 작업 가능.
 *
 * **비용 보호**:
 * - max 3 선택
 * - 실행 중 버튼 비활성
 * - sequential 호출 (~ 1.5초 간격)
 * - AbortController — 옵션 변경 시 in-flight cancel
 */

const RETRY_MODEL_OPTIONS: Array<{
  id: OCRModel;
  label: string;
  blurb: string;
}> = [
  {
    id: SONNET_MODEL,
    label: "수식 (Sonnet)",
    blurb: "Claude Sonnet 4.6 · 수식 강함 · variant default",
  },
  {
    id: GEMINI_3_1_PRO,
    label: "정밀 (Gemini)",
    blurb: "Gemini 3.1 Pro · 도형 강함",
  },
  { id: GPT_5_5, label: "정밀 (OpenAI)", blurb: "GPT-5.5 · 도형·디테일" },
  { id: GEMINI_3_FLASH, label: "빠르게", blurb: "Gemini 3 Flash · 기본 (빠름)" },
];

const GOAL_OPTIONS: Array<{ value: ConversionGoal; label: string }> = [
  { value: "similar", label: "유사 (숫자만 변경)" },
  { value: "variant", label: "변형 (유형 다름)" },
  { value: "targeted", label: "맞춤 보충" },
  { value: "digitize", label: "디지털화만 (변형 X)" },
];

const DIFFICULTY_OPTIONS: Array<{ value: DifficultyShift; label: string }> = [
  { value: "easier", label: "쉽게" },
  { value: "same", label: "원본 유지" },
  { value: "harder", label: "어렵게" },
];

const GRADE_OPTIONS: Array<{ value: GradeKey; label: string }> = [
  { value: "middle1", label: "중1" },
  { value: "middle2", label: "중2" },
  { value: "middle3", label: "중3" },
  { value: "high1_common1", label: "고1 공통수학1" },
  { value: "high1_common2", label: "고1 공통수학2" },
  { value: "high2_algebra", label: "고2 대수" },
  { value: "high2_calc1", label: "고2 미적분I" },
  { value: "high2_stats", label: "고2 확률과 통계" },
  { value: "high2_geometry", label: "고2 기하" },
  { value: "high3_calc2", label: "고3 미적분II" },
];

interface ResultEntry {
  /** OCRProblem id — 선택 시점에 고정. 같은 id 재실행 시 덮어쓰기. */
  problemId: string;
  problemNumber: number;
  /** 원본 (변형 전). */
  original: GeneratedProblem;
  /** 변형 결과. 진행 중에는 undefined. */
  variant?: GeneratedProblem;
  /** 호출 모델 (사용자 선택 시점 기록). */
  model: OCRModel;
  /** 호출 시작 timestamp. 경과 시간 계산. */
  startedAt?: number;
  /** 완료 timestamp. */
  finishedAt?: number;
  /** 에러 메시지 — raw (디버깅 용). */
  error?: string;
}

export const VariantTestScreen = () => {
  const pages = useWizardStore((s) => s.pages);
  const storeGrade = useWizardStore((s) => s.selectedGrade);

  // 모든 페이지의 OCRProblem flatten. *eligible* 만 (text 있고 bodyMissing X).
  const allItems = useMemo<OCRProblem[]>(() => {
    return pages
      .filter((p) => p.isProblemPage || p.forceOcr)
      .flatMap((p) => p.ocrResult)
      .filter((it) => it.text && !it.bodyMissing);
  }, [pages]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [goal, setGoal] = useState<ConversionGoal>("similar");
  const [difficulty, setDifficulty] = useState<DifficultyShift>("same");
  const [grade, setGrade] = useState<GradeKey | null>(storeGrade);
  const [model, setModel] = useState<OCRModel>(SONNET_MODEL);
  const [results, setResults] = useState<ResultEntry[]>([]);
  const [running, setRunning] = useState(false);

  // store 의 selectedGrade 가 hydrate 늦게 됐을 때 sync.
  useEffect(() => {
    if (storeGrade && !grade) setGrade(storeGrade);
  }, [storeGrade, grade]);

  // AbortController per-run — 실행 중 다른 옵션 / 다른 문제 선택 후 재실행 시 cancel.
  const abortRef = useRef<AbortController | null>(null);

  // 호출 제한 — Sonnet 4.6 RPM 보호. useVariantGen 과 동일 패턴.
  const limit = useMemo(() => pLimitWithGap(1, 1500), []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 3) return prev; // max 3
        next.add(id);
      }
      return next;
    });
  };

  const runTests = async () => {
    // 이전 호출 abort
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const targets = allItems.filter((it) => selectedIds.has(it.id));
    if (targets.length === 0) return;

    // 결과 초기화 — 선택 항목 그대로, variant/startedAt 비움
    const seeded: ResultEntry[] = targets.map((it) => ({
      problemId: it.id,
      problemNumber: it.number,
      original: ocrToGenerated(it),
      model,
    }));
    setResults(seeded);
    setRunning(true);

    try {
      await Promise.all(
        targets.map((it, idx) =>
          limit(async () => {
            if (controller.signal.aborted) return;
            // 호출 시작
            setResults((prev) =>
              prev.map((r, i) => (i === idx ? { ...r, startedAt: Date.now() } : r)),
            );
            try {
              const original = ocrToGenerated(it);
              const result = await generateVariant({
                problem: {
                  question: original.question,
                  choices: original.choices,
                  answer: original.answer,
                  solution: original.solution,
                  topic: original.topic,
                },
                goal,
                difficulty,
                grade,
                choicesCount: original.choices?.length ?? 0,
                signal: controller.signal,
                model,
              });
              if (controller.signal.aborted) return;
              setResults((prev) =>
                prev.map((r, i) =>
                  i === idx
                    ? {
                        ...r,
                        variant: {
                          question: result.question,
                          choices: result.choices,
                          answer: result.answer,
                          solution: result.solution,
                          topic: result.topic ?? original.topic,
                          difficulty: result.difficulty ?? "중",
                          diagramSVG: result.diagramSVG ?? null,
                        },
                        finishedAt: Date.now(),
                      }
                    : r,
                ),
              );
            } catch (err) {
              if (controller.signal.aborted) return;
              const msg = (err as Error).message || "알 수 없는 오류";
              setResults((prev) =>
                prev.map((r, i) =>
                  i === idx ? { ...r, error: msg, finishedAt: Date.now() } : r,
                ),
              );
            }
          }),
        ),
      );
    } finally {
      setRunning(false);
    }
  };

  // cleanup — unmount 시 in-flight abort
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  // empty state — pages 비어있음 (위자드 진행 안 됨)
  if (allItems.length === 0) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center gap-3 bg-bg text-text font-sans">
        <Icon name="warning" size={36} weight="duotone" color="#F59E0B" />
        <h1 className="text-h3 font-bold">변형 테스트 — 데이터 없음</h1>
        <p className="text-body text-muted max-w-md text-center">
          이 탭에서 위자드를 *Step 1+* 진행한 후 다시 진입해 주세요. 라이브러리에서
          시험지를 선택하고 "이어서 작업" 누르면 데이터가 hydrate됩니다.
        </p>
        <Btn kind="primary" onClick={() => (window.location.href = "/")}>
          라이브러리로
        </Btn>
      </div>
    );
  }

  return (
    <div className="w-full h-screen flex flex-col bg-bg text-text font-sans">
      {/* Top bar */}
      <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-line bg-surface">
        <div className="flex items-center gap-3">
          <h1 className="text-h4 font-bold">변형 테스트</h1>
          <Chip tone="soft" size="sm">
            ?varianttest
          </Chip>
          <span className="text-caption text-muted">
            ({allItems.length} 문항 중 {selectedIds.size} 선택 · max 3)
          </span>
        </div>
        <Btn kind="ghost" icon="x" onClick={() => (window.location.href = "/")}>
          종료
        </Btn>
      </header>

      {/* Body 3-pane */}
      <div className="flex-1 flex min-h-0">
        {/* 좌측 — 문제 선택 */}
        <aside className="w-[320px] shrink-0 border-r border-line bg-surface overflow-auto p-3">
          <div className="text-small font-semibold text-muted mb-2">문제 선택</div>
          <div className="space-y-1.5">
            {allItems.map((it) => {
              const selected = selectedIds.has(it.id);
              const disabled = !selected && selectedIds.size >= 3;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => toggleSelect(it.id)}
                  disabled={disabled || running}
                  className={cn(
                    "w-full text-left rounded-r2 border p-2.5 transition-colors",
                    selected
                      ? "border-accent bg-accent/5"
                      : "border-line hover:border-accent/50 bg-surface",
                    (disabled || running) && "opacity-40 cursor-not-allowed",
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-small w-6 text-center">
                      {it.number}
                    </span>
                    {it.topic && (
                      <Chip size="sm">{it.topic}</Chip>
                    )}
                    {selected && (
                      <Icon name="check" size={14} className="ml-auto text-accent" />
                    )}
                  </div>
                  <div className="text-caption text-muted line-clamp-2">
                    {it.text.slice(0, 80)}
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* 중앙 — 옵션 */}
        <aside className="w-[300px] shrink-0 border-r border-line bg-surface overflow-auto p-4">
          <div className="space-y-4">
            <div>
              <div className="text-small font-semibold text-muted mb-2">변환 목표</div>
              <div className="space-y-1">
                {GOAL_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 cursor-pointer text-small"
                  >
                    <input
                      type="radio"
                      name="goal"
                      value={opt.value}
                      checked={goal === opt.value}
                      onChange={() => setGoal(opt.value)}
                      disabled={running}
                      className="accent-accent"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="text-small font-semibold text-muted mb-2">난이도</div>
              <div className="space-y-1">
                {DIFFICULTY_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 cursor-pointer text-small"
                  >
                    <input
                      type="radio"
                      name="difficulty"
                      value={opt.value}
                      checked={difficulty === opt.value}
                      onChange={() => setDifficulty(opt.value)}
                      disabled={running}
                      className="accent-accent"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <div className="text-small font-semibold text-muted mb-2">학년</div>
              <select
                value={grade ?? ""}
                onChange={(e) => setGrade(e.target.value as GradeKey)}
                disabled={running}
                className="w-full h-8 px-2 rounded-r2 border border-line bg-surface text-small focus:outline-none focus:border-accent"
              >
                <option value="">(미선택)</option>
                {GRADE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-small font-semibold text-muted mb-2">모델</div>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value as OCRModel)}
                disabled={running}
                className="w-full h-8 px-2 rounded-r2 border border-line bg-surface text-small focus:outline-none focus:border-accent"
              >
                {RETRY_MODEL_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label} ({modelShortName(opt.id)})
                  </option>
                ))}
              </select>
              <div className="text-caption text-muted mt-1">
                {RETRY_MODEL_OPTIONS.find((o) => o.id === model)?.blurb}
              </div>
            </div>

            <Btn
              kind="primary"
              full
              icon="sparkle"
              onClick={runTests}
              disabled={running || selectedIds.size === 0}
            >
              {running
                ? `호출 중… (${selectedIds.size} 문항)`
                : `실행 (${selectedIds.size} 문항)`}
            </Btn>
            {selectedIds.size === 0 && (
              <div className="text-caption text-muted">
                좌측에서 1-3 문항 선택해 주세요.
              </div>
            )}
          </div>
        </aside>

        {/* 우측 — 결과 */}
        <main className="flex-1 min-w-0 overflow-auto p-4">
          {results.length === 0 ? (
            <div className="h-full flex items-center justify-center text-muted">
              <div className="text-center">
                <Icon name="sparkle" size={32} weight="duotone" color="#9CA3AF" />
                <p className="mt-2 text-small">
                  좌측에서 문제 선택 + 중앙 옵션 설정 후 *실행* 클릭
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {results.map((r) => (
                <ResultCard key={r.problemId} entry={r} />
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

const ResultCard = ({ entry }: { entry: ResultEntry }) => {
  const isInFlight = !!entry.startedAt && !entry.finishedAt;
  const elapsed = entry.startedAt
    ? Math.floor(
        ((entry.finishedAt ?? Date.now()) - entry.startedAt) / 1000,
      )
    : null;

  return (
    <Card
      pad={16}
      className={cn(
        entry.error && "border-warn ring-1 ring-warn/10",
        isInFlight && "ring-2 ring-accent/30",
      )}
    >
      <div className="flex items-center gap-2 mb-3">
        <span
          className="grid place-items-center bg-ink text-white rounded-r1 font-mono font-bold"
          style={{ width: 24, height: 24, fontSize: 11 }}
        >
          {entry.problemNumber}
        </span>
        <Chip size="sm" tone="soft">
          {modelShortName(entry.model)}
        </Chip>
        {isInFlight && (
          <Chip size="sm" tone="accent" dot>
            호출 중 · {elapsed}s
          </Chip>
        )}
        {entry.variant && !entry.error && (
          <Chip size="sm" tone="ok" icon="check">
            완료 · {elapsed}s
          </Chip>
        )}
        {entry.error && (
          <Chip size="sm" tone="warn" icon="warning">
            실패 · {elapsed}s
          </Chip>
        )}
        {entry.variant?.answer &&
          entry.original.answer &&
          entry.variant.answer !== entry.original.answer && (
            <Chip size="sm" tone="accent">
              답 변경
            </Chip>
          )}
      </div>

      {/* 에러 메시지 — raw 표시 (디버깅) */}
      {entry.error && (
        <div className="mb-3 p-3 bg-warn/5 rounded-r2 border border-warn/20">
          <div className="text-caption font-semibold text-warnInk mb-1">에러</div>
          <pre className="text-caption text-warnInk whitespace-pre-wrap break-all font-mono">
            {entry.error}
          </pre>
        </div>
      )}

      {/* 원본 vs 변형 side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-caption font-semibold text-muted mb-1.5">원본</div>
          <div className="prose-sm">
            <MarkdownRenderer content={entry.original.question} />
            {entry.original.choices && (
              <ol className="mt-1.5 list-none pl-0 space-y-0.5">
                {entry.original.choices.map((c, i) => (
                  <li key={i} className="text-small">
                    {"①②③④⑤"[i]} <MarkdownRenderer content={c} />
                  </li>
                ))}
              </ol>
            )}
          </div>
          {entry.original.answer && (
            <div className="mt-2 text-caption">
              <span className="text-muted">답:</span>{" "}
              <span className="font-mono">{entry.original.answer}</span>
            </div>
          )}
        </div>
        <div>
          <div className="text-caption font-semibold text-accent mb-1.5">변형</div>
          {entry.variant ? (
            <>
              <div className="prose-sm">
                <MarkdownRenderer content={entry.variant.question} />
                {entry.variant.choices && (
                  <ol className="mt-1.5 list-none pl-0 space-y-0.5">
                    {entry.variant.choices.map((c, i) => (
                      <li key={i} className="text-small">
                        {"①②③④⑤"[i]} <MarkdownRenderer content={c} />
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              {entry.variant.answer && (
                <div className="mt-2 text-caption">
                  <span className="text-muted">답:</span>{" "}
                  <span className="font-mono">{entry.variant.answer}</span>
                </div>
              )}
              {entry.variant.solution && (
                <details className="mt-2">
                  <summary className="text-caption text-muted cursor-pointer hover:text-text">
                    해설 보기
                  </summary>
                  <div className="mt-1.5 prose-sm">
                    <MarkdownRenderer content={entry.variant.solution} />
                  </div>
                </details>
              )}
            </>
          ) : (
            <div className="text-small text-muted italic">
              {isInFlight ? "변형 생성 중…" : entry.error ? "—" : "대기"}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default VariantTestScreen;
