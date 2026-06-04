import { useEffect, useMemo, useRef } from "react";
import { pLimitWithGap, withRetry } from "@app/lib/concurrency";
import { friendlyError } from "@app/lib/friendlyError";
import { reportError } from "@app/lib/errorReporter";
import { generateVariant } from "@app/services/ai/variants";
import {
  buildDigitizeReviews,
  eligibleOcrProblems,
  ocrToGenerated,
} from "@app/lib/problemAdapter";
import {
  useWizardStore,
  type ProblemReview,
} from "@app/stores/wizardStore";
import type { GeneratedProblem } from "@app/types";

/**
 * digitize 재시드 판단 — 현재 `problems` 와 live 도출 `fresh` 가 (id·본문·해설·답·
 * 보기) 중 하나라도 다르면 true. 같으면 `setProblems` 를 생략해 effect 무한 루프를
 * 막는다(수렴). 재OCR/해설 재생성으로 ocrResult 가 바뀌면 여기서 stale 로 감지된다.
 */
const CHOICE_JOIN = String.fromCharCode(1);
const digitizeReviewsChanged = (
  current: ProblemReview[],
  fresh: ProblemReview[],
): boolean => {
  if (current.length !== fresh.length) return true;
  for (let i = 0; i < fresh.length; i++) {
    const c = current[i];
    const f = fresh[i];
    if (c.id !== f.id) return true;
    if (c.variant.question !== f.variant.question) return true;
    if (c.variant.solution !== f.variant.solution) return true;
    if (c.variant.answer !== f.variant.answer) return true;
    if (
      (c.variant.choices?.join(CHOICE_JOIN) ?? "") !==
      (f.variant.choices?.join(CHOICE_JOIN) ?? "")
    )
      return true;
  }
  return false;
};

/**
 * Step 4 orchestrator — fan out variant generation across every OCR'd
 * problem in the current wizard session.
 *
 * **두 단계 effect**:
 *
 * 1. **effect-A (seed)**: 첫 mount 시 `problems.length === 0` 이면 pages 의
 *    OCR 결과를 `ProblemReview[]` 로 변환해 store 에 시드. `goal === "digitize"`
 *    면 variant = original copy + `status: "confirmed"` 로 즉시 마감 (호출 0).
 *    그 외에는 `status: "pending"` → effect-B 가 픽업.
 *
 * 2. **effect-B (dispatch)**: 각 pending problem 마다 `generateVariant` 호출.
 *    `useSolutionGen` 의 dispatched Set + pLimitWithGap(1, 1500) + withRetry
 *    패턴 그대로. 성공 → `status: "review"`, 실패 → `status: "pending"` +
 *    `genError` (사용자 재시도 버튼 노출).
 *
 * **Skip 조건** (effect-B):
 *   - `status === "confirmed"` (사용자가 이미 확정)
 *   - `generating === true` (in-flight 중)
 *   - `genError` 있음 (사용자 재시도 대기)
 *   - 이미 dispatched 됨 (mount 내 중복 방지)
 *
 * **Cancellation**: `useSolutionGen` / `usePageOcr` 와 동일 — `dispatched`
 * Set 멤버십이 유일한 취소 신호. AbortController 안 씀 (React 19 StrictMode
 * 무한 루프 footgun 회피, CLAUDE.md 1-6-b 참고).
 *
 * **답 구조 검증**: `generateVariant` 가 `choicesCount` 불일치 시 throw.
 * `withRetry` 가 1 회 재시도 (최대 5 회 — concurrency.ts 의 maxRetries 4 +
 * 첫 시도). 모두 실패하면 `genError` 로 surfacing — UI 에서 "원본 보기 유지"
 * fallback 또는 사용자 재시도.
 */
