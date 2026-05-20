/**
 * JSON Schema for math problem generation responses.
 *
 * Used by Anthropic's `output_config.format` to force structured output.
 * Anthropic structured outputs require:
 *   - `additionalProperties: false` on every object
 *   - every property listed in `required`
 *   - nullable fields expressed as `type: ["string", "null"]` (no `nullable` flag)
 *
 * The Gemini predecessor schema had `choices` and `diagramSVG` as optional
 * (`required: ["question", "answer", "solution", "topic", "difficulty"]`).
 * For Anthropic we make them required but allow them to be an empty array /
 * null respectively — semantically equivalent, structurally explicit.
 */

export const PROBLEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    question: {
      type: "string",
      description:
        "The main problem text. Use Markdown. Wrap math in $...$ (inline) or $$...$$ (block). No <img> tags or markdown images.",
    },
    choices: {
      type: "array",
      items: { type: "string" },
      description:
        "5 multiple-choice options (each wrapped in $...$ if math). Empty array [] for subjective/essay problems.",
    },
    answer: {
      type: "string",
      description:
        "Final answer. If multiple choice, start with the circled number (e.g. '③ 5' or '(3) 5'). If subjective, just the value (e.g. '5', '$4\\pi$', 'x=2').",
    },
    solution: {
      type: "string",
      description:
        "Detailed step-by-step solution in Korean workbook style. Use **[1단계: ...]** headers separated by double newlines.",
    },
    topic: {
      type: "string",
      description: "Concise topic label (e.g. '이차함수와 그래프').",
    },
    difficulty: {
      type: "string",
      description: "Difficulty label (하/중/상/최상).",
    },
    diagramSVG: {
      type: ["string", "null"],
      description:
        "Raw SVG string for geometry/graph/statistics problems, or null if no visual is needed. Must use viewBox, black strokes, transparent background, and vertically constructed fractions (text + line elements, never slash notation or LaTeX inside <text>).",
    },
  },
  required: [
    "question",
    "choices",
    "answer",
    "solution",
    "topic",
    "difficulty",
    "diagramSVG",
  ],
} as const;
