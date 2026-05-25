import type { ConversionGoal, DifficultyShift } from "@app/stores/wizardStore";

/**
 * 변환 옵션의 한국어 라벨 매핑 — Step3Options UI, Step5 PDF 헤더, DetailMetaSidebar
 * 의 *변형 이력* 카드 모두 공통 사용. 한 곳에서 관리해 sync drift 방지.
 *
 * 영어 `goal` / `difficulty` 코드값은 store / DB 에 그대로 저장 (역직렬화 호환).
 * UI 표시 시점에만 한국어로 변환.
 */

export const GOAL_LABEL_KO: Record<ConversionGoal, string> = {
  digitize: "디지털화만",
  similar: "유사 문제 생성",
  variant: "변형 시험지",
  targeted: "맞춤 보충",
};

export const DIFFICULTY_LABEL_KO: Record<DifficultyShift, string> = {
  easier: "쉽게",
  same: "원본 유지",
  harder: "어렵게",
};

/**
 * 신규 변형 batch 저장용 — `${goal} / ${difficulty}` 영문 코드 대신 한국어 라벨.
 *
 * 예) `buildVariantLabel("similar", "same")` → `"유사 문제 생성 · 원본 유지"`
 */
export const buildVariantLabel = (
  goal: ConversionGoal,
  difficulty: DifficultyShift,
): string => `${GOAL_LABEL_KO[goal]} · ${DIFFICULTY_LABEL_KO[difficulty]}`;

/**
 * Legacy DB 호환 — 이전 wizardSync 가 저장한 `"digitize / same"` 형식의 영문
 * 라벨이 DB 에 남아있을 수 있다. 표시 시점에 자동 정규화.
 *
 * 입력:
 *   - `"goal / difficulty"` (영문) → `"디지털화만 · 원본 유지"`
 *   - 이미 한국어 또는 알 수 없는 형식 → 그대로 반환
 *   - `null`/`undefined` → `undefined`
 */
export const formatVariantLabel = (
  label?: string | null,
): string | undefined => {
  if (!label) return undefined;
  // pattern: "${goalCode} / ${difficultyCode}" — 영문 단어 2개 사이에 슬래시
  const m = label.match(/^([a-zA-Z]+)\s*\/\s*([a-zA-Z]+)$/);
  if (!m) return label;
  const [, goalRaw, diffRaw] = m;
  const goal =
    (GOAL_LABEL_KO as Record<string, string>)[goalRaw.toLowerCase()] ??
    goalRaw;
  const diff =
    (DIFFICULTY_LABEL_KO as Record<string, string>)[diffRaw.toLowerCase()] ??
    diffRaw;
  return `${goal} · ${diff}`;
};