export const useVariantGen = (): {
  resetDispatch: (id: string) => void;
  reseedAll: () => void;
} => {
  const pages = useWizardStore((s) => s.pages);
  const problems = useWizardStore((s) => s.problems);
  const setProblems = useWizardStore((s) => s.setProblems);
  const updateProblem = useWizardStore((s) => s.updateProblem);
  const goal = useWizardStore((s) => s.goal);
  const difficulty = useWizardStore((s) => s.difficulty);
  const selectedGrade = useWizardStore((s) => s.selectedGrade);
  // pLimitWithGap(1, 1500) — Sonnet 4.6 Tier 1 RPM 50 안전 디폴트.
  // useSolutionGen 과 동일 설정. Tier 2 업그레이드 시 (RPM 1000) 줄일 수 있음.
  const limit = useMemo(() => pLimitWithGap(1, 1500), []);

  // dispatched marker — 이 mount 에서 이미 처리 시작한 id 추적.
  const dispatched = useRef<Set<string>>(new Set());

  // ── effect-A: seed ────────────────────────────────────────────────
  // problems.length === 0 일 때만 페이지 OCR 결과로 시드. 시드 직후에는
  // effect-B 가 자연 픽업하므로 별도 트리거 X.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const isDigitize = goal === "digitize";

    // ── 이미 시드된 경우 ──────────────────────────────────────────────
    if (problems.length > 0) {
      // 비-digitize: 사용자가 생성/편집한 변형 보존 → 자동 재시드 안 함.
      // (옵션 변경 시 명시적 "옵션 재생성" = reseedAll 로만, §16-7.)
      if (!isDigitize) return;
      // digitize: 변형 = ocrResult 순수 복사 (사용자 편집 없음). 재OCR/해설 재생성으로
      // ocrResult 가 바뀌면 live 반영 위해 재시드 — 안 하면 옛 해설 snapshot 이
      // 내보내기에 노출된다 (사용자 결정 2026-06-04 "digitize면 live ocrResult 사용").
      const fresh = buildDigitizeReviews(pages);
      if (fresh.length === 0) return; // live eligible 비면 기존 유지 (재OCR transient 보호)
      // stale 일 때만 setProblems — 같으면 생략해 무한 루프 방지(수렴).
      if (digitizeReviewsChanged(problems, fresh)) setProblems(fresh);
      return;
    }

    // ── 최초 시드 ────────────────────────────────────────────────────
    // 변형 가능 문항(eligible)만 시드. 결손 문항(본문/보기/해설 누락)은 제외.
    const eligible = eligibleOcrProblems(pages);
    if (eligible.length === 0) return;
    const seeded: ProblemReview[] = eligible.map((it) => {
      const original = ocrToGenerated(it);
      return {
        id: it.id,
        original,
        // 초기엔 original 복사. effect-B 가 generateVariant 결과로 교체.
        variant: original,
        // digitize 면 즉시 confirmed (변형 X, 호출 0).
        status: isDigitize ? "confirmed" : "pending",
        generating: false,
      };
    });
    setProblems(seeded);
  }, [pages, problems, goal, setProblems]);

  // ── effect-B: dispatch ──────────────────────────────────────────────
  // 각 pending problem 에 대해 generateVariant 호출. 변경된 problems 마다
  // 재실행하지만 dispatched Set 으로 중복 방지.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (goal === "digitize") return; // fast path — 호출 0
    for (const p of problems) {
      if (dispatched.current.has(p.id)) continue;
      if (p.status === "confirmed") continue;
      if (p.generating) continue;
      if (p.genError) continue; // 사용자 재시도 대기
      // status === "pending" 또는 "review" 이고 variant === original (아직 생성 X)
      // 인 경우만 dispatch. status === "review" + variant 다른 경우는 이미 완료된 것.
      if (p.status === "review" && p.variant !== p.original) continue;

      dispatched.current.add(p.id);
      // generating: true 는 dispatched 직후 set — 큐 대기 포함. 실제 호출 시작
      // 시점은 limit() async fn 첫 줄의 generatingStartedAt 으로 구분.
      updateProblem(p.id, { generating: true, genError: undefined });
      const choicesCount = p.original.choices?.length ?? 0;
      void limit(async () => {
        if (!dispatched.current.has(p.id)) return;
        // 실제 호출 시작 — VariantItem 의 "대기 중" → "생성 중 · 12s" 전환 신호.
        updateProblem(p.id, { generatingStartedAt: Date.now() });
        try {
          const result = await withRetry(() =>
            generateVariant({
              problem: p.original,
              goal,
              difficulty,
              grade: selectedGrade,
              choicesCount,
            }),
          );
          if (!dispatched.current.has(p.id)) return;
          const variant: GeneratedProblem = {
            question: result.question,
            choices: result.choices.length > 0 ? result.choices : undefined,
            answer: result.answer,
            solution: result.solution,
            topic: result.topic || p.original.topic,
            difficulty: result.difficulty,
            diagramSVG: null, // 도형은 원본 유지 (이번 phase)
            // Phase #7: 원본 보기 grid 배치 상속 — variant 가 원본과 동일 layout.
            // result.choicesLayout 우선 (모델이 변경 시), 없으면 원본 그대로.
            choicesLayout:
              result.choicesLayout ?? p.original.choicesLayout ?? "auto",
          };
          updateProblem(p.id, {
            variant,
            status: "review",
            generating: false,
            generatingStartedAt: undefined,
            genError: undefined,
            genModel: result.modelUsed,
          });
        } catch (err) {
          if (!dispatched.current.has(p.id)) return;
          // eslint-disable-next-line no-console
          console.error(
            `[useVariantGen] 문항 ${p.id} 변형 실패`,
            err,
          );
          reportError(err, {
            kind: "variant",
            extra: { hook: "useVariantGen", problemId: p.id, goal, difficulty },
          });
          updateProblem(p.id, {
            generating: false,
            generatingStartedAt: undefined,
            genError: friendlyError(err),
            status: "pending",
          });
        }
      });
    }
  }, [problems, goal, difficulty, selectedGrade, limit, updateProblem]);

  /**
   * Clear the dispatched marker for a given problem so the next effect cycle
   * picks it up again. Pair with `updateProblem(id, { variant: original,
   * status: "pending", genError: undefined })` to force fresh generation.
   *
   * 사용처: VariantItem 의 "재생성" 버튼.
   */
  const resetDispatch = (id: string): void => {
    dispatched.current.delete(id);
  };

  /**
   * 전체 problems 를 비우고 재시드. 사용자가 Step 3 옵션 변경 후 "옵션 적용해
   * 재생성" 버튼 누르면 호출. effect-A 가 새 옵션 기준으로 다시 시드, effect-B
   * 가 호출 시작.
   */
  const reseedAll = (): void => {
    dispatched.current.clear();
    setProblems([]);
  };

  return { resetDispatch, reseedAll };
};
