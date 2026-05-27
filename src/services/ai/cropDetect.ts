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
  /**
   * 4-class crop 분류 (모델 1차 분류, 사용자 Step 1.5 에서 수동 변경 가능):
   *  - "problem": 한 문항 전체 — 텍스트 + 모든 내부 시각 요소 포함.
   *  - "figure":  vectorize 가능한 *기하 작도* (정사각형 + 대각선, 좌표축 + 곡선,
   *               Venn diagram, 수직선 등). 한 문항 안의 *부속 요소*.
   *  - "table":   bordered grid (시간표, 점수표, 달력).
   *  - "artwork": vectorize *불가능* 한 *실사 reference* — 회화 thumbnail
   *               (예: 반 고흐 "고흐의 의자"), 사진, 풍경, 실험기구 도면.
   *               SVG 시도 X, 이미지 crop 만.
   *
   * undefined = 모델이 분류 누락 (옛 응답 호환) → 클라이언트에서 "problem" default.
   */
  class?: "problem" | "figure" | "table" | "artwork";
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
          class: {
            type: "string",
            enum: ["problem", "figure", "table", "artwork"],
            description:
              "Crop class: 'problem'=whole problem (default for one box per problem), 'figure'=geometric/graph figure (vectorizable line art only — but normally use 'problem' to keep everything together), 'table'=bordered grid, 'artwork'=real-world artwork/photo/painting reference (NOT vectorizable, image crop only). For a problem that *contains* a Van Gogh painting thumbnail AND a geometric figure, emit ONE 'problem' box covering everything; the artwork detection is handled downstream. Use 'artwork' ONLY when an image is referenced WITHOUT a containing problem (rare).",
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
        required: ["number", "type", "class", "cropBox", "endMarkerKind", "note"],
      },
    },
  },
  required: ["items"],
} as const;

