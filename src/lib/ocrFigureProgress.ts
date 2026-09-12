import { useWizardStore, type CropBox, type OCRProblem } from "../stores/wizardStore.js";
import { redrawQuestionFigures } from "../services/ai/figurePipeline.js";
import { figuresForQuestionCrop, QUESTION_CROP_MARGIN } from "./figureCrops.js";
import { remapBoxToFullPage } from "./figureBoxRemap.js";

export interface QuestionFigureWork {
  crop: string;
  box: CropBox;
  problem: OCRProblem; // Coordinates remain local to the question crop until publication.
}
const activeFigures = new Map<string, symbol>();
export function cancelItemFigures(pageId: string, itemId: string): void {
  activeFigures.delete(`${pageId}:${itemId}`);
}

export function remapQuestionFigures(problem: OCRProblem, box: CropBox): OCRProblem {
  const remap = (b: [number, number, number, number]) => remapBoxToFullPage(b, box.bbox, QUESTION_CROP_MARGIN);
  return { ...problem,
    images: problem.images?.map(({ storagePath: _drop, ...image }) => ({ ...image, box: remap(image.box) })),
    figures: problem.figures?.map(figure => ({ ...figure, box: remap(figure.box) })),
  };
}

/** Ignore background crop uploads, but stop as soon as the user changes the content. */
function sameContent(a: OCRProblem, b: OCRProblem): boolean {
  return a.text === b.text && a.number === b.number && a.blocks === b.blocks && a.reviewed === b.reviewed
    && a.diagramParams === b.diagramParams && a.images?.length === b.images?.length
    && (a.images ?? []).every((image, i) => {
      const other = b.images![i];
      return image.dataUrl === other.dataUrl && image.url === other.url && image.engineSvg === other.engineSvg
        && image.label === other.label && image.source === other.source && image.box.every((n, j) => n === other.box[j]);
    });
}

/** Publish only this item's figure fields into the latest store, preserving sibling/manual edits. */
export async function completeQuestionFigures(pageId: string, work: QuestionFigureWork, isCancelled: () => boolean): Promise<void> {
  const key = `${pageId}:${work.problem.id}`;
  const run = Symbol(key);
  activeFigures.set(key, run);
  const current = () => useWizardStore.getState().pages.find(p => p.id === pageId)?.ocrResult.find(p => p.id === work.problem.id);
  let baseline = current();
  let edited = false;
  const cancelled = () => {
    if (isCancelled() || edited || activeFigures.get(key) !== run) return true;
    const latest = current();
    if (!latest || !baseline || !sameContent(latest, baseline)) edited = true;
    return edited;
  };
  const publish = (problem: OCRProblem) => {
    if (cancelled()) return;
    const next = remapQuestionFigures(problem, work.box);
    useWizardStore.getState().updateOCRItem(pageId, work.problem.id, {
      text: next.text, blocks: next.blocks, images: next.images, figures: next.figures,
      diagramParams: next.diagramParams, figureWarnings: next.figureWarnings,
      figureProgress: next.figureProgress, status: next.figureWarnings?.length ? "warn" : current()!.status,
    });
    baseline = current();
  };
  try {
    if (cancelled()) return;
    const result = await redrawQuestionFigures(work.crop, work.problem, cancelled, figuresForQuestionCrop(work.box), publish);
    publish({ ...result, figureProgress: undefined });
  } catch (error) {
    if (!cancelled()) useWizardStore.getState().updateOCRItem(pageId, work.problem.id, {
      status: "warn", figureWarnings: [`그림 처리 실패: ${(error as Error).message} (현재 그림 유지)`],
    });
  } finally {
    if (activeFigures.get(key) === run) {
      activeFigures.delete(key);
      if (!isCancelled() && current()) useWizardStore.getState().updateOCRItem(pageId, work.problem.id, { figureProgress: undefined });
    }
  }
}
