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
              "Where a diagram or figure belongs, insert a [그림N] placeholder (1-indexed, matching the order in `images`).",
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
          confidence: {
            type: "string",
            enum: ["high", "medium", "low"],
            description:
              "high: text and formulas all clear. medium: some ambiguous symbols / faint glyphs. " +
              "low: page damaged, cut off, or contains diagrams that couldn't be transcribed.",
          },
        },
        required: ["number", "text", "topic", "images", "confidence"],
      },
    },
  },
  required: ["items"],
} as const;
