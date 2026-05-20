/**
 * JSON Schema for the solution-generation call.
 *
 * `solution` — the full step-by-step explanation in Markdown + LaTeX. The
 * model is instructed (see `SOLUTION_PROMPT` in `prompts.ts`) to use
 * `**[1단계: ...]**` / `**[2단계: ...]**` headers and to wrap every formula
 * in `$...$` (inline) or `$$...$$` (block). The Korean workbook house-style
 * (쎈 / 블랙라벨) provides the templates.
 *
 * `answer` — short final answer. For multiple-choice problems the model
 * MUST start with the original Korean choice marker (예: `"③ 5"`), and for
 * subjective problems it returns the bare value only (예: `"5"`,
 * `"$\frac{4\pi}{3}$"`, `"x=2"`). No padding like "정답은 …" allowed.
 *
 * Both Anthropic (`output_config.format.json_schema`) and OpenAI
 * (`response_format.json_schema`) accept this shape natively; Gemini uses
 * a sibling `toGeminiSchema()` converter (added in `ocr.ts`).
 */
export const SOLUTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    solution: {
      type: "string",
      description:
        "Step-by-step solution in Markdown + LaTeX. Use **[1단계: …]** style headers with a blank line between steps. Wrap every variable, number, and formula in $...$ (inline) or $$...$$ (block).",
    },
    answer: {
      type: "string",
      description:
        'Final answer only. Multiple choice: start with the Korean marker (e.g. "③ 5"). Subjective: bare value only ("5", "$\\frac{4\\pi}{3}$", "x=2"). Never include "정답은 …" or similar prose.',
    },
  },
  required: ["solution", "answer"],
} as const;
