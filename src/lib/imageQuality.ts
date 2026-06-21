// imageQuality.ts — 이미지 품질 점수 (testchange core/quality_checker.py 포팅, D17).
//
// OCR 백엔드 라우팅(clean/messy)용 — testchange `_page_backend`:
//   clean = born OR QC_score >= QC_CLEAN_SCORE(70) → gemini-flash(저렴),
//   messy(저품질/바랜 스캔) → gemini-pro(충실도 우선).
//
// Canvas API 기반(0 의존성). 픽셀 *측정만* (무변형). quality_checker.py 의 4 검사
// (해상도/Laplacian 흐림/비백색 빈페이지/Otsu 대비분리)를 그대로 이식.

// testchange config.json / utils/config.py 와 동일 임계값.
const QC_MIN_WIDTH = 500;
const QC_MIN_HEIGHT = 500;
const QC_BLUR_THRESHOLD = 100.0; // Laplacian 분산 (미만 흐림)
const QC_BLANK_THRESHOLD = 1.0; // 비백색 픽셀 % (미만 빈 페이지)
const QC_CONTRAST_THRESHOLD = 30.0; // Otsu 전경/배경 분리 (미만 저대비)
/** 라우팅 clean 컷오프 — score≥70 이면 clean(flash) (testchange QC_CLEAN_SCORE). */
export const QC_CLEAN_SCORE = 70.0;

/** dataUrl → canvas (imagePreprocess.loadDataUrlToCanvas 와 동일 패턴). */
const loadDataUrlToCanvas = async (dataUrl: string): Promise<HTMLCanvasElement> => {
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

/** RGBA ImageData → 그레이스케일(L, 0–255) — PIL convert("L") = 0.299R+0.587G+0.114B. */
const toGray = (data: Uint8ClampedArray, n: number): Float64Array => {
  const gray = new Float64Array(n);
  for (let i = 0, p = 0; p < n; i += 4, p++) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  return gray;
};

/** `_compute_laplacian_variance` — 3x3 Laplacian([[0,1,0],[1,-4,1],[0,1,0]]) edge-pad 분산. */
const laplacianVariance = (gray: Float64Array, w: number, h: number): number => {
  const n = w * h;
  let sum = 0;
  const lap = new Float64Array(n);
  for (let y = 0; y < h; y++) {
    const yUp = y > 0 ? y - 1 : 0;
    const yDn = y < h - 1 ? y + 1 : h - 1;
    for (let x = 0; x < w; x++) {
      const xL = x > 0 ? x - 1 : 0;
      const xR = x < w - 1 ? x + 1 : w - 1;
      const c = gray[y * w + x];
      const v =
        gray[yUp * w + x] +
        gray[yDn * w + x] +
        gray[y * w + xL] +
        gray[y * w + xR] -
        4 * c;
      lap[y * w + x] = v;
      sum += v;
    }
  }
  const mean = sum / n;
  let varSum = 0;
  for (let i = 0; i < n; i++) {
    const d = lap[i] - mean;
    varSum += d * d;
  }
  return varSum / n;
};

/** `_compute_non_white_ratio` — 밝기((R+G+B)/3)<240 픽셀 비율 %. */
const nonWhiteRatio = (data: Uint8ClampedArray, n: number): number => {
  let nonWhite = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 240) nonWhite++;
  }
  return (nonWhite / n) * 100;
};

/** `_otsu_threshold` — 클래스간 분산 최대화 임계값 (numpy 벡터화 → JS 루프). */
const otsuThreshold = (gray: Float64Array, n: number): number => {
  const hist = new Float64Array(256);
  for (let i = 0; i < n; i++) {
    let g = Math.round(gray[i]);
    if (g < 0) g = 0;
    else if (g > 255) g = 255;
    hist[g]++;
  }
  let sumTotal = 0;
  for (let t = 0; t < 256; t++) sumTotal += t * hist[t];
  let wB = 0;
  let sumB = 0;
  let maxVar = -1;
  let threshold = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumTotal - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > maxVar) {
      maxVar = between;
      threshold = t;
    }
  }
  return threshold;
};

/** `_compute_contrast_separation` — Otsu 임계로 전경(≤t)/배경(>t) 나눠 평균밝기 차. */
const contrastSeparation = (gray: Float64Array, n: number, t: number): number => {
  let fgSum = 0;
  let fgCnt = 0;
  let bgSum = 0;
  let bgCnt = 0;
  for (let i = 0; i < n; i++) {
    const g = gray[i];
    if (g <= t) {
      fgSum += g;
      fgCnt++;
    } else {
      bgSum += g;
      bgCnt++;
    }
  }
  if (fgCnt === 0 || bgCnt === 0) return 0;
  return bgSum / bgCnt - fgSum / fgCnt;
};

/**
 * `check_image_quality` 포팅 — 0~100 품질 점수 반환 (페널티: 해상도 −30, 흐림 −40,
 * 빈페이지 −50, 저대비 −25). 측정 불가(canvas 실패) 시 100(clean 가정).
 * 라우팅: clean = born OR score≥QC_CLEAN_SCORE(70).
 */
export const checkImageQuality = async (dataUrl: string): Promise<number> => {
  let canvas: HTMLCanvasElement;
  try {
    canvas = await loadDataUrlToCanvas(dataUrl);
  } catch {
    return 100;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return 100;
  const w = canvas.width;
  const h = canvas.height;
  const n = w * h;
  if (n === 0) return 100;
  const data = ctx.getImageData(0, 0, w, h).data;
  const gray = toGray(data, n);

  let score = 100;
  if (w < QC_MIN_WIDTH || h < QC_MIN_HEIGHT) score -= 30;
  if (laplacianVariance(gray, w, h) < QC_BLUR_THRESHOLD) score -= 40;
  if (nonWhiteRatio(data, n) < QC_BLANK_THRESHOLD) score -= 50;
  const t = otsuThreshold(gray, n);
  if (contrastSeparation(gray, n, t) < QC_CONTRAST_THRESHOLD) score -= 25;
  return score;
};
