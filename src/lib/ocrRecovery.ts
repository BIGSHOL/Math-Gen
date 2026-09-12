import type { OCRProblem, WizardPage } from "../stores/wizardStore.js";

export function finishPendingFigures(item: OCRProblem): OCRProblem {
  if (!item.figureProgress) return item;
  return { ...item, figureProgress: undefined, status: "warn", figureWarnings: [
    ...(item.figureWarnings ?? []), "도형 자동 처리를 중단하고 현재 그림을 유지했습니다. 그림 편집에서 재생성할 수 있습니다.",
  ] };
}

/** A persisted in-flight flag cannot represent a live worker after a reload. */
export function recoverOcrPage(page: WizardPage): WizardPage {
  return { ...page, ocrComplete: page.ocrComplete || !!page.ocrTextComplete,
    ocrInflightModel: undefined, ocrStartedAt: undefined, upgrading: false,
    ocrResult: page.ocrResult.map(finishPendingFigures),
  };
}
