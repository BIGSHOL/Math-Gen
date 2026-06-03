// imagePreprocess.ts — OCR 호출 전 이미지 전처리 (CLAUDE.md §28-1).
//
// 사용자 보고 (2026-05-27): 손글씨 인접 + 작은 치수 라벨 + 흐릿한 스캔 → OCR
// 정확도 ↓. 모델 교체 없이 *입력 이미지 자체* 를 정제해 정확도 부스트.
//
// **3 단계 chain** (모두 Canvas API 기반, 0 의존성):
//   1. removeColorInk  — 빨간/파란 마커 잉크 → 흰색 (HSL 기반 채도 검사)
//   2. boostContrast   — auto-contrast (어두운 부분 더 어둡게, 밝은 부분 더 밝게)
//   3. upscaleImage    — 2x bilinear upscale (작은 글자 부스트)
//
// 호출 순서: `applyRotation` 직후 → `preprocessForOcr` → OCR 모델.

/** 이미지 dataUrl 을 HTMLCanvasElement 로 로드. */
const loadDataUrlToCanvas = async (
  dataUrl: string,
): Promise<HTMLCanvasElement> => {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context 획득 실패");
  ctx.drawImage(img, 0, 0);
  return canvas;
};

/**
 * RGB → HSL 변환 (한 픽셀). 채도/색조 검사로 *색 잉크* (빨강·파랑·녹색) 판별.
 * 회색조 (인쇄 검정) 는 saturation 낮음.
 */
const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l]; // 회색조
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
};

/**
 * 색 잉크 (학생 손글씨 마커) 제거 — 흰색으로 replace.
 *
 * 휴리스틱:
 *  - saturation > 0.25 (인쇄 회색 vs 컬러 잉크 분리)
 *  - lightness ∈ [0.15, 0.85] (너무 어두운 또는 너무 밝은 픽셀 제외)
 *  - hue: 빨강 (0-30, 330-360), 파랑 (200-260), 녹색 (90-150)
 *
 * 인쇄 검정 (saturation ~0) 과 종이 흰색 (lightness ~1) 은 보존.
 * 회색조 도형 (검은 라인) 도 보존.
 */
export const removeColorInk = async (dataUrl: string): Promise<string> => {
  const canvas = await loadDataUrlToCanvas(dataUrl);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const [h, s, l] = rgbToHsl(r, g, b);
    // 채도 + 밝기 검사 — 컬러 잉크일 가능성
    if (s < 0.25) continue; // 회색조 — 보존
    if (l < 0.15 || l > 0.85) continue; // 너무 어둡/밝음 — 보존
    // 색조 — 빨강/파랑/녹색만 마커 후보
    const isRed = h <= 30 || h >= 330;
    const isBlue = h >= 200 && h <= 260;
    const isGreen = h >= 90 && h <= 150;
    if (!isRed && !isBlue && !isGreen) continue;
    // 흰색으로 replace
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    // alpha 유지
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
};

/**
 * Auto-contrast — 흐릿한 스캔 부스트.
 *
 * 휴리스틱:
 *  - 픽셀 분포의 1% / 99% percentile 을 0/255 로 stretching (clamping)
 *  - 인쇄 검정은 더 어두워지고 종이 흰색은 더 밝아짐
 *  - 광학 스캐너의 grey haze 제거
 */
export const boostContrast = async (
  dataUrl: string,
  factor = 1.2,
): Promise<string> => {
  const canvas = await loadDataUrlToCanvas(dataUrl);
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  // contrast 함수: y = (x - 128) * factor + 128, clamp [0, 255]
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c];
      const next = Math.round((v - 128) * factor + 128);
      data[i + c] = Math.max(0, Math.min(255, next));
    }
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL("image/png");
};

/**
 * 2x bilinear upscale — 작은 글자/세선 가독성 부스트.
 *
 * Canvas `imageSmoothingQuality: "high"` 가 bilinear 이상의 sampling 적용.
 * Lanczos 자체 구현은 비용 + 복잡성 ↑ → 브라우저 native 가 충분.
 *
 * **주의 — 출력 크기**: 2x upscale 후 dataUrl 크기가 ~4x 커진다. OCR 모델의
 * 토큰 비용 / 응답 시간 증가. 작은 페이지 (≤ 1000x1500) 만 적용 권장.
 */
export const upscaleImage = async (
  dataUrl: string,
  factor = 2,
): Promise<string> => {
  const src = await loadDataUrlToCanvas(dataUrl);
  const dst = document.createElement("canvas");
  dst.width = src.width * factor;
  dst.height = src.height * factor;
  const ctx = dst.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, dst.width, dst.height);
  return dst.toDataURL("image/png");
};

