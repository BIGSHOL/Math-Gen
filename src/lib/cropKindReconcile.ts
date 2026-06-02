// cropKindReconcile.ts
//
// 크롭 분류(CropBox.kind = "essay")를 *권위 신호* 로 삼아 OCR 결과의
// choicesMissing 오경고를 제거하는 후처리 헬퍼.
//
// 배경 (사용자 보고 2026-06-02 — SERIOUS): 검수(Step 1.5)에서 *서술형* 으로
// 분류·크롭된 문항인데, OCR 의 텍스트 휴리스틱(ocr.ts MULTIPLE_CHOICE_PROMPT)이
// "...구하시오" 같은 *명령형 답안 지시* 를 객관식 발문으로 오인 → "보기 누락"
// 오경고 banner 노출. ocr.ts 의 isExplicitlySubjective 텍스트 휴리스틱으로 1차
// 방어했지만, *크롭 단계의 type 분류* 가 본문 텍스트보다 더 신뢰할 수 있는
// 권위 신호라 후처리에서 한 번 더 reconcile (belt-and-suspenders).
//
// 비대칭 정책 (false positive 만 제거, true positive 는 보존):
//   - kind="essay" 박스 → 매칭 item 의 choicesMissing=true 면 false 로 정정.
//       bodyMissing 이 아니면 choicesMissing 하나로 잡힌 warn status 도 ok 강등.
//   - kind="choice" 박스 → 그대로 둠. OCR 이 보기 누락을 *정확히* 잡은 케이스
//       (객관식인데 ①②③④⑤ 를 못 읽음) 는 유효 경고라 유지.
//   - kind 미설정(구버전 session / 사용자가 수동 추가한 박스) → 그대로 둠.
//
// 매칭은 *인쇄된 문항 번호* (CropBox.number ↔ OCRProblem.number) 기준.
// cropBoxes 가 없거나 essay 박스가 하나도 없으면 items 를 그대로 (동일 reference)
// 반환 — 호출부의 불필요한 re-render 회피.

import type { CropBox, OCRProblem } from "@app/stores/wizardStore";

export const reconcileChoicesMissingWithCrop = (
  items: OCRProblem[],
  cropBoxes: CropBox[] | undefined,
): OCRProblem[] => {
  if (!cropBoxes || cropBoxes.length === 0) return items;

  const essayNumbers = new Set<number>();
  for (const b of cropBoxes) {
    if (b.kind === "essay" && typeof b.number === "number") {
      essayNumbers.add(b.number);
    }
  }
  if (essayNumbers.size === 0) return items;

  let changed = false;
  const next = items.map((it) => {
    // 이미 choicesMissing 이 false 면 손댈 것 없음.
    if (!it.choicesMissing) return it;
    // 이 문항이 서술형으로 크롭된 게 아니면 OCR 경고 유지.
    if (!essayNumbers.has(it.number)) return it;
    changed = true;
    // 서술형 권위 신호 → "보기 누락" 오경고 제거.
    //  · bodyMissing 이면 warn 유지 (본문 누락은 별개의 유효 경고).
    //  · 그 외 warn 은 choicesMissing 하나로 잡힌 것이므로 ok 로 강등.
    const status: OCRProblem["status"] =
      it.bodyMissing || it.status !== "warn" ? it.status : "ok";
    return { ...it, choicesMissing: false, status };
  });

  return changed ? next : items;
};
