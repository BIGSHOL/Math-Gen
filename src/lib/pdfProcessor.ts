/**
 * Client-side PDF utilities (PDF.js wrappers).
 *
 * Ported and adapted from F:\mathlab\src\lib\utils\pdf-processor.ts.
 * Use these directly in Wizard Step 1 (page extraction) and Step 2 (AI OCR
 * input preparation).
 *
 * Memory hygiene:
 *  - `renderToCanvas` always disposes its canvas via `canvas.width = 0` after
 *    the caller has the data URL.
 *  - `renderThumbnailsBatched` processes pages in groups of 10 so large
 *    textbooks (100+ pages, 100+MB) don't blow up the heap.
 *
 * The worker is loaded from unpkg by default. Phase 5 should switch this to
 * a self-hosted `?worker&url` import for offline reliability.
 */

import type { PDFDocumentProxy } from "pdfjs-dist";

export type { PDFDocumentProxy };

/** Lazy-load pdfjs-dist (client only — avoids SSR/Node import churn). */
const getPdfjs = async () => {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  return pdfjsLib;
};

/** Parse a `File` into a PDF document. */
export const loadPdf = async (file: File): Promise<PDFDocumentProxy> => {
  const pdfjsLib = await getPdfjs();
  const arrayBuffer = await file.arrayBuffer();
  return pdfjsLib.getDocument({
    data: new Uint8Array(arrayBuffer),
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/cmaps/`,
    cMapPacked: true,
  }).promise;
};

/** Internal: render one page at the given scale onto a fresh canvas. */
const renderToCanvas = async (
  pdf: PDFDocumentProxy,
  pageNum: number,
  scale: number,
): Promise<HTMLCanvasElement> => {
  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  // pdfjs-dist v4+ requires `canvas` in the RenderParameters in addition to
  // `canvasContext` — older snippets that pass only the context will fail.
  await page.render({ canvas, canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
};

/** Low-resolution JPEG thumbnail for the page-selection UI. */
export const renderPageThumbnail = async (
  pdf: PDFDocumentProxy,
  pageNum: number,
  scale = 0.25,
): Promise<string> => {
  const canvas = await renderToCanvas(pdf, pageNum, scale);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
};

/** Best-effort text-layer extraction (used as OCR reference + cost gate). */
export const extractPageText = async (pdf: PDFDocumentProxy, pageNum: number): Promise<string> => {
  try {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const strings = textContent.items
      .filter((item): item is { str: string } & typeof item => "str" in item)
      .map((item) => item.str);
    return strings.join(" ").trim();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[pdf-processor] 페이지 ${pageNum} 텍스트 추출 실패:`, err);
    return "";
  }
};

/**
 * Heuristic: does this page look like it contains math problems?
 *
 * Used as a *cost gate* — pages that fail this check (table of contents,
 * cover, study-plan pages) are skipped before sending to the AI, saving
 * vision-API tokens. False negatives are fine; the user can override the
 * filter manually in the wizard.
 */
export const isProblemPage = (textLayer: string): boolean => {
  if (!textLayer || textLayer.length < 10) return false;

  const skipKeywords = [
    /^목\s*차$/m,
    /구성과\s*특징/,
    /이\s*책의\s*(구성|특징)/,
    /차\s*례/,
    /학습\s*계획표/,
    /정답과\s*풀이/,
  ];
  for (const kw of skipKeywords) {
    if (kw.test(textLayer)) {
      const hasNums = /(?:^|\s)(?:0[1-9]|[1-9]\d?)\s/.test(textLayer);
      if (!hasNums) return false;
    }
  }

  const problemPatterns = [
    /(?:^|\s)0[1-9](?:\s|$)/m,
    /(?:^|\s)[1-9]\d?\s*[.)]?\s/m,
    /\([1-9]\d?\)/,
    /①|②|③|④|⑤/,
    /문제\s*\d/,
    /계산해?\s*보세요/,
    /구하시오|구하여라|구해\s*보세요/,
    /써\s*넣으세요|써\s*봅시다/,
    /풀어?\s*보세요|풀어라/,
  ];

  return problemPatterns.some((p) => p.test(textLayer));
};

