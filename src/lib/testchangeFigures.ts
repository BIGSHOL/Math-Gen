import type { EngineBlock, EngineQuestion, TestchangeExamData } from '../types/testchange';

export function visitEngineFigures(q: EngineQuestion, visit: (b: EngineBlock) => void): void {
  for (const b of q.contents ?? []) if (b.type === 'figure' || b.type === 'image') visit(b);
  for (const c of q.choices ?? []) visitEngineFigures(c, visit);
  for (const sub of q.sub_questions ?? []) visitEngineFigures(sub, visit);
}

export const figureAssetKey = (questionId: number, b: EngineBlock): string =>
  `${questionId}:${b.page}:${Array.isArray(b.bbox) ? b.bbox.join(',') : ''}`;

export function missingEngineFigures(data: TestchangeExamData): number[] {
  return data.questions.filter(q => {
    let missing = false;
    visitEngineFigures(q.body, b => { if (!b.crop && !b.svg && !b.spec) missing = true; });
    return missing;
  }).map(q => q.number);
}