/**
 * **OCR 전 종합 전처리** (CLAUDE.md §28-1 사용자 결정 반영).
 *
 * 적용 순서:
 *   1. removeColorInk  — 손글씨 잉크 (빨강·파랑·녹색) 흰색 replace
 *   2. boostContrast   — auto-contrast (factor 1.2)
 *   3. upscaleImage    — 2x bilinear (큰 페이지는 skip)
 *
 * 호출 위치: `applyRotation` 직후, `extractPageProblems` 직전.
 * Pass 1 (page 전체) + Pass 2 (cropped per problem) 양쪽 적용.
 *
 * **실패 시 원본 fallback** — best-effort, OCR 자체는 멈추지 않음.
 *
 * @param dataUrl 회전 적용된 dataUrl
 * @param opts.skipUpscale true 면 2x 미적용 (이미 큰 페이지)
 * @returns 전처리된 dataUrl, 실패 시 원본
 */
export const preprocessForOcr = async (
  dataUrl: string,
  opts: { skipUpscale?: boolean } = {},
): Promise<string> => {
  try {
    let result = dataUrl;
    // 1. 색 잉크 제거 (가장 비싼 단계 — 픽셀 순회 1회)
    result = await removeColorInk(result);
    // 2. contrast boost (픽셀 순회 1회)
    result = await boostContrast(result, 1.2);
    // 3. upscale (선택적 — 이미 큰 이미지는 skip)
    if (!opts.skipUpscale) {
      // 자연 크기 검사 — 큰 이미지는 upscale 안 함 (토큰 비용 폭발 회피)
      const probe = new Image();
      await new Promise<void>((resolve) => {
        probe.onload = () => resolve();
        probe.onerror = () => resolve();
        probe.src = result;
      });
      // 가로 또는 세로 > 2000 px 이면 upscale 안 함 (이미 충분)
      if (probe.naturalWidth <= 2000 && probe.naturalHeight <= 2000) {
        result = await upscaleImage(result, 2);
      }
    }
    return result;
  } catch (err) {
    if (import.meta.env?.DEV) {
      console.warn(
        "[imagePreprocess] preprocessForOcr 실패 — 원본 사용:",
        (err as Error).message,
      );
    }
    return dataUrl;
  }
};

/**
 * base64 dataUrl 의 실제 byte 수 추정 (디코드 없이 — base64 4char→3byte).
 * Storage 업로드 사전 크기 체크용.
 */
export const estimateDataUrlBytes = (dataUrl: string): number => {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
};

/** canvas 를 scale 배율로 축소한 새 canvas. ctx 획득 실패 시 원본 반환. */
const scaleCanvas = (src: HTMLCanvasElement, scale: number): HTMLCanvasElement => {
  const dst = document.createElement("canvas");
  dst.width = Math.max(1, Math.round(src.width * scale));
  dst.height = Math.max(1, Math.round(src.height * scale));
  const ctx = dst.getContext("2d");
  if (!ctx) return src;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, dst.width, dst.height);
  return dst;
};

/**
 * Storage 업로드용 압축 — page-images 버킷 크기 한도(schema-storage.sql)를 넘는
 * 페이지만 JPEG 재인코딩 + 필요 시 다운스케일해서 한도 아래로 맞춘다.
 *
 * 사용자 보고 (2026-06-04): "The object exceeded the maximum allowed size" —
 * 무손실 PNG 스캔본이 버킷 한도 초과 → silent 400. **원본 PNG 는 IndexedDB 에
 * 그대로** 두므로 (초기 OCR 품질 영향 0), 클라우드 사본만 압축 (hydrate 표시·
 * lazy 재OCR 용). 한도 초과 페이지에만 호출돼 *정상 크기 페이지는 품질 손실 0*.
 *
 * 단계: (1) 긴 변 maxDim 초과면 다운스케일 → (2) JPEG quality 단계 하향으로
 * maxBytes 충족 → (3) 그래도 크면 0.7배 추가 축소 + 최저 quality.
 */
export const compressForStorage = async (
  dataUrl: string,
  opts: { maxBytes?: number; maxDim?: number } = {},
): Promise<string> => {
  const maxBytes = opts.maxBytes ?? 9_000_000;
  const maxDim = opts.maxDim ?? 3000;
  const src = await loadDataUrlToCanvas(dataUrl);
  let canvas: HTMLCanvasElement = src;
  const longest = Math.max(src.width, src.height);
  if (longest > maxDim) canvas = scaleCanvas(src, maxDim / longest);
  for (const q of [0.85, 0.78, 0.7, 0.62, 0.55]) {
    const out = canvas.toDataURL("image/jpeg", q);
    if (estimateDataUrlBytes(out) <= maxBytes) return out;
  }
  const smaller = scaleCanvas(canvas, 0.7);
  return smaller.toDataURL("image/jpeg", 0.55);
};
