/**
 * 크롭 경계 검출 — "cropped Pass 2" 사전 검증용 (CropTestScreen `?croptest` 전용).
 *
 * 한 페이지 이미지에서 문항별 크롭 박스를 산출한다. 프로덕션 OCR
 * (`OCR_PAGE_PROMPT` / `extractPageProblems`) 과 완전히 분리된 독립 모듈 —
 * 크롭 정확도를 눈으로 측정해 cropped Pass 2 본구현 여부를 판단하기 위한 도구.
 *
 * 경계 규칙 (한국 시험 문항의 또렷한 텍스트 마커 기반):
 *  - 객관식      : [문항번호 상단 → 마지막 보기 ⑤ 행 하단]
 *  - 단순 서술형 : [번호 → (N점) 배점 마커]
 *  - 분할 서술형 : [번호 → 하위 배점 누적이 [총 N점] 에 도달하는 마지막 하위문항]
 *
 * Gemini 3 Flash structured-output 호출. 0–1000 정규화 bbox 는 Gemini 의
 * 강점이고 `OCR_PAGE_SCHEMA` 의 `images[].box` 와 동일 포맷이다.
 */

import { getGeminiClient, GEMINI_3_FLASH } from "./gemini";
import { parseDataUrl } from "./sanitize";
import { toGeminiSchema, parseJsonOrThrow, friendlyGeminiError } from "./ocr";
import { stripCodeFences } from "./generate";

/** 0–1000 정규화 bbox `[yMin, xMin, yMax, xMax]` (OCR_PAGE_SCHEMA `images[].box` 동일). */
export type CropBox = readonly [number, number, number, number];

export interface DetectedCrop {
  /** 인쇄된 문항 번호 (객관식 1·2…, 서술형 1·2…). */
  number: number;
  /** 객관식(보기 ①②③④⑤ 있음) / 서술형(보기 없음). */
  type: "choice" | "essay";
  /** 크롭 박스 — 0–1000 정규화 [yMin, xMin, yMax, xMax]. 길이 4 보장 안 됨(모델 출력). */
  cropBox: number[];
  /** 끝 경계를 무엇이 결정했는지 (디버그). */
  endMarkerKind: "choice" | "points" | "total";
  /** 모델이 본 끝 마커 설명 (디버그 — 어느 규칙이 작동했는지). */
  note: string;
}

/** 검출 결과 JSON 스키마 — Gemini structured output 강제. */
const CROP_DETECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      description: "Every problem on the page, in visual reading order.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          number: { type: "integer", description: "Printed problem number." },
          type: {
            type: "string",
            enum: ["choice", "essay"],
            description: "'choice' if the problem has multiple-choice options, else 'essay'.",
          },
          cropBox: {
            type: "array",
            description:
              "Crop box [yMin, xMin, yMax, xMax] on a 0-1000 grid over the FULL PAGE.",
            items: { type: "number" },
          },
          endMarkerKind: {
            type: "string",
            enum: ["choice", "points", "total"],
            description:
              "What set the bottom edge: 'choice' = last option marker; 'points' = a (N점) marker; 'total' = sub-part points summed to [총 N점].",
          },
          note: {
            type: "string",
            description:
              "Short note on the end marker seen, for debugging (e.g. '⑤ bottom-right', '(7점)', '[총 6점]=3+3').",
          },
        },
        required: ["number", "type", "cropBox", "endMarkerKind", "note"],
      },
    },
  },
  required: ["items"],
} as const;

/** 크롭 경계 검출 프롬프트 — 객관식·서술형 경계 규칙을 강제. */
const CROP_DETECT_PROMPT = `You are analyzing ONE page of a Korean math exam. For EVERY problem on the page, output a crop box that tightly encloses the whole problem.

Coordinate system: [yMin, xMin, yMax, xMax] on a 0-1000 grid over the FULL PAGE. yMin = top edge, xMin = left edge, 1000 = bottom / right edge.

Page layout: Korean exam pages are usually TWO COLUMNS. Read the LEFT column top-to-bottom first, then the RIGHT column. A problem stays entirely within ONE column — never let a crop box span both columns.

For each problem, decide its TYPE and find its crop box:

1. CHOICE problem (객관식 — has multiple-choice options ① ② ③ ④ ⑤):
   - Crop TOP = the line of the printed problem number.
   - Crop BOTTOM = the bottom of the LAST option row (the row holding the highest marker — usually ⑤, or ④ if only 4 options). Options may be one-per-line OR in a 2/3-column grid; the last marker is always in the last option row.
   - Any figure sits between the problem text and the options, so this box always contains it.
   - type = "choice", endMarkerKind = "choice".

2. SIMPLE ESSAY problem (서술형 — NO ①②③④⑤ options; a single points marker like "(7점)"):
   - Crop TOP = the problem number line. Crop BOTTOM = the line of the "(N점)" points marker.
   - If a figure sits BELOW the (N점) marker, extend the bottom to include the whole figure.
   - type = "essay", endMarkerKind = "points".

3. SPLIT ESSAY problem (서술형 split into sub-parts (1), (2), … — a header declares a total like "[총 6점]" and each sub-part has its own "[3점]"):
   - The WHOLE thing (all sub-parts) is ONE problem → ONE crop box.
   - Crop TOP = the problem number line. Crop BOTTOM = the bottom of the sub-part where the running sum of sub-part points reaches the declared total (e.g. 3 + 3 = 6).
   - type = "essay", endMarkerKind = "total".

Rules:
- Bias toward OVER-cropping. Pad every box by ~15 units (0-1000 grid) on all four sides. The LEFT edge must include the printed problem number itself (the "9." / "10." digits), not start at the problem text. The RIGHT edge must reach past the rightmost content — text and figures often extend further right than they first appear. A box slightly too large is fine; a box that cuts off content is NOT.
- Only emit boxes for actual problems — never for empty answer space, the page header, or page furniture.
- Output strictly the given JSON schema. In "note", briefly state the end marker you saw.`;

