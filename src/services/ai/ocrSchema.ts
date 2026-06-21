/**
 * JSON Schema for the Step 2 page-OCR response.
 *
 * Used by Anthropic `tool_use` input_schema, Gemini `responseSchema`
 * (via `toGeminiSchema`), and OpenAI strict structured output to force a
 * single page worth of extracted problems into a deterministic shape. Per
 * strict-output rules every object declares `additionalProperties: false`
 * and lists every property in `required`.
 *
 * **옵션 B — 네이티브 typed-block**: 한 문항의 본문은 markdown `text` 단일
 * 문자열이 아니라 *typed-block 배열* (`contents`) + 보기 (`choices`) 로 emit 된다
 * (시험지변환기 EXAM_OCR_PROMPT 와 동일 구조). markdown `text` 는 스토어에서
 * `blocksToMarkdown` 로 *파생*한다 (src/lib/blocksToMarkdown.ts).
 *
 * Mapping to `OCRProblem` (src/stores/wizardStore.ts) happens in
 * `normalizeResponse` (ocr.ts):
 *   - confidence "high" → status "ok"; "medium"/"low" → "warn"
 *   - score 0 → undefined; labelType "" → undefined
 *
 * **nullable 회피**: strict 3-provider 호환 위해 null 대신 sentinel — score 0(없음),
 * labelType ""(없음), rows [](비-table), images/figures/choices [](없음),
 * topic ""(미상), choicesLayout "auto". (toGeminiSchema 가 `type:["x","null"]`
 * union 을 못 바꾸므로 nullable 금지 — ocr.ts toGeminiSchema 주석 참고.)
 */

/**
 * 본문/보기를 구성하는 typed 블록 (text/equation/equation_block/table).
 * contents 와 choices[].contents 가 공유 (단일 정의 — drift 방지).
 */
const BLOCK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    type: {
      type: "string",
      enum: ["text", "equation", "equation_block", "table"],
      description:
        "Block kind. text=Korean prose (may carry a `<보기>`/`<조건>`/`<상자>` box label prefix, a [그림N] marker, an inline <svg>, or __강조__ underline-emphasis). " +
        "equation=inline math LaTeX. equation_block=display/standalone math LaTeX. table=grid (cells go in `rows`, value=\"\").",
    },
    value: {
      type: "string",
      description:
        "Block payload. text: the Korean text. equation/equation_block: pure LaTeX WITHOUT surrounding $ (e.g. \\\\frac{1}{2}). table: empty string \"\" (cells live in rows).",
    },
    rows: {
      type: "array",
      description:
        "TABLE blocks only: 2D cell array, rows[0] = header row, each cell a string (LaTeX allowed, no $). For non-table blocks this MUST be an empty array [].",
      items: { type: "array", items: { type: "string" } },
    },
  },
  required: ["type", "value", "rows"],
} as const;

/** 객관식 보기 하나 — items.choices 와 sub-question.choices 가 공유 (drift 방지). */
const CHOICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    number: {
      type: "integer",
      description: "Option number 1..5 (① → 1, ② → 2, …).",
    },
    contents: {
      type: "array",
      description: "This option's content as typed blocks.",
      items: BLOCK_SCHEMA,
    },
  },
  required: ["number", "contents"],
} as const;

/**
 * 소문항 (1)(2) — 배점이 따로 매겨진 실제 하위 문항. 박스 (가)(나) 조건은 sub_questions
 * 아님(박스 text 블록 유지). 1단계 깊이 — 소문항 안에 또 subQuestions 없음(재귀 회피).
 */
const SUBQUESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    number: {
      type: "integer",
      description: "Sub-question number ((1) → 1, (2) → 2).",
    },
    contents: {
      type: "array",
      description:
        "Sub-question body as typed blocks — same shape as the problem body (split math/Korean, every number its own equation block).",
      items: BLOCK_SCHEMA,
    },
    choices: {
      type: "array",
      description:
        "Sub-question options ①…⑤ as {number, contents}. EMPTY ARRAY [] for 서술형 sub-parts (most sub-questions).",
      items: CHOICE_SCHEMA,
    },
    score: {
      type: "integer",
      description: "This sub-question's printed point value (배점). Use 0 if none.",
    },
    labelType: {
      type: "string",
      description: "Sub-question type label if printed, else empty string \"\".",
    },
  },
  required: ["number", "contents", "choices", "score", "labelType"],
} as const;

