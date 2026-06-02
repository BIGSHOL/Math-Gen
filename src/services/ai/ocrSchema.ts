/**
 * JSON Schema for the Step 2 page-OCR response.
 *
 * Used by Anthropic `output_config.format` to force a single page worth of
 * extracted problems into a deterministic shape. Per Anthropic's structured-
 * output rules every object must declare `additionalProperties: false` and
 * list every property in `required`.
 *
 * Mapping to the `OCRProblem` UI type (src/stores/wizardStore.ts) happens in
 * `extractPageProblems` — the model returns a confidence band; the UI maps
 *   "high"  → status "ok"
 *   "medium"|"low" → status "warn"
 *
 * `topic` is kept as required-string even when the page is non-curricular
 * (the model is told to return "" rather than emit a partial object).
 */

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
              "Problem number as printed on the page. If unnumbered, infer from visual order (1, 2, …).",
          },
          text: {
            type: "string",
            description:
              "Full problem text in Markdown + LaTeX. Inline math wrapped in $...$, block math in $$...$$. " +
              "Choices, if any, listed at the end (\"① ...\" through \"⑤ ...\"), one per line. " +
              "Where ANY figure belongs (an inline <svg> you draw in this text, OR an entry in `images`), insert a [그림N] placeholder (1-indexed). Record that figure's full-page layout box in `figures[N-1]`.",
          },
          topic: {
            type: "string",
            description:
              "Short Korean curriculum topic label (e.g. '이차함수와 그래프'). Empty string if unknown.",
          },
          images: {
            type: "array",
            description:
              "Diagrams / figures / hand-drawn shapes belonging to this problem, in order matching the [그림N] placeholders in `text`. Empty array if the problem has no visual element.",
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
              "Layout box for EVERY figure referenced by a [그림N] marker in `text`, index-aligned to N (figures[0] = [그림1]). " +
              "Add exactly ONE entry per [그림N] marker — whether the figure is an inline <svg> you draw in `text`, OR an `images` crop (photo/artwork). " +
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
                    "svg = an inline <svg> you drew in `text`; diagram = a structured geometric shape; crop = an `images` bbox crop (photo/artwork/handwriting).",
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
              "high: text and formulas all clear. medium: some ambiguous symbols / faint glyphs. " +
              "low: page damaged, cut off, or contains diagrams that couldn't be transcribed.",
          },
          choicesLayout: {
            type: "string",
            enum: ["auto", "1x5", "2x3", "3x2", "5x1"],
            description:
              "Original 보기 layout (rows × cols). " +
              "Set this ONLY when the page has ①②③④⑤ options AND their grid is clearly visible. " +
              "Naming: '1x5' = 1 row × 5 cols (all horizontal), '2x3' = 2 rows × 3 cols (① ② ③ / ④ ⑤), " +
              "'3x2' = 3 rows × 2 cols (① ② / ③ ④ / ⑤), '5x1' = 5 rows × 1 col (vertical stack). " +
              "If no choices OR you cannot tell the layout, return 'auto' (renderer decides). " +
              "For 서술형 (no choices), always 'auto'.",
          },
        },
        required: ["number", "text", "topic", "images", "figures", "confidence", "choicesLayout"],
      },
    },
  },
  required: ["items"],
} as const;
