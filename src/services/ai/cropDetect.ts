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

import { getGeminiClient, GEMINI_3_FLASH } from "./gemini.js";
import { getOpenAIClient, GPT_5_5_PRO } from "./openai.js";
import { parseDataUrl } from "./sanitize.js";
import { toGeminiSchema, parseJsonOrThrow, friendlyGeminiError } from "./ocr.js";
import { stripCodeFences } from "./generate.js";

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
  /**
   * 복잡도 분류 — Gemini Flash 가 1차 판단. complex 문항은 GPT-5.5 second pass
   * 로 bbox 정밀 재검출 (사용자 결정 2026-05-27).
   *
   * "complex" 기준:
   *  - 다중 시각 요소: 한 문항 안에 *2 종 이상 시각 요소* 공존 (artwork + figure,
   *    figure + table, 다중 도형). 예: 서술형 4 (반 고흐 작품 + 작도 도형).
   *  - 긴 서술형: 본문 200자+ 또는 (1)(2) sub-parts 가 있는 분할 서술형.
   *
   * "simple": 위 조건 미해당 — 객관식, 단일 도형 문항, 짧은 서술형.
   *
   * undefined = 옛 응답 호환 → 클라이언트에서 "simple" default (안전 fallback).
   */
  complexity?: "simple" | "complex";
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
          complexity: {
            type: "string",
            enum: ["simple", "complex"],
            description:
              "Complexity assessment for routing: 'complex' = (a) problem references TWO OR MORE distinct visual elements (e.g. an artwork thumbnail PLUS a geometric figure, OR figure + table, OR multiple figures), OR (b) it's a long 서술형 essay (200+ Korean characters in problem text, OR has (1)(2)... sub-parts). 'simple' = everything else (choice problems, single-figure essays, short essays). Complex problems will be re-analyzed by a stronger reasoning model (GPT-5.5) for bbox precision. Default toward 'simple' unless clearly complex.",
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
        required: ["number", "type", "class", "complexity", "cropBox", "endMarkerKind", "note"],
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

---

🧠 **COMPLEXITY CLASSIFICATION (complexity field) — GPT-5.5 routing**:

각 문항의 *분석 난이도* 를 평가. complex 문항은 *GPT-5.5 second pass* 로 bbox 정밀 재검출됨 (비용·시간 증가하지만 정확도 ↑).

**"complex"** (다음 둘 중 하나라도 해당):

  (a) **다중 시각 요소 — 한 문항 안에 *2 종 이상의 시각 요소* 공존**:
       - artwork + figure (회화 reference + 작도 도형. 예: 서술형 4 의 반 고흐 작품 + 평행사변형)
       - figure + table (도형 + 표)
       - 다중 figure (서로 다른 도형 2 개 이상 — before/after, 좌측/우측 도형 비교)
       - 도형 + 손글씨 인접 (학생 풀이가 도형 영역과 겹침)

  (b) **긴 서술형 — 본문 200자+** 또는 *(1)(2) sub-parts 분할 서술형*:
       - 사용자가 풀이 단계 / 조건 분석을 *명시적으로* 서술해야 하는 문항
       - cropDetect 가 sub-part 끝 boundary 판단 시 reasoning 필요

**"simple"** (위 조건 미해당):
  - 객관식 (① ② ③ ④ ⑤ 보기)
  - 단일 도형 문항 — 정사각형 1 개, 좌표축 1 개 등
  - 짧은 서술형 — 본문 100-150자, single figure
  - text-only 문항 (도형 없는 계산 문항)

🚨 보수적 default: **의심 시 "simple"** (불필요한 GPT-5.5 호출 비용 ~$0.05/페이지 회피). complex 는 *명백한 다중 요소* 또는 *길고 분할된 서술형* 에만 적용.

사용자 보고 사례 (2026-05-27 — 서술형 4):
  문항: "[서술형 4] 아래 왼쪽 그림은 반 고흐가 그린 '고흐의 의자'의 작품을 화면 분할한 그림이고, 그 옆의 도형은 화면 분할 무늬의 일부분이다..."
  - 좌측: 반 고흐 작품 thumbnail (artwork)
  - 우측: 평행사변형 ABDE 작도 (figure with √3, √2, √6 dashed arcs)
  - 학생 손글씨 인접 (빨간 마커 풀이)
  → **complexity = "complex"** (다중 시각 요소 + 손글씨 인접 + 200자+ 본문)
  → GPT-5.5 second pass 트리거 → bbox 정밀 재검출

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
 * GPT-5.5 Pro 정밀 *fresh* 재검출 프롬프트 — Gemini Flash 가 complexity="complex"
 * 로 표시한 문항들을 GPT-5.5 가 *처음부터* bbox 직접 검출.
 *
 * **사용자 결정 (2026-05-27)**: Gemini 의 bbox 결과를 *prompt 에 inject 하지 않음*
 * — bias 회피. 페이지 이미지 + complex 문항 번호 + 총 문항 수 만 제공해 GPT-5.5
 * 가 fresh detection 하도록.
 *
 * Gemini Flash 가 *대부분 케이스* 는 잘 처리하지만, 다중 시각 요소 + 손글씨 인접 +
 * 긴 서술형 sub-parts 같은 *복합 reasoning* 케이스에서 bbox 가 부정확한 경우가
 * 발생. GPT-5.5 의 강력한 scene understanding 으로 fresh detection.
 */
const REFINE_PROMPT_PREFIX = `You are detecting crop boxes for SPECIFIC complex problems on a Korean math exam page. A first-pass model already classified the problems on this page; the *complex* ones (multiple visual elements OR long essay 200+ chars with sub-parts) need YOUR more careful detection. You do NOT see the first-pass bboxes — detect them FRESH yourself.

Coordinate system: [yMin, xMin, yMax, xMax] on a 0-1000 grid over the FULL PAGE.

Page layout: Korean exam pages are usually TWO COLUMNS. Left column top-to-bottom first, then right.

🚨 CRITICAL RULES:

1. **STUDENT HANDWRITING MUST BE EXCLUDED** from every crop box. Use visual character traits:
   - Printed: uniform stroke, pure black, geometric repeatable shapes, baseline grid
   - Handwriting: variable stroke (1px↔3px), red/blue ink, irregular shapes, slanted, free-form curves
   - If you see red/blue ink inside a candidate bbox → SHRINK the bbox until ONLY printed content remains.

2. **For 다중 시각 요소 problems** (the main reason this fresh-pass exists):
   - The whole problem (text + ALL its visual elements: artwork + figure + table) goes in ONE box.
   - Box top = printed problem number ([서술형 N], 1., 2., …).
   - Box bottom = bottom of the LAST printed element (last sub-part text, last (N점) marker, last printed figure/artwork — whichever sits lowest on the page).
   - If an artwork thumbnail and a geometric figure sit side-by-side, the box must encompass BOTH horizontally.

3. **For long essay (200+ chars or sub-parts)**:
   - Box bottom = last printed sub-part text line (e.g., "(2) 완전제곱식을 이용하여 구하시오.")
   - The blank handwriting space between sub-parts IS inside the box (cannot split), but the box ENDS at the printed text — never extends into the post-(2) blank.

4. **사용자 보고 사례 [서술형 4]** (반 고흐 작품 + 작도 도형, 2026-05-27):
   원본: [서술형 4] 본문 + 좌측 반 고흐 작품 thumbnail + 우측 평행사변형 작도 + 빨간 마커 학생 풀이 (옆 문항)
   잘못된 출력: 박스가 아래로 늘어나서 학생 빨간 마커 풀이 흡수
   올바른 출력: 박스 bottom = 우측 평행사변형의 마지막 라벨 줄. 빨간 잉크 영역 절대 박스 안 X.

For each requested complex problem number, emit ONE entry with:
- number: the printed problem number
- type: "choice" if has ①②③④⑤ options, else "essay"
- class: "problem" (default — even if it contains artwork, the WHOLE problem box uses "problem")
- complexity: "complex" (these are the complex ones — that's why you're examining them)
- cropBox: precise [yMin, xMin, yMax, xMax]
- endMarkerKind: "choice" / "points" / "total"
- note: short reason for the bottom edge (e.g., "last sub-part (2)", "right-side parallelogram bottom")

Return ONLY the entries for the complex problem numbers below. NOT all problems on the page.`;

/**
 * GPT-5.5 정밀 재검출 — Gemini Flash 1차 결과에서 complexity="complex" 인 문항만
 * bbox 정밀 재검출. simple 문항은 Gemini 결과 그대로 보존 (cost·time 절약).
 *
 * 사용자 결정 (2026-05-27): 자동 트리거 + 다중 시각 요소/200자+ 기준 + 개별 교체.
 *
 * 실패 시 Gemini 결과 그대로 fallback (best-effort enhancement, not critical).
 *
 * @param pageBase64 페이지 이미지 (rotation 적용된 dataURL)
 * @param initialResults Gemini Flash 의 1차 결과 (모든 문항)
 * @param signal AbortSignal — 외부 cancel 신호
 * @returns merged DetectedCrop[] — complex 문항의 bbox 만 GPT-5.5 결과로 교체
 */
export const refineCropBoxesWithGpt55 = async (
  pageBase64: string,
  initialResults: DetectedCrop[],
  signal?: AbortSignal,
): Promise<DetectedCrop[]> => {
  // 1. complex 문항 찾기 — 없으면 즉시 return (no-op)
  const complexNumbers = initialResults
    .filter((r) => r.complexity === "complex")
    .map((r) => r.number);
  if (complexNumbers.length === 0) return initialResults;

  if (signal?.aborted) {
    throw new DOMException("Aborted before refine", "AbortError");
  }

  // 2. GPT-5.5 Responses API 호출
  const client = getOpenAIClient();
  const { data } = parseDataUrl(pageBase64);
  const mimeMatch = pageBase64.match(/^data:([^;]+);base64,/);
  const mimeType = mimeMatch?.[1] ?? "image/png";
  const dataUrl = `data:${mimeType};base64,${data}`;

  // 사용자 결정 (2026-05-27): Gemini bbox 결과 inject X — fresh detection.
  // 전체 문항 수 + complex 문항 번호만 전달. GPT-5.5 가 직접 페이지 examination.
  const totalNumbers = initialResults.map((r) => r.number).sort((a, b) => a - b);
  const promptText = `${REFINE_PROMPT_PREFIX}

──────────────────────────────────────────────────────────
PAGE CONTEXT (no bbox bias — detect FRESH):
- Total problems on this page: ${totalNumbers.length} (numbers: ${totalNumbers.join(", ")})
- COMPLEX problem numbers to detect: ${complexNumbers.join(", ")}
──────────────────────────────────────────────────────────

Examine the page image carefully. Locate the printed problem number markers (e.g. "[서술형 ${complexNumbers[0]}]" or "${complexNumbers[0]}.") for each complex problem above, then emit precise bboxes following the rules. Output the JSON schema (items array) with entries ONLY for the complex problem numbers.`;

  try {
    const response = await client.responses.create(
      {
        model: GPT_5_5_PRO,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: promptText },
              { type: "input_image", image_url: dataUrl, detail: "high" },
            ],
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "RefinedCropBoxes",
            schema: CROP_DETECT_SCHEMA as unknown as Record<string, unknown>,
            strict: true,
          },
        },
        // complex 문항만 (보통 1-3 개) 출력하지만, reasoning.effort="low" 라도
        // reasoning 토큰이 max_output_tokens 안에서 소진됨. 8192 → 16384 마진.
        max_output_tokens: 16384,
        reasoning: { effort: "low" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      { signal: signal ?? undefined },
    );

    // output_text fallback (Responses API pattern — CLAUDE.md §1-3)
    const r = response as {
      output_text?: string;
      output?: Array<{
        type?: string;
        content?: Array<{ type?: string; text?: string }>;
      }>;
      status?: string;
      incomplete_details?: { reason?: string };
    };
    let rawJson = r.output_text ?? "";
    if (!rawJson && Array.isArray(r.output)) {
      for (const item of r.output) {
        if (item.type !== "message" || !Array.isArray(item.content)) continue;
        for (const c of item.content) {
          if (
            (c.type === "output_text" || c.type === "text") &&
            typeof c.text === "string"
          ) {
            rawJson += c.text;
          }
        }
      }
    }
    if (!rawJson) {
      // reasoning 토큰 소진 또는 incomplete — Gemini 결과로 fallback
      if (import.meta.env?.DEV) {
        console.warn(
          "[cropDetect] GPT-5.5 refine 빈 응답 — Gemini 결과 유지.",
          r.incomplete_details,
        );
      }
      return initialResults;
    }

    const parsed = parseJsonOrThrow<{ items?: DetectedCrop[] }>(
      stripCodeFences(rawJson),
    );
    const refined = Array.isArray(parsed.items) ? parsed.items : [];

    // 3. Merge: complex 문항만 교체 (개별 교체), simple 은 Gemini 결과 그대로
    const refinedByNumber = new Map<number, DetectedCrop>();
    for (const r of refined) {
      if (typeof r.number === "number") refinedByNumber.set(r.number, r);
    }

    // 4. column-aware padding 재적용 (refined bbox 에도 동일 룰)
    const split = estimateColumnSplit(
      Array.from(refinedByNumber.values()).map((r) => r.cropBox),
    );

    return initialResults.map((orig) => {
      const refinedItem = refinedByNumber.get(orig.number);
      if (!refinedItem) return orig; // simple 문항 — 그대로
      // complex 문항 — refined bbox 로 교체. padding 재적용.
      return {
        ...refinedItem,
        cropBox: padCropBox(refinedItem.cropBox, split),
      };
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    // best-effort — GPT-5.5 실패 시 Gemini 결과 유지
    if (import.meta.env?.DEV) {
      console.warn(
        "[cropDetect] GPT-5.5 refine 실패 — Gemini 결과 유지.",
        (err as Error).message,
      );
    }
    return initialResults;
  }
};

/**
 * 페이지 이미지(base64 dataURL)에서 문항별 크롭 박스를 검출.
 * Gemini 3 Flash 단일 호출. 실패 시 한국어 friendly 메시지로 throw.
 */
const detectCropBoxesDirect = async (
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
        // 토큰 한도 — 한 페이지에 5-7 문항 × schema 의 7 required field
        // (number/type/class/complexity/cropBox/endMarkerKind/note) 합 ~150 tokens/문항.
        // class + complexity 추가 (2026-05-27) 후 8192 한도 초과 사례 발생 →
        // 응답 잘림 → invalid JSON → 처리 실패. callGemini 와 동일 65536 으로 상향.
        maxOutputTokens: 65536,
        abortSignal: signal,
      },
    });

    // CLAUDE.md §1-2 — Gemini 의 MAX_TOKENS 도달은 invalid JSON 으로만 보임.
    // parse 전에 finishReason 체크 → 명확한 한국어 에러로 변환.
    const finishReason = (
      response as { candidates?: Array<{ finishReason?: string }> }
    ).candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") {
      throw new Error(
        `Gemini 토큰 한도 초과 (페이지 분석 실패) — 손글씨/문항 과다. 재시도하세요.`,
      );
    }

    const rawJson = typeof response.text === "string" ? response.text : "";
    if (!rawJson) {
      // 빈 응답 — finishReason 별도 진단 메시지로 변환
      const reason = finishReason ?? "unknown";
      // SAFETY = AI 안전 필터, RECITATION = 모델 학습 데이터 그대로 emit, OTHER = 기타
      throw new Error(
        `Gemini 빈 응답 (finishReason=${reason}) — 재시도하세요.`,
      );
    }
    const parsed = parseJsonOrThrow<{ items?: DetectedCrop[] }>(
      stripCodeFences(rawJson),
    );
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const split = estimateColumnSplit(items.map((c) => c.cropBox));
    return items.map((c) => ({ ...c, cropBox: padCropBox(c.cropBox, split) }));
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    const raw = (err as Error).message ?? String(err);
    // 진짜 원인 추적 가능하도록 raw 도 friendly 안에 inline (디버그 어렵게 만든
    // 함정 — friendly 만 보면 "처리 실패" 만 보임). cropDetect 의 자체 에러는
    // 이미 한국어 → friendlyGeminiError 가 그대로 통과시킴.
    const friendly = raw.startsWith("[cropDetect]")
      ? raw
      : friendlyGeminiError(raw, GEMINI_3_FLASH);
    const wrapped = new Error(friendly);
    (wrapped as Error & { cause?: unknown }).cause = raw;
    throw wrapped;
  }
};