export const OCR_PAGE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      description: "Problems extracted from this page, in original visual order.",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          number: {
            type: "integer",
            description:
              "Problem MAIN number as printed (e.g. 19 for \"19. [서답형 3]\", NOT 3). If unnumbered, infer from visual order (1, 2, …).",
          },
          contents: {
            type: "array",
            description:
              "Problem body as an ordered array of typed blocks. Split mixed math+Korean into alternating equation/text blocks; EVERY number (30, 0.5) is its own equation block, never embedded in text. " +
              "Figures live INSIDE a text block (an inline <svg> you draw, or a [그림N] marker). Boxes (보기/조건/지문) are text blocks whose value starts with `<보기>`/`<조건>`/`<상자>`. Empty array only if the body is truly empty.",
            items: BLOCK_SCHEMA,
          },
          choices: {
            type: "array",
            description:
              "Multiple-choice options ①…⑤ as {number, contents}. number = 1..5 (① → 1). Each option's contents is a typed-block array (usually one equation block). EMPTY ARRAY [] for 서술형/단답형 (no ①②③④⑤ options).",
            items: CHOICE_SCHEMA,
          },
          subQuestions: {
            type: "array",
            description:
              "Real sub-questions (1)(2) that EACH carry their OWN printed 배점 (score). EMPTY ARRAY [] for normal problems. " +
              "Do NOT use for (가)(나)/보기 box conditions — those stay inside a box text block in `contents`. " +
              "When present, the parent problem's `score` should be the TOTAL (sum of the sub scores).",
            items: SUBQUESTION_SCHEMA,
          },
          score: {
            type: "integer",
            description:
              "Printed point value (배점) for this problem, e.g. 3, 4, 5. Use 0 if no score is printed. Do NOT put [N점] inside contents text.",
          },
          labelType: {
            type: "string",
            description:
              "Printed question-type label EXACTLY as on the page: \"서답형\" | \"서술형\" | \"단답형\" | \"논술형\" | \"주관식\". Empty string \"\" if none. (Read the printed word; do not swap 서답형↔서술형.)",
          },
          topic: {
            type: "string",
            description:
              "Short Korean curriculum topic label (e.g. '이차함수와 그래프'). Empty string if unknown.",
          },
          images: {
            type: "array",
            description:
              "Diagrams / figures / hand-drawn shapes belonging to this problem, in order matching the [그림N] placeholders in `contents`. Empty array if the problem has no visual element.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                box: {
                  type: "array",
                  description:
                    "Normalized bbox of exactly 4 numbers in the order [yMin, xMin, yMax, xMax] on a 0–1000 grid over the FULL PAGE (yMin=top row, xMin=left column). Tight around the figure but include any in-figure labels.",
                  items: { type: "number" },
                },
                label: {
                  type: "string",
                  description:
                    "Short Korean caption (e.g. '정사각형 ABCD', '거북이 이동 경로'). Empty string allowed.",
                },
              },
              required: ["box", "label"],
            },
          },
          figures: {
            type: "array",
            description:
              "Layout box for EVERY figure referenced by a [그림N] marker in `contents`, index-aligned to N (figures[0] = [그림1]). " +
              "Add exactly ONE entry per [그림N] marker — whether the figure is an inline <svg> you draw, OR an `images` crop (photo/artwork). " +
              "This drives whether figures render side-by-side or stacked, matching the original page. Empty array if the problem has no [그림N] marker.",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                box: {
                  type: "array",
                  description:
                    "Normalized bbox [yMin, xMin, yMax, xMax] on a 0–1000 grid over the FULL PAGE (yMin=top, xMin=left). The region this figure occupies on the ORIGINAL page. Tight, include in-figure labels.",
                  items: { type: "number" },
                },
                kind: {
                  type: "string",
                  enum: ["svg", "diagram", "crop"],
                  description:
                    "svg = an inline <svg> you drew in a contents text block; diagram = a structured geometric shape; crop = an `images` bbox crop (photo/artwork/handwriting).",
                },
                label: {
                  type: "string",
                  description: "Short Korean caption. Empty string allowed.",
                },
              },
              required: ["box", "kind", "label"],
            },
          },
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description:
              "high: text and formulas all clear. medium: some ambiguous symbols / faint glyphs, OR you produced a figure (SVG/table) you're not 100% sure mirrors the original. " +
              "low: page damaged, cut off, body partially guessed, or you fell back to images[] crops.",
          },
          choicesLayout: {
            type: "string",
            enum: ["auto", "1x5", "2x3", "3x2", "5x1"],
            description:
              "Original 보기 layout (rows × cols). Set ONLY when the page has ①②③④⑤ options AND their grid is clearly visible. " +
              "'1x5' = 1 row × 5 cols (all horizontal), '2x3' = 2 rows × 3 cols (① ② ③ / ④ ⑤), " +
              "'3x2' = 3 rows × 2 cols (① ② / ③ ④ / ⑤), '5x1' = 5 rows × 1 col (vertical stack). " +
              "If no choices OR you cannot tell the layout, return 'auto'. For 서술형 (no choices), always 'auto'.",
          },
        },
        required: [
          "number",
          "contents",
          "choices",
          "subQuestions",
          "score",
          "labelType",
          "topic",
          "images",
          "figures",
          "confidence",
          "choicesLayout",
        ],
      },
    },
  },
  required: ["items"],
} as const;