/**
 * 컬럼별 여백 보강 상수 (모두 정규화 0–1000 그리드 기준).
 *  - LEFT_PAD  : 1단(또는 단일 컬럼) 박스의 좌측 확장 — 문항번호 잘림 방지.
 *  - RIGHT_PAD : 모든 박스의 우측 확장 — 소폭만. 과하면 1단이 거터를 넘어 2단 침범.
 *  - COLUMN_GAP_MIN : 정렬된 xMin 간격이 이 값 이상이면 단(段) 경계로 인정.
 */
const LEFT_PAD = 25;
const RIGHT_PAD = 15;
const COLUMN_GAP_MIN = 200;

/**
 * 검출 박스들의 좌측 끝(xMin) 분포에서 2단 분할선을 동적으로 추정.
 *
 * 단 경계는 시험지마다 달라 고정값을 쓸 수 없다. 한 컬럼의 문항들은 같은 좌측
 * 여백에 정렬돼 xMin 이 좁게 뭉친다 — 2단이면 xMin 이 두 무리로 갈리고 그 사이
 * 큰 간격이 생긴다. 정렬된 xMin 의 최대 간격이 COLUMN_GAP_MIN 이상이면 그 간격
 * 중점을 분할선으로, 아니면 단일 컬럼으로 보고 null 반환. (같은 컬럼 내 xMin
 * 흔들림 <50 vs 실제 단 경계 400+ 라 200 이 둘을 안전하게 가른다.)
 */
const estimateColumnSplit = (boxes: number[][]): number | null => {
  const xMins = boxes
    .filter((b) => Array.isArray(b) && b.length === 4 && Number.isFinite(b[1]))
    .map((b) => b[1])
    .sort((a, b) => a - b);
  if (xMins.length < 2) return null;
  let maxGap = 0;
  let splitAt = 0;
  for (let i = 1; i < xMins.length; i++) {
    const gap = xMins[i] - xMins[i - 1];
    if (gap > maxGap) {
      maxGap = gap;
      splitAt = (xMins[i] + xMins[i - 1]) / 2;
    }
  }
  return maxGap >= COLUMN_GAP_MIN ? splitAt : null;
};

/**
 * cropBox [yMin,xMin,yMax,xMax] 한 개에 좌·우 여백 적용 (0–1000 클램프).
 * split 이 null(단일 컬럼) 이거나 박스가 split 왼쪽(1단) 이면 좌측을 LEFT_PAD
 * 확장. 우측은 컬럼 무관 RIGHT_PAD.
 */
const padCropBox = (box: number[], split: number | null): number[] => {
  if (!Array.isArray(box) || box.length !== 4) return box;
  const [yMin, xMin, yMax, xMax] = box;
  const isLeftColumn = split == null || xMin < split;
  const paddedXMin = isLeftColumn ? Math.max(0, xMin - LEFT_PAD) : xMin;
  return [yMin, paddedXMin, yMax, Math.min(1000, xMax + RIGHT_PAD)];
};

/**
 * 페이지 이미지(base64 dataURL)에서 문항별 크롭 박스를 검출.
 * Gemini 3 Flash 단일 호출. 실패 시 한국어 friendly 메시지로 throw.
 */
export const detectCropBoxes = async (
  pageBase64: string,
  signal?: AbortSignal,
): Promise<DetectedCrop[]> => {
  const ai = getGeminiClient();
  const { data } = parseDataUrl(pageBase64);
  const mimeMatch = pageBase64.match(/^data:([^;]+);base64,/);
  const mimeType = mimeMatch?.[1] ?? "image/png";

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_3_FLASH,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data } },
            { text: CROP_DETECT_PROMPT },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        responseSchema: toGeminiSchema(CROP_DETECT_SCHEMA) as any,
        temperature: 0.1,
        maxOutputTokens: 8192,
        abortSignal: signal,
      },
    });

    const rawJson = typeof response.text === "string" ? response.text : "";
    if (!rawJson) throw new Error("[cropDetect] Gemini 빈 응답 — 텍스트 없음.");
    const parsed = parseJsonOrThrow<{ items?: DetectedCrop[] }>(
      stripCodeFences(rawJson),
    );
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const split = estimateColumnSplit(items.map((c) => c.cropBox));
    return items.map((c) => ({ ...c, cropBox: padCropBox(c.cropBox, split) }));
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    const raw = (err as Error).message ?? String(err);
    const wrapped = new Error(friendlyGeminiError(raw, GEMINI_3_FLASH));
    (wrapped as Error & { cause?: unknown }).cause = raw;
    throw wrapped;
  }
};
