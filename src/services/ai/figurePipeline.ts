import type { OCRProblem, OCRImage } from "../../stores/wizardStore.js";
import { cropPageImageData } from "../../lib/pdfProcessor.js";
import { pLimit, withRetry } from "../../lib/concurrency.js";
import { fetchWithAuth } from "../api/supabase.js";
import { fitFigureViewport } from "../../lib/figureSvgEditing.js";
import { typesetFigureSvg } from "../../lib/figureTypeset.js";
import { withDeadline, DeadlineError } from "../../lib/deadline.js";

type Box = [number, number, number, number];
export interface Figure { box: Box; label: string; kind: "diagram" | "table" | "artwork" }
const figureLimit = pLimit(1);
async function post<T>(route: string, body: object): Promise<T> {
  return withDeadline((async () => {
  const response = await fetchWithAuth(`/api/${route}`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!response.ok) {
    const stage = ({ "ai-figure-detect": "그림 위치 검출", "ai-figure": "도형 재작도", "figure-render": "도형 엔진", "ai-figure-review": "원본 대조" } as Record<string, string>)[route] ?? route;
    const error = new Error(`${stage}: ${json.error || `HTTP ${response.status}`}`);
    Object.assign(error, { status: response.status, headers: { "retry-after": response.headers.get("retry-after") } });
    throw error;
  }
  return json as T;
  })(), 110_000, "그림 처리 응답이 지연되었습니다. 원본 그림을 유지합니다.");
}
export function validFigure(value: unknown): value is Figure {
  if (!value || typeof value !== "object") return false;
  const { box, kind, label } = value as Figure;
  return typeof label === "string" && ["diagram", "table", "artwork"].includes(kind) && Array.isArray(box) && box.length === 4
    && box.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1000)
    && box[2] > box[0] && box[3] > box[1];
}
export const svgDataUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(Array.from(new TextEncoder().encode(svg), b => String.fromCharCode(b)).join(""))}`;

export async function detectQuestionFigures(questionCrop: string): Promise<Figure[]> {
  const response = await post<{ figures: unknown[] }>("ai-figure-detect", { questionCrop });
  if (!Array.isArray(response.figures) || !response.figures.every(validFigure)) throw new Error("그림 좌표가 올바르지 않습니다.");
  return response.figures;
}

export async function redrawFigureCrop(figureCrop: string, options: {
  cancelled?: () => boolean; instructions?: string; onProgress?: (stage: string) => void;
} = {}): Promise<Pick<OCRImage, "engineSvg" | "engineSpec" | "engineModel" | "dataUrl" | "originalDataUrl"> & { reviewWarnings?: string[] }> {
  let expired = false;
  const cancelled = () => expired || !!options.cancelled?.();
  const check = () => { if (cancelled()) throw new DOMException("Cancelled", "AbortError"); };
  const progress = (stage: string) => { check(); options.onProgress?.(stage); };
  progress("재작도 대기 중");
  return figureLimit(async () => {
    check();
    return withDeadline((async () => {
    let previousSpec: object | undefined;
    let renderError: string | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      progress(`재작도 중 (${attempt + 1}/3)`);
      const result = await withRetry(() => {
        if (cancelled()) throw new DOMException("Cancelled", "AbortError");
        return post<{ spec: object | null; note?: string; model: string }>("ai-figure", {
          figureCrop, previousSpec, renderError, instructions: options.instructions,
        });
      }, { maxRetries: 2 });
      if (cancelled()) throw new DOMException("Cancelled", "AbortError");
      if (!result.spec) throw new Error(result.note || "도형 엔진으로 재현할 수 없습니다.");
      try {
        progress("도형 엔진 렌더링 중");
        const rendered = await withRetry(() => { check(); return post<{ svg: string }>("figure-render", { spec: result.spec }); }, { maxRetries: 2 });
        if (cancelled()) throw new DOMException("Cancelled", "AbortError");
        if (!rendered.svg?.startsWith("<svg")) throw new Error("도형 엔진의 SVG 응답이 올바르지 않습니다.");
        progress("수식 조판 중");
        const svg = fitFigureViewport(await typesetFigureSvg(rendered.svg));
        check();
        const image = new Image(); image.src = svgDataUrl(svg);
        await withDeadline(image.decode(), 10_000, "도형 미리보기를 불러오지 못했습니다.");
        check();
        const canvas = document.createElement("canvas");
        const scale = 900 / Math.max(image.naturalWidth, image.naturalHeight);
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d")!; context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const renderedImage = canvas.toDataURL("image/png");
        canvas.width = 0; canvas.height = 0;
        progress("원본과 대조 중");
        const review = await withRetry(() => { check(); return post<{ passed: boolean; issues: string[] }>("ai-figure-review", {
          figureCrop, renderedImage, instructions: options.instructions, renderedSpec: result.spec,
        }); }, { maxRetries: 2 });
        check();
        if (!review.passed && attempt < 2) throw new Error(`원본 대조: ${review.issues.join(" / ")}`);
        // 시각 판정도 오판할 수 있다. 렌더 가능한 결과는 경고와 함께 사람이 검수한다.
        return { dataUrl: svgDataUrl(svg), engineSvg: rendered.svg, engineSpec: result.spec,
          engineModel: result.model, originalDataUrl: figureCrop,
          ...(!review.passed ? { reviewWarnings: review.issues.length ? review.issues : ["원본 대조가 필요합니다."] } : {}) };
      } catch (error) {
        const status = (error as { status?: number }).status;
        if (attempt === 2 || cancelled() || error instanceof DeadlineError || status === 401 || status === 403 || (status && status >= 500)) throw error;
        previousSpec = result.spec;
        renderError = (error as Error).message;
      }
    }
    throw new Error("도형 재작도에 실패했습니다.");
    })(), 240_000, "도형 재작도가 오래 걸려 원본 그림을 유지했습니다. 그림 편집에서 다시 시도할 수 있습니다.", () => { expired = true; });
  });
}

/** questionCrop is already the first crop. Inspected boxes bypass detection, including an empty list. */
export async function redrawQuestionFigures(questionCrop: string, problem: OCRProblem, cancelled = () => false, inspectedFigures?: Figure[],
  onUpdate?: (problem: OCRProblem) => void): Promise<OCRProblem> {
  if (cancelled()) return problem;
  onUpdate?.({ ...problem, figureProgress: "그림 위치 확인 중" });
  let detected: Figure[];
  try {
    detected = inspectedFigures ?? await detectQuestionFigures(questionCrop);
    if (cancelled()) return problem;
    if (!detected.every(validFigure)) throw new Error("그림 좌표가 올바르지 않습니다.");
  } catch (error) {
    return { ...problem, status: "warn", figureWarnings: [`그림 분리 실패: ${(error as Error).message}`] };
  }
  if (!detected.length) {
    const expected = !!problem.images?.length || /\[그림\d+\]|<svg\b/.test(problem.text);
    const cleared = inspectedFigures ? { ...problem, images: [], figures: [], diagramParams: undefined } : problem;
    return expected ? { ...cleared, status: "warn", figureWarnings: ["본문에 그림 표시가 있지만 내부 그림을 찾지 못했습니다. 크롭을 확인해 주세요."] } : cleared;
  }
  const images: OCRImage[] = [];
  const warnings: string[] = [];
  for (const figure of detected) {
    if (cancelled()) return problem;
    // Detector already includes padding. Zero extra margin keeps the exact box mapping.
    const originalDataUrl = await withDeadline(cropPageImageData(questionCrop, figure.box, { margin: 0 }), 10_000, "원본 그림 크롭이 지연되었습니다.");
    if (cancelled()) return problem;
    const image: OCRImage = { box: figure.box, label: figure.label, source: "ai-crop", dataUrl: originalDataUrl, originalDataUrl };
    images.push(image);
  }
  if (cancelled()) return problem;
  // Gemini transcription places markers in reading order. Preserve typed blocks and choices.
  let text = problem.text;
  let blocks = problem.blocks;
  if (Array.from(text.matchAll(/\[그림(\d+)\]/g)).some(m => Number(m[1]) > images.length)) {
    warnings.push("본문의 그림 표시 수와 검출한 그림 수가 다릅니다. 원본과 비교해 주세요.");
  }
  for (let i = 0; i < images.length; i++) {
    const marker = `[그림${i + 1}]`;
    if (!text.includes(marker)) {
      text += `\n\n${marker}`;
      if (blocks) blocks = [...blocks, { type: "text", value: marker, rows: [] }];
    }
  }
  const snapshot = (figureProgress?: string): OCRProblem => ({ ...problem, text, blocks, images: [...images], diagramParams: undefined,
    figures: images.map(im => ({ box: im.box, label: im.label, kind: "crop" })),
    figureProgress, figureWarnings: warnings.length ? [...warnings] : undefined, status: warnings.length ? "warn" : problem.status });
  // Publish every original crop before waiting for the serial Opus queue.
  onUpdate?.(snapshot("원본 그림 준비 완료"));
  for (let i = 0; i < detected.length; i++) {
    if (cancelled()) return snapshot();
    const figure = detected[i];
    if (figure.kind !== "diagram") continue;
    try {
      const { reviewWarnings, ...rendered } = await redrawFigureCrop(images[i].originalDataUrl!, {
        cancelled, onProgress: stage => onUpdate?.(snapshot(`도형 ${i + 1}/${detected.length} · ${stage}`)),
      });
      if (cancelled()) return snapshot();
      images[i] = { ...images[i], ...rendered };
      if (reviewWarnings?.length) warnings.push(`${figure.label || "그림"}: 원본 대조 확인 필요 — ${reviewWarnings.join(" / ")} (그림 편집에서 원본과 비교해 주세요)`);
    } catch (error) {
      if (cancelled()) return snapshot();
      warnings.push(`${figure.label || "그림"}: ${(error as Error).message} (원본 크롭 유지)`);
    }
    onUpdate?.(snapshot(i + 1 < detected.length ? "다음 그림 처리 중" : undefined));
  }
  return snapshot();
}
