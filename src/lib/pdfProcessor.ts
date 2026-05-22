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

import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";

export type { PDFDocumentProxy };

/** PDF 페이지의 정상 방향에서의 회전 각도 (시계 방향, degrees). */
export type PageRotation = 0 | 90 | 180 | 270;

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
    // Required for the 14 PDF standard fonts (Helvetica, Times, Symbol,
    // ZapfDingbats, …). Korean school-made exam papers frequently reference
    // math glyphs through these (esp. Symbol) without embedding the font;
    // without this URL pdfjs-dist 4.x+ renders those glyphs as blank ☐.
    standardFontDataUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/standard_fonts/`,
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
 * Used as a *cost gate* — pages that fail this check are skipped before
 * sending to the AI, saving vision-API tokens. Sources we get are mostly
 * 5–20-page school exams or workbooks where the cover + last page are
 * usually the only non-problem pages, so the rule is:
 *
 *   - empty / nearly-empty text layer → likely scanned-image PDF, keep it
 *     (text extraction failed but the page might still be a problem page)
 *   - definite skip keywords (목차 / 차례 / 학습 계획표 / 표지 / 정답과 풀이)
 *     → skip
 *   - everything else → keep
 *
 * The earlier "require explicit problem pattern" rule mis-classified a lot
 * of legit pages — school papers often start with "1)이차방정식 …" with no
 * space between number and content, so the leading-number regex missed.
 * False positives are cheap (one extra API call per page); false negatives
 * are expensive (entire problems lost, forces user to click 강제 OCR per
 * page). The escape hatch in the UI handles either direction.
 */
export const isProblemPage = (textLayer: string): boolean => {
  const text = (textLayer ?? "").trim();

  // Very short text layers usually come from image-only / scanned PDFs.
  // Keep them — the user uploaded the PDF on purpose, defer to the model.
  if (text.length < 20) return true;

  const definitelySkip = [
    // Front matter
    /^목\s*차$/m,
    /^차\s*례$/m,
    /이\s*책의\s*구성과\s*특징/,
    /학습\s*계획표/,
    // Answer / solution / scoring pages — these are reference material, not problems.
    /정답과?\s*해설/,
    /정답과?\s*풀이/,
    /빠른\s*정답/,
    /정답표/,
    /채점\s*기준/,
    /채점\s*가이드/,
    /모범\s*답안/,
    /해\s*설\s*지/,
    /^정답$/m,
    /^해설$/m,
    /^풀이$/m,
  ];
  return !definitelySkip.some((re) => re.test(text));
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
 * Crop a normalized bounding box (0–1000) out of an already-rendered page
 * data URL. Mirrors `cropImageFromPage` but works on the cached hi-res
 * base64 in IndexedDB instead of re-loading the PDF (which we no longer
 * have by Step 2 — the File blob isn't persisted).
 *
 * `bbox` order matches the model contract: [yMin, xMin, yMax, xMax] with
 * 0–1000 normalized units relative to the page's natural pixel dimensions.
 * `margin` adds breathing room (default 4 %) to compensate for the model's
 * imprecise box predictions — diagram borders are often clipped otherwise.
 */
export const cropPageImageData = async (
  dataUrl: string,
  bbox: [number, number, number, number],
  opts: { margin?: number } = {},
): Promise<string> => {
  const margin = opts.margin ?? 0.04;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("crop: failed to load page image"));
    el.src = dataUrl;
  });

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const [yMin, xMin, yMax, xMax] = bbox;

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

  const cropW = Math.round(px2 - px1);
  const cropH = Math.round(py2 - py1);
  if (cropW <= 0 || cropH <= 0) {
    throw new Error(`crop: degenerate bbox ${JSON.stringify(bbox)}`);
  }
  const areaRatio = (cropW * cropH) / (w * h);
  if (areaRatio < 0.0005 || areaRatio > 0.85) {
    throw new Error(
      `crop: implausible area ratio ${(areaRatio * 100).toFixed(1)}% (bbox ${JSON.stringify(bbox)})`,
    );
  }

  const canvas = document.createElement("canvas");
  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, px1, py1, cropW, cropH, 0, 0, cropW, cropH);
  const out = canvas.toDataURL("image/png");
  canvas.width = 0;
  canvas.height = 0;
  return out;
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

// ── 페이지 회전 감지 + 적용 ─────────────────────────────────────
//
// 일부 스캐너·문서 도구는 페이지를 가로로 회전된 채 저장한다. Vision OCR
// 모델은 그런 페이지에서 column 순서를 헷갈리거나 수직 LaTeX 기호를
// mis-read하는 경향이 있어, 호출 전 정방향으로 회전해서 보내는 게 정확도
// 측면에서 훨씬 유리하다.
//
// 감지 전략 (cascading, 모두 로컬 → API 비용 0원):
//   1. PDF.js 메타데이터 `page.rotate` — 파일 자체에 박혀 있는 회전 정보.
//      문서 편집기·스캐너에서 회전 저장한 케이스 다수.
//   2. textLayer 휴리스틱 — 텍스트 컨텐츠 item 의 transform 매트릭스에서
//      x-축 스케일 vs y-축 스케일 비율을 측정. 글자가 옆으로 누워 있으면
//      가로 / 세로 비율이 역전된다.
//   3. 그 외 → 0 (정상 방향) 가정.

const normalizeRotation = (deg: number): PageRotation => {
  const mod = ((deg % 360) + 360) % 360;
  if (mod === 90 || mod === 180 || mod === 270) return mod as PageRotation;
  return 0;
};

/**
 * textLayer 의 item transform 매트릭스를 보고 페이지가 회전됐는지 추정.
 *
 * PDF.js 의 `getTextContent()` 가 돌려주는 item.transform 은 6개 원소 행렬
 * `[a, b, c, d, e, f]` — 글리프의 변환. 정상 페이지에선 a≈font-size, d≈
 * font-size 이고 b,c≈0. 90° 회전된 페이지에선 a≈0, b≠0, c≠0, d≈0 형태로
 * 나타난다. 여러 item 의 평균 패턴으로 회전 유무를 판정한다.
 *
 * Returns one of 0/90/180/270 — 신호가 약하면 0.
 */
const detectRotationFromTextLayer = async (
  page: PDFPageProxy,
): Promise<PageRotation> => {
  try {
    const content = await page.getTextContent();
    type TextItem = { transform?: number[]; str?: string };
    const items = (content.items as TextItem[]).filter(
      (it) => Array.isArray(it.transform) && it.transform.length === 6 && (it.str ?? "").trim().length > 0,
    );
    if (items.length < 5) return 0; // 신호 부족
    let sumABS_a = 0;
    let sumABS_b = 0;
    let sumABS_c = 0;
    let sumABS_d = 0;
    let signA = 0;
    let signD = 0;
    for (const it of items) {
      const [a, b, c, d] = it.transform!;
      sumABS_a += Math.abs(a);
      sumABS_b += Math.abs(b);
      sumABS_c += Math.abs(c);
      sumABS_d += Math.abs(d);
      signA += Math.sign(a);
      signD += Math.sign(d);
    }
    const horizontalScale = sumABS_a + sumABS_d; // 정상 페이지에서 큼
    const verticalScale = sumABS_b + sumABS_c; // 회전 페이지에서 큼
    // 가로/세로 스케일 비율이 정상 페이지와 명확히 다르면 회전된 것.
    if (verticalScale > horizontalScale * 2) {
      // 회전 방향 결정 — a 또는 b 의 부호로 90 vs 270 구분.
      // 정확한 부호 규칙은 PDF 좌표계 (y-up) 기반:
      //   90° CW  : a=0, b=positive, c=negative, d=0
      //   270° CW : a=0, b=negative, c=positive, d=0
      const meanB =
        items.reduce((acc, it) => acc + (it.transform![1] ?? 0), 0) / items.length;
      return meanB > 0 ? 90 : 270;
    }
    // 180° 회전: a,d 의 부호가 모두 음수가 우세.
    if (signA < -items.length * 0.5 && signD < -items.length * 0.5) {
      return 180;
    }
    return 0;
  } catch {
    return 0;
  }
};

/**
 * PDF 페이지의 자연 방향 회전을 추정.
 *
 *   1. `page.rotate` 메타데이터 (PDF 자체에 박힌 값)
 *   2. textLayer 글리프 transform 매트릭스 휴리스틱
 *   3. 신호 없으면 0
 *
 * 사용자가 업로드 단계 미리보기 그리드의 ⟲ 버튼으로 자동 감지 결과를
 * override 할 수 있도록 store 의 `rotation` 필드는 이 함수의 반환값으로
 * *초기화*만 한다 — 이후 변경은 `setPageRotation` 액션이 담당.
 */
export const detectPageRotation = async (pdf: PDFDocumentProxy, pageNum: number): Promise<PageRotation> => {
  try {
    const page = await pdf.getPage(pageNum);
    // 1) 메타데이터 우선.
    const meta = (page as PDFPageProxy & { rotate?: number }).rotate;
    if (typeof meta === "number" && meta !== 0) {
      page.cleanup();
      return normalizeRotation(meta);
    }
    // 2) textLayer 휴리스틱.
    const fromText = await detectRotationFromTextLayer(page);
    page.cleanup();
    return fromText;
  } catch {
    return 0;
  }
};

/**
 * 이미 렌더된 dataURL 을 시계 방향 `rotation`° 만큼 회전해 새 dataURL 반환.
 * 0° 일 때 입력을 그대로 돌려주는 fast-path. 90/180/270 만 지원 — 다른 값은
 * 입력 그대로.
 *
 * 회전은 OCR 호출 시점에만 적용한다 — IndexedDB 의 원본 이미지는 그대로
 * 두고 (수동 회전 변경 시 IndexedDB write 비용 회피), 모델에 보낼 때만
 * 정방향으로 돌려서 보낸다.
 */
export const applyRotation = async (
  dataUrl: string,
  rotation: PageRotation,
): Promise<string> => {
  if (rotation === 0) return dataUrl;
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("applyRotation: failed to load image"));
    el.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const isVertical = rotation === 90 || rotation === 270;
  canvas.width = isVertical ? img.naturalHeight : img.naturalWidth;
  canvas.height = isVertical ? img.naturalWidth : img.naturalHeight;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
  const out = canvas.toDataURL("image/png");
  canvas.width = 0;
  canvas.height = 0;
  return out;
};
