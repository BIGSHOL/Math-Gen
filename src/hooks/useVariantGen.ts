import { useEffect, useMemo, useRef } from "react";
import { pLimitWithGap, withRetry } from "@app/lib/concurrency";
import { generateVariant } from "@app/services/ai/variants";
import { ocrToGenerated } from "@app/lib/problemAdapter";
import {
  useWizardStore,
  type OCRProblem,
  type ProblemReview,
} from "@app/stores/wizardStore";
import type { GeneratedProblem } from "@app/types";

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
    if (problems.length > 0) return;
    // 변형 가능 문항 필터 (B10 방어): text + !bodyMissing + !choicesMissing +
    // solution 있음 + !solutionError. 결손 문항은 시드 안 함.
    const eligible: OCRProblem[] = pages
      .filter((p) => p.isProblemPage || p.forceOcr)
      .flatMap((p) => p.ocrResult)
      .filter(
        (it) =>
          it.text &&
          !it.bodyMissing &&
          !it.choicesMissing &&
          it.solution &&
          !it.solutionError,
      );
    if (eligible.length === 0) return;
    // OCRProblem → GeneratedProblem 변환 (problemAdapter).
    const isDigitize = goal === "digitize";
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
  }, [pages, problems.length, goal, setProblems]);

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
          updateProblem(p.id, {
            generating: false,
            generatingStartedAt: undefined,
            genError: (err as Error).message || "알 수 없는 오류",
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
