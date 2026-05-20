import type { GeneratedProblem, SelectionState } from "@app/types";
import { anthropic, DEFAULT_MODEL } from "./client";
import { PROBLEM_SCHEMA } from "./schema";
import {
  COMMON_INSTRUCTIONS,
  buildCurriculumPrompt,
  buildExactExtractPrompt,
  buildImageVariantPrompt,
} from "./prompts";
import { parseDataUrl, sanitizeSvg, sanitizeText } from "./sanitize";

/**
 * Main problem-generation entry point.
 *
 * Replaces the Gemini-era `generateMathProblem` with the Anthropic SDK.
 *
 * Key implementation details (kept here so future-you doesn't have to dig
 * through the SDK README):
 *
 *  - System prompt is a single text block with `cache_control: ephemeral`.
 *    This is the cached prefix — keep it byte-identical across calls to
 *    actually hit the discount.
 *  - Structured output is enforced via `output_config.format` (JSON Schema).
 *    The SDK returns a normal `content[0].text` containing the JSON string
 *    that conforms to PROBLEM_SCHEMA — no `tool_use` round-trip needed.
 *  - For `image` / `exact` modes, the source image is a data URL; we split
 *    it into media-type + base64 payload before sending.
 */

interface SchemaShapedProblem {
  question: string;
  choices: string[];
  answer: string;
  solution: string;
  topic: string;
  difficulty: string;
  diagramSVG: string | null;
}

const SYSTEM_BLOCKS = [
  {
    type: "text" as const,
    text: COMMON_INSTRUCTIONS,
    cache_control: { type: "ephemeral" as const },
  },
];

const buildUserContent = (
  selection: SelectionState,
): Array<
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        data: string;
      };
    }
> => {
  if ((selection.mode === "image" || selection.mode === "exact") && selection.sourceImage) {
    const { mediaType, data } = parseDataUrl(selection.sourceImage);
    const promptText =
      selection.mode === "exact"
        ? buildExactExtractPrompt(selection.removeScore)
        : buildImageVariantPrompt(selection);
    return [
      { type: "image", source: { type: "base64", media_type: mediaType, data } },
      { type: "text", text: promptText },
    ];
  }
  return [{ type: "text", text: buildCurriculumPrompt(selection) }];
};

const extractJsonText = (response: Awaited<ReturnType<typeof anthropic.messages.create>>): string => {
  if ("content" in response) {
    for (const block of response.content) {
      if (block.type === "text") return block.text;
    }
  }
  throw new Error("Model returned no text content.");
};

const stripCodeFences = (raw: string): string => {
  const trimmed = raw.trim();
  if (trimmed.startsWith("```json")) {
    return trimmed.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
  }
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
  }
  return trimmed;
};

/**
 * Parse the model's JSON response. Structured output normally guarantees
 * valid JSON, but a malformed response still has to fail loudly with enough
 * context to debug (model id, raw start, length). Wrap with try/catch so
 * callers see a human-readable error instead of `Unexpected token <` from
 * deep inside JSON.parse.
 */
const parseProblemJson = (rawJson: string): SchemaShapedProblem => {
  try {
    return JSON.parse(rawJson) as SchemaShapedProblem;
  } catch (err) {
    const preview = rawJson.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      `[ai] Model returned invalid JSON (length=${rawJson.length}). ` +
        `Preview: ${preview}${rawJson.length > 200 ? "…" : ""}. ` +
        `Original error: ${(err as Error).message}`,
    );
  }
};

export const generateMathProblem = async (
  selection: SelectionState,
): Promise<GeneratedProblem> => {
  const userContent = buildUserContent(selection);

  const response = await anthropic.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 16000,
    system: SYSTEM_BLOCKS,
    messages: [{ role: "user", content: userContent }],
    output_config: {
      format: {
        type: "json_schema",
        schema: PROBLEM_SCHEMA as unknown as Record<string, unknown>,
      },
    },
  });

  const rawJson = stripCodeFences(extractJsonText(response));
  const parsed = parseProblemJson(rawJson);

  return {
    question: sanitizeText(parsed.question),
    choices: parsed.choices ?? [],
    answer: parsed.answer,
    solution: sanitizeText(parsed.solution),
    topic: parsed.topic,
    difficulty: parsed.difficulty,
    diagramSVG: sanitizeSvg(parsed.diagramSVG),
  };
};