/**
 * 클라이언트 프로덕션 빌드 — `/api/ai-cropdetect` Vercel function 호출. prod
 * 빌드는 `process.env.GEMINI_API_KEY` 가 클라이언트 번들에 안 박혀(vite define
 * 제거) 직접 호출이 불가 → 이 함수 경유 (사용자 보고 2026-06-04: prod 에서
 * "GEMINI_API_KEY is not set"). dev (USE_API=false) 는 direct SDK.
 */
const detectCropBoxesViaApi = async (
  pageBase64: string,
  signal?: AbortSignal,
): Promise<DetectedCrop[]> => {
  if (signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }
  // Bearer 첨부 → 서버가 user/tenant 추출해 ai_usage 기록 (ocr.ts 와 동일 패턴).
  const { currentAccessToken } = await import("../api/supabase.js");
  const token = await currentAccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch("/api/ai-cropdetect", {
    method: "POST",
    headers,
    body: JSON.stringify({ pageBase64 }),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const json = (await res.json()) as { crops?: DetectedCrop[] };
  return json.crops ?? [];
};

/**
 * USE_API — 브라우저 PROD (또는 VITE_USE_API) 면 fetch path. 서버(Vercel
 * function) 에서는 window 없음 → false → direct (자기 호출 무한루프 방지).
 * ocr.ts USE_API 와 동일 정책.
 */
const USE_API: boolean =
  typeof window !== "undefined" &&
  typeof import.meta !== "undefined" &&
  Boolean(import.meta.env?.PROD || import.meta.env?.VITE_USE_API === "true");

export const detectCropBoxes: typeof detectCropBoxesDirect = USE_API
  ? detectCropBoxesViaApi
  : detectCropBoxesDirect;
