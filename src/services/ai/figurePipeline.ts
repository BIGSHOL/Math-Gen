import type { OCRProblem, OCRImage } from "../../stores/wizardStore.js";
import { cropPageImageData } from "../../lib/pdfProcessor.js";
import { pLimit, withRetry } from "../../lib/concurrency.js";
import { currentAccessToken } from "../api/supabase.js";

type Box = [number, number, number, number];
interface Figure { box: Box; label: string; kind: "diagram" | "table" | "artwork" }
const figureLimit = pLimit(1);
async function post<T>(route: string, body: object): Promise<T> {
  const token = await currentAccessToken();
  const response = await fetch(`/api/${route}`, { method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!response.ok) {
    const error = new Error(json.error || `HTTP ${response.status}`);
    Object.assign(error, { status: response.status, headers: { "retry-after": response.headers.get("retry-after") } });
    throw error;
  }
  return json as T;
}
export function validFigure(value: unknown): value is Figure {
  if (!value || typeof value !== "object") return false;
  const { box, kind, label } = value as Figure;
  return typeof label === "string" && ["diagram", "table", "artwork"].includes(kind) && Array.isArray(box) && box.length === 4
    && box.every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1000)
    && box[2] > box[0] && box[3] > box[1];
}
const svgDataUrl = (svg: string) => `data:image/svg+xml;base64,${btoa(Array.from(new TextEncoder().encode(svg), b => String.fromCharCode(b)).join(""))}`;

/** questionCrop is already the first crop. Only the second crop reaches Opus. */
export async function redrawQuestionFigures(questionCrop: string, problem: OCRProblem, cancelled = () => false): Promise<OCRProblem> {
  if (cancelled()) return problem;
  let detected: Figure[];
  try {
    const response = await post<{ figures: unknown[] }>("ai-figure-detect", { questionCrop });
    if (cancelled()) return problem;
    if (!response.figures.every(validFigure)) throw new Error("그림 좌표가 올바르지 않습니다.");
    detected = response.figures as Figure[];
  } catch (error) {
    return { ...problem, status: "warn", figureWarnings: [`그림 분리 실패: ${(error as Error).message}`] };
  }
  if (!detected.length) {
    const expected = !!problem.images?.length || /\[그림\d+\]|<svg\b/.test(problem.text);
    return expected ? { ...problem, status: "warn", figureWarnings: ["본문에 그림 표시가 있지만 내부 그림을 찾지 못했습니다. 크롭을 확인해 주세요."] } : problem;
  }
  const images: OCRImage[] = [];
  const warnings: string[] = [];
  for (const figure of detected) {
    if (cancelled()) return problem;
    // Detector already includes padding. Zero extra margin keeps the exact box mapping.
    const originalDataUrl = await cropPageImageData(questionCrop, figure.box, { margin: 0 });
    if (cancelled()) return problem;
    const image: OCRImage = { box: figure.box, label: figure.label, source: "ai-crop", dataUrl: originalDataUrl, originalDataUrl };
    if (figure.kind === "diagram") {
      try {
        await figureLimit(async () => {
          if (cancelled()) return;
          let previousSpec: object | undefined;
          let renderError: string | undefined;
          for (let attempt = 0; attempt < 2; attempt++) {
            const result = await withRetry(() => {
              if (cancelled()) throw new DOMException("Cancelled", "AbortError");
              return post<{ spec: object | null; note?: string; model: string }>("ai-figure", {
                figureCrop: originalDataUrl, previousSpec, renderError,
              });
            }, { maxRetries: 2 });
            if (cancelled()) return;
            if (!result.spec) throw new Error(result.note || "도형 엔진으로 재현할 수 없습니다.");
            try {
              const rendered = await post<{ svg: string }>("figure-render", { spec: result.spec });
              if (cancelled()) return;
              if (!rendered.svg?.startsWith("<svg")) throw new Error("도형 엔진의 SVG 응답이 올바르지 않습니다.");
              image.dataUrl = svgDataUrl(rendered.svg);
              image.engineSvg = rendered.svg;
              image.engineSpec = result.spec;
              image.engineModel = result.model;
              return;
            } catch (error) {
              if (attempt === 1) throw error;
              previousSpec = result.spec;
              renderError = (error as Error).message;
            }
          }
        });
      } catch (error) { warnings.push(`${figure.label || "그림"}: ${(error as Error).message} (원본 크롭 유지)`); }
    }
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
  return { ...problem, text, blocks, images, diagramParams: undefined,
    figures: images.map(im => ({ box: im.box, label: im.label, kind: "crop" })),
    figureWarnings: warnings.length ? warnings : undefined, status: warnings.length ? "warn" : problem.status };
}