/** High-resolution PNG for AI vision input. */
const renderPageFullRes = async (
  pdf: PDFDocumentProxy,
  pageNum: number,
  scale: number,
): Promise<string> => {
  const canvas = await renderToCanvas(pdf, pageNum, scale);
  const dataUrl = canvas.toDataURL("image/png");
  canvas.width = 0;
  canvas.height = 0;
  return dataUrl;
};

/** Hi-res image + text layer in parallel — feed both to the AI for hybrid OCR. */
export const renderPageForAI = async (
  pdf: PDFDocumentProxy,
  pageNum: number,
  scale = 2.0,
): Promise<{ imageBase64: string; textLayer: string }> => {
  const [imageBase64, textLayer] = await Promise.all([
    renderPageFullRes(pdf, pageNum, scale),
    extractPageText(pdf, pageNum),
  ]);
  return { imageBase64, textLayer };
};

/**
 * Crop a normalized bounding box (0–1000) out of a page as a base64 PNG.
 * Used after the AI returns per-problem bboxes — we can ship just the
 * cropped image to the renderer instead of the entire page.
 *
 * `margin` adds breathing room around the box (default 8%) to compensate
 * for slightly imprecise bbox predictions.
 */
export const cropImageFromPage = async (
  pdf: PDFDocumentProxy,
  pageNum: number,
  bbox: [number, number, number, number],
  scale = 2.0,
  margin = 0.08,
): Promise<string> => {
  const canvas = await renderToCanvas(pdf, pageNum, scale);
  const [yMin, xMin, yMax, xMax] = bbox;

  const w = canvas.width;
  const h = canvas.height;
  let px1 = (xMin / 1000) * w;
  let py1 = (yMin / 1000) * h;
  let px2 = (xMax / 1000) * w;
  let py2 = (yMax / 1000) * h;

  const mw = (px2 - px1) * margin;
  const mh = (py2 - py1) * margin;
  px1 = Math.max(0, px1 - mw);
  py1 = Math.max(0, py1 - mh);
  px2 = Math.min(w, px2 + mw);
  py2 = Math.min(h, py2 + mh);

  const cropW = px2 - px1;
  const cropH = py2 - py1;

  const areaRatio = (cropW * cropH) / (w * h);
  if (areaRatio < 0.001 || areaRatio > 0.7) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error(`Invalid crop area: ${(areaRatio * 100).toFixed(1)}%`);
  }

  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const ctx = cropCanvas.getContext("2d")!;
  ctx.drawImage(canvas, px1, py1, cropW, cropH, 0, 0, cropW, cropH);

  // 거의 흰 배경(R/G/B ≥ 240) → 알파 0으로 비치게.
  const imageData = ctx.getImageData(0, 0, cropW, cropH);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r >= 240 && g >= 240 && b >= 240) {
      data[i + 3] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const dataUrl = cropCanvas.toDataURL("image/png");

  canvas.width = 0;
  canvas.height = 0;
  cropCanvas.width = 0;
  cropCanvas.height = 0;

  return dataUrl;
};

/**
 * Render thumbnails in batches with a progress callback.
 *
 * Why batched: rendering 100+ thumbnails at once spikes memory (each canvas
 * holds the rasterized page). 10-page batches keep the working set bounded
 * and let the UI show partial results sooner.
 */
export const renderThumbnailsBatched = async (
  pdf: PDFDocumentProxy,
  onBatch: (thumbnails: { pageNum: number; thumbnail: string }[], done: number, total: number) => void,
  batchSize = 10,
): Promise<void> => {
  const total = pdf.numPages;
  for (let start = 1; start <= total; start += batchSize) {
    const end = Math.min(start + batchSize - 1, total);
    const batch: { pageNum: number; thumbnail: string }[] = [];
    for (let i = start; i <= end; i++) {
      const thumb = await renderPageThumbnail(pdf, i);
      batch.push({ pageNum: i, thumbnail: thumb });
    }
    onBatch(batch, end, total);
  }
};