/** 크롭 경계 검출 프롬프트 — 객관식·서술형 경계 규칙을 강제. */
const CROP_DETECT_PROMPT = `You are analyzing ONE page of a Korean math exam. For EVERY problem on the page, output a crop box that tightly encloses the whole problem.

Coordinate system: [yMin, xMin, yMax, xMax] on a 0-1000 grid over the FULL PAGE. yMin = top edge, xMin = left edge, 1000 = bottom / right edge.

Page layout: Korean exam pages are usually TWO COLUMNS. Read the LEFT column top-to-bottom first, then the RIGHT column. A problem stays entirely within ONE column — never let a crop box span both columns.

🚨 **CRITICAL — DISTINGUISH PRINTED PROBLEM CONTENT FROM STUDENT HANDWRITING (글자체·획 특성 기반)**

Korean exam papers are often photographed AFTER a student has written on them. The PRINTED text and the HANDWRITTEN ink have **dramatically different visual character** — use these traits to tell them apart:

**PRINTED content** (problem text, figures, numbers) — the ONLY thing that belongs in the crop box:
  - **Stroke uniformity**: every glyph has *consistent, even-thickness* strokes (typeset font output — width within 10% along a stroke).
  - **Color**: pure black ink, no red/blue/green pigment.
  - **Geometry**: characters sit on a strict baseline grid; letterforms are *geometric and repeatable* (every "ㅇ" looks identical, every "5" looks identical).
  - **Alignment**: text wraps in straight columns; figures have crisp clean line art.

**STUDENT HANDWRITING** (solutions, scribbles, circled answers) — MUST be EXCLUDED from every crop box:
  - **Stroke variability**: 굵기가 *들쭉날쭉* — same pen produces 1px and 3px within the same stroke (pen pressure variation). Stroke ends often taper or blob.
  - **Color**: typically red marker (사용자 정답·답안 동그라미), blue ballpoint (풀이식), or *uneven* black (compared to print's pure black).
  - **Irregular character shape**: every "x" looks slightly different, every digit "5" has its own quirks; characters often slanted, not on a baseline; size variation within one expression.
  - **Free-form curves**: circled numbers (사용자가 정답 표시), arrows pointing into the problem, factor trees with diagonal lines, freehand "=" lines or check marks.
  - **Location**: typically in the *blank space below the (N점) marker* or *between problems*, where the student answered.

Common student handwriting to IGNORE:
  - Red/blue pen scribbles in the answer space below the problem
  - Circled numbers (사용자 정답 표시) drawn over or beside the problem
  - Freehand calculations, factoring trees, arrows pointing at the problem
  - Numbers written in the blank space between problems (e.g. "64", "36 3", "9 81" written between two printed problems)
  - 빨간 마커로 그린 동그라미 (학생이 자신의 풀이 답을 표시) — 절대 박스 안에 포함 X

The space where the student wrote is BELOW the printed problem's last text/figure line. The crop MUST end at that last printed line — NOT extend into the handwriting zone.

🚨 **사용자 보고 사례 — 서술형 4 (반 고흐 작품 작도 문제, 2026-05-27)**:
  원본 페이지에 다음 4 요소가 *세로로 인접* 배치:
    1. [서술형 4] 문항 — 인쇄 텍스트 + 인쇄 도형 (정사각형·평행사변형 ABDE 작도)
    2. 위 문항 안의 *반 고흐 작품 thumbnail* — 인쇄된 회화 reference (검은 hatching, vectorize 불가)
    3. (그 아래 페이지의 다른 문항 [서술형 3] 풀이 영역)
    4. 학생이 빈 풀이 영역에 빨간 마커로: "(x-3)(x+1)" + 큰 동그라미 + "2√3 × √2 = 2√6"
  잘못된 크롭: [서술형 4] 박스가 아래로 늘어나서 빨간 마커 손글씨 흡수 → 박스 안 영역이 *완전히 다른 문항 + 학생 풀이* 가 됨.
  올바른 크롭: [서술형 4] 박스 bottom = 인쇄된 마지막 도형 라벨/괄호 줄. 아래 학생 손글씨는 *전혀* 박스 안에 들어가지 X. **빨간 마커 색상이 보이면 즉시 박스 bottom 끌어올림**.

---

🎨 **4-CLASS CROP CLASSIFICATION (class field)**:

거의 모든 박스는 class="problem" (한 문항 전체 — 텍스트 + 모든 내부 시각 요소 포함). 다음은 *드문* 예외:

  - **"figure"**: 페이지에 *문제와 분리된 standalone 기하 도형* 이 있을 때 (예: 페이지 상단 안내 도해, 페이지 중간 참고 그림). 일반적인 *문항 안의 도형* 은 problem 박스에 *포함* — 별도 figure 박스 X.

  - **"table"**: 페이지에 *문제와 분리된 standalone 표* (시간표/달력/점수표). 문항 안의 표는 problem 박스 안.

  - **"artwork"**: 페이지에 *문제와 분리된 standalone 회화/사진/실사 이미지* (예: 작품 전시 페이지). vectorize 불가능 (회화·사진은 SVG 로 재현 불가). 문항 안에서 작품을 referencing 하면 problem 박스 안에 *포함* — 별도 artwork 박스 X.

  - **"problem"** (default, 99% case): 한 문항 전체. 안에 어떤 시각 요소 (도형·표·작품 reference) 가 있어도 problem 박스 안에 모두 포함.

🚨 결정 룰 (의심 시 "problem"):
  - 박스가 문항 번호 ([서술형 N], 1., 2. 등) 를 포함하면 → "problem"
  - 그 외 페이지 영역에 standalone 시각 요소만 있을 때 → 위 3 분류
  - artwork 와 figure 의 차이: artwork = 실사 회화·사진 (vectorize 불가), figure = 깨끗한 line art (vectorize 가능)

For each problem, decide its TYPE and find its crop box:

1. CHOICE problem (객관식 — has multiple-choice options ① ② ③ ④ ⑤):
   - Crop TOP = the line of the printed problem number.
   - Crop BOTTOM = the bottom of the LAST option row (the row holding the highest marker — usually ⑤, or ④ if only 4 options). Options may be one-per-line OR in a 2/3-column grid; the last marker is always in the last option row.
   - Any figure sits between the problem text and the options, so this box always contains it.
   - type = "choice", endMarkerKind = "choice".

2. SIMPLE ESSAY problem (서술형 — NO ①②③④⑤ options, NO sub-numbers like (1)(2); a single points marker like "(7점)" or "(8점)"):
   - Crop TOP = the line of the printed problem number ([서술형 N] or N. or similar).
   - Crop BOTTOM = the line containing the "(N점)" points marker.
   - 🚨 **HARD STOP at the (N점) line.** The space below it is where the student writes their solution — it is NOT part of the printed problem. Do NOT extend into that blank/handwritten zone.
   - 🚨 **IGNORE all student handwriting** in the answer space below: scribbled numbers, factor trees, circled answers, red pen marks. These are NEVER part of the problem.
   - EXCEPTION — printed figure (clean line art, uniform stroke, NOT handwriting): if a printed figure sits below the (N점) marker as part of the problem, extend the bottom to include the figure. Distinguish carefully: a printed geometry figure has consistent thin strokes and clean labels; student handwriting is rough freehand pen.
   - type = "essay", endMarkerKind = "points".

3. SPLIT ESSAY problem (서술형 with sub-numbered parts (1), (2), …):
   The WHOLE thing (problem header + all printed sub-parts) is ONE problem → ONE crop box.
   - Crop TOP = the line of the printed problem number.
   - Crop BOTTOM = the bottom of the LAST printed sub-part's text line (e.g., the line containing "(2) 완전제곱식을 이용하여 구하시오.").
   - 🚨 **Each sub-part may have its OWN points marker, OR the header may carry a single combined "(8점)" — both forms are valid.** Do NOT rely on a "[총 N점]" header (often absent). The end edge is determined by **the last printed sub-part number** (highest (n) seen), NOT by summing points.
   - 🚨 Sub-parts (1) (2) (3) are separated by BLANK SPACE on the printed page (so the student can solve each). That blank space — and any student handwriting in it — is INSIDE the single crop box (you cannot split sub-parts), BUT the box must STILL end at the last printed sub-part's text line, NOT at the bottom of the student's handwriting after sub-part (2).
   - 🚨 Recognize sub-part markers: "(1)" "(2)" "(3)" with the parenthesis. Distinguish from option markers "①②③" (different glyphs) and from inline "(N점)" (always has 점).
   - EXCEPTION — printed figure below the last sub-part text: include the figure (same rule as #2).
   - type = "essay", endMarkerKind = "total" (regardless of whether a [총 N점] header existed).

🚨 **사용자 보고 사례 (반드시 따를 것)**:

  사례 A — 서술형 2 (8점), 풀이 영역 침범 (잘못):
    원본: "[서술형 2] √(100-4x) − √(10+2y) 가 가장 큰 정수가 되도록 하는 자연수 x,y의 값과 그때의 가장 큰 정수를 구하고, 그 과정을 서술하시오. (8점)" + 빈 풀이 공간에 빨간 펜으로 "9 3 48" 학생 필기.
    잘못된 크롭: 박스가 "(8점)" 줄을 넘어 학생 필기 "48" 까지 포함.
    올바른 크롭: 박스 bottom = "(8점)" 줄. 그 아래 학생 필기는 박스 *밖*.

  사례 B — 서술형 3 (8점), (1)(2) 서브문항 + 학생 풀이:
    원본:
      "[서술형 3] x = √5 + 1일 때, x²-2x-3의 값을 구하려고 한다. 다음 제시된 두 가지 방법을 각각 이용하여 값을 구하고, 그 과정을 서술하시오. (8점)
       (1) 인수분해 공식을 이용하여 구하시오.
       [(1) 사이 학생 풀이: "(x-3)(x+1)" — 빨간 펜]
       (2) 완전제곱식을 이용하여 구하시오."
    올바른 크롭: 박스 top = "[서술형 3]" 줄, 박스 bottom = "(2) 완전제곱식을 이용하여 구하시오." 줄. (1) 과 (2) 사이 학생 필기는 박스 *안에* 들어가지만 (sub-parts 사이 cut 불가능), bottom edge 는 (2) 의 인쇄 텍스트 줄에서 정확히 끝남. (2) 아래 학생 풀이 영역은 박스 *밖*.

  사례 C — 통합 (8점) 헤더 형식 (사례 B 형식):
    문제 헤더에 "(8점)" 이 있고 (1)(2) 각각에는 배점 없음 — 이 경우 endMarkerKind = "total" 로 처리.
    합산 배점 검증 X — 마지막 (n) 마커 발견이 기준.

Rules:
- Bias toward OVER-cropping *horizontally* (LEFT edge must include the printed number; RIGHT edge must include the rightmost content). Pad ~15 units on left/right.
- Bias toward UNDER-cropping *vertically* on the bottom for essay problems — never extend past the last printed problem element (last sub-part text, last (N점), last printed figure) into the student's answer space.
- Only emit boxes for actual printed problems — never for empty answer space, the page header, or page furniture.
- Output strictly the given JSON schema. In "note", briefly state what set the bottom edge (e.g., "⑤ bottom-right", "(8점) line", "last sub-part (2)").`;

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
