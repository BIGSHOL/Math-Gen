import type { EngineBlock, TestchangeExamData } from '../types/testchange';
import { visitEngineFigures } from './testchangeFigures';

/** PDF point coordinates, top-left origin, 1-based pages (testchange textlayer.py). */
export async function restoreFiguresFromPdf(data: TestchangeExamData, file: File): Promise<TestchangeExamData> {
  const { loadPdf } = await import('./pdfProcessor');
  const pdf = await loadPdf(file);
  const result = structuredClone(data);
  try {
    for (const question of result.questions) {
      const missing: EngineBlock[] = [];
      visitEngineFigures(question.body, b => { if (!b.crop && !b.svg && !b.spec) missing.push(b); });
      for (const b of missing) {
        const box = b.bbox;
        const pageNumber = Number(b.page);
        if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite) ||
            !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) {
          throw new Error(`${question.number}번 도형의 원본 페이지·좌표를 확인할 수 없습니다.`);
        }
        const page = await pdf.getPage(pageNumber);
        const scale = 3;
        const viewport = page.getViewport({ scale });
        const [x0, y0, x1, y1] = box as number[];
        if (x0 < 0 || y0 < 0 || x1 <= x0 || y1 <= y0 || x1 * scale > viewport.width + 3 || y1 * scale > viewport.height + 3) {
          throw new Error(`${question.number}번 도형 좌표가 PDF 범위를 벗어납니다. 같은 원본 PDF인지 확인해 주세요.`);
        }
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil((x1 - x0) * scale);
        canvas.height = Math.ceil((y1 - y0) * scale);
        const context = canvas.getContext('2d');
        if (!context) throw new Error('도형 이미지를 만들 수 없습니다.');
        try {
          await page.render({ canvas, canvasContext: context, viewport,
            transform: [1, 0, 0, 1, -x0 * scale, -y0 * scale] }).promise;
          b.crop = canvas.toDataURL('image/png');
        } finally { canvas.width = 0; canvas.height = 0; page.cleanup(); }
      }
    }
    return result;
  } finally { await pdf.destroy(); }
}
