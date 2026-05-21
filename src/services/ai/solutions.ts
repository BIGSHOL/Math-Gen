/**
 * Wizard Step 3 — single-problem solution + answer generation.
 *
 * Mirrors the structure of `ocr.ts`'s `extractPageProblems`: one entry point
 * (`generateSolution`) that dispatches by provider (Anthropic / Gemini /
 * OpenAI) and normalises every backend into a `{ solution, answer }` JSON
 * blob via the shared `SOLUTION_SCHEMA`.
 *
 * Key differences from OCR:
 *   - **Text-only input.** The OCR'd problem body (Markdown + LaTeX) is
 *     already structured; we don't re-send the page image. This makes calls
 *     considerably cheaper and faster.
 *   - **Smaller token budget.** Solutions are bounded — a few thousand
 *     tokens of step-by-step prose. We use 16k as the cap, which stays well
 *     under Anthropic's non-streaming 21k threshold, so we don't need the
 *     streaming code path that `callAnthropic` in ocr.ts uses.
 *   - **Single model by default.** Routing is hard-coded to Claude Sonnet
 *     4.6 (`SONNET_MODEL`) for the initial rollout. Callers can override via
 *     `input.model` — useful for the per-card "다른 모델로 재생성" affordance
 *     that arrives later.
 *
 * AbortSignal: passed through to every SDK so unmount / step-change reliably
 * cancels in-flight work. The orchestration hook (`useSolutionGen`) does an
 * additional `signal.aborted` check before writing the result back to store.
 */

import { anthropic, SONNET_MODEL, type AnthropicModelId } from "./client";
import {
  getGeminiClient,
  type GeminiModel,
  GEMINI_2_5_FLASH,
  GEMINI_2_5_FLASH_LITE,
  GEMINI_2_5_PRO,
  GEMINI_3_1_FLASH_LITE,
  GEMINI_3_1_PRO,
  GEMINI_3_5_FLASH,
  GEMINI_3_FLASH,
} from "./gemini";
import { getOpenAIClient, type OpenAIModel } from "./openai";
import {
  friendlyGeminiError,
  friendlyOpenAIError,
  parseJsonOrThrow,
  requiresResponsesAPI,
  toGeminiSchema,
  usesCompletionTokens,
  OCR_MODELS,
  type OCRModel,
} from "./ocr";
import { SYSTEM_BLOCKS, extractJsonText, stripCodeFences } from "./generate";
import {
  COMMON_INSTRUCTIONS,
  buildSolutionPrompt,
  buildSolutionPromptBlocksAnthropic,
} from "./prompts";
import { SOLUTION_SCHEMA } from "./solutionsSchema";
import { resolveMCAnswer, sanitizeAnswer, sanitizeText } from "./sanitize";
import type { GradeKey } from "./mathDefense";
import type { OCRProblem } from "@app/stores/wizardStore";

export interface SolutionGenInput {
  /** The OCR'd problem to explain. Only `text` (and optionally `topic`) is used. */
  problem: Pick<OCRProblem, "text" | "topic">;
  /**
   * 객관식 보기 배열 (옵션) — 모델이 답을 "9" 같은 *값* 으로 emit 했을 때
   * `resolveMCAnswer` 가 보기 배열과 대조해 "③" 등 마커 형태로 자동 교정.
   * 보기 없으면 매칭 불가능 — undefined 로 두면 skip.
   */
  choices?: string[];
  /** Cancel in-flight call when set. */
  signal?: AbortSignal;
  /**
   * Override the default model. If omitted we route by provider availability
   * starting from Claude Sonnet 4.6.
   */
  model?: OCRModel;
  /**
   * 학년·과목 fragment key — buildSolutionPrompt 에 전달돼 mathDefense 의
   * 학년별 단원 함정 표가 prompt 에 inject 됨. null/미지정 시 공통 fragment 만.
   */
  grade?: GradeKey | null;
}

export interface SolutionGenResult {
  /** Step-by-step solution body (Markdown + LaTeX, sanitised). */
  solution: string;
  /** Short final answer ("③ 5", "5", "$\\frac{4\\pi}{3}$"). */
  answer: string;
  /** The model that actually produced this result (for UI badge / debug). */
  modelUsed: OCRModel;
}

interface RawSolutionResponse {
  solution: string;
  answer: string;
}

// `OCR_MODELS` already enumerates every known model id; we re-use it to
// figure out provider dispatch without duplicating the list.
const providerOf = (model: OCRModel): "anthropic" | "gemini" | "openai" =>
  OCR_MODELS[model]?.provider ?? "anthropic";

/** Gemini ids — kept narrow so TS knows which SDK to call. */
const isGeminiModel = (m: OCRModel): m is GeminiModel =>
  m === GEMINI_2_5_FLASH ||
  m === GEMINI_2_5_FLASH_LITE ||
  m === GEMINI_2_5_PRO ||
  m === GEMINI_3_1_FLASH_LITE ||
  m === GEMINI_3_1_PRO ||
  m === GEMINI_3_5_FLASH ||
  m === GEMINI_3_FLASH;

// ─── Anthropic backend ────────────────────────────────────────────────
const callAnthropic = async (
  input: SolutionGenInput,
  model: AnthropicModelId,
): Promise<RawSolutionResponse> => {
  // 16k stays under the SDK's ~21k non-streaming threshold, so we can use
  // the simpler `messages.create` path here (no streaming gymnastics).
  //
  // **Prompt caching**: user content 를 2 blocks 로 분리. Block 0 (~6,000
  // tokens) 은 `cache_control: ephemeral` 마킹 — 같은 시험지의 30 호출이
  // 같은 학년·prompt prefix 공유하므로 첫 호출 cache write, 나머지는 cache
  // read (90% 할인). Block 1 (~100~300 tokens) 은 호출마다 dynamic.
  const userBlocks = buildSolutionPromptBlocksAnthropic(input.problem, input.grade);
  const response = await anthropic.messages.create(
    {
      model,
      max_tokens: 16000,
      // Solutions are mostly deterministic transcription-adjacent work —
      // pin temperature low so reruns produce the same explanation.
      temperature: 0.1,
      system: SYSTEM_BLOCKS,
      messages: [
        {
          role: "user",
          content: userBlocks,
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: SOLUTION_SCHEMA as unknown as Record<string, unknown>,
        },
      },
    },
    input.signal ? { signal: input.signal } : undefined,
  );

  // DEV-only — cache hit 측정. 1 호출: creation > 0, read = 0. 2~30 호출:
  // read > 0, creation = 0. Production 빌드에선 dead-code elimination.
  if (import.meta.env.DEV) {
    const usage = (response as { usage?: { cache_read_input_tokens?: number; cache_creation_input_tokens?: number; input_tokens?: number } }).usage;
    // eslint-disable-next-line no-console
    console.debug(
      `[ai/solutions] cache_read=${usage?.cache_read_input_tokens ?? 0} cache_create=${usage?.cache_creation_input_tokens ?? 0} input=${usage?.input_tokens ?? 0} model=${model}`,
    );
  }

  const rawJson = stripCodeFences(extractJsonText(response));
  return parseJsonOrThrow<RawSolutionResponse>(rawJson);
};

// ─── Gemini backend ───────────────────────────────────────────────────
const callGemini = async (
  input: SolutionGenInput,
  model: GeminiModel,
): Promise<RawSolutionResponse> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }

  const ai = getGeminiClient();
  const system = COMMON_INSTRUCTIONS;
  const userText = buildSolutionPrompt(input.problem, input.grade);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        { role: "user", parts: [{ text: `${system}\n\n${userText}` }] },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(SOLUTION_SCHEMA) as unknown as Parameters<
          typeof ai.models.generateContent
        >[0]["config"] extends infer C
          ? C extends { responseSchema?: infer R }
            ? R
            : never
          : never,
        // Pin sampling for deterministic-ish solutions (same caveat as
        // OCR — pure 0.0 sometimes stuck on long structured output).
        temperature: 0.1,
        maxOutputTokens: 16384,
        abortSignal: input.signal,
      },
    });

    // Detect truncation up-front so we can surface a clearer message than
    // "Unexpected end of JSON input" downstream.
    const finishReason = (response as { candidates?: Array<{ finishReason?: string }> })
      .candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") {
      throw new Error(
        `${model} 응답이 출력 토큰 한도(${16384})에 막혀 잘렸습니다 — 풀이가 너무 길어 한 응답에 들어가지 않습니다. 더 큰 Gemini Pro 모델을 사용하거나 문제를 더 간결하게 다시 추출하세요.`,
      );
    }

    const rawJson = typeof response.text === "string" ? response.text : "";
    if (!rawJson) throw new Error("[ai/gemini] Empty solution response.");
    return parseJsonOrThrow<RawSolutionResponse>(stripCodeFences(rawJson));
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    const raw = (err as Error).message ?? String(err);
    const friendly = friendlyGeminiError(raw, model);
    const wrapped = new Error(friendly);
    (wrapped as Error & { cause?: unknown }).cause = raw;
    throw wrapped;
  }
};

// ─── OpenAI backend ───────────────────────────────────────────────────
const callOpenAIResponsesAPI = async (
  input: SolutionGenInput,
  model: OpenAIModel,
): Promise<RawSolutionResponse> => {
  const client = getOpenAIClient();
  const userText = buildSolutionPrompt(input.problem, input.grade);
  const maxOutput = model === "gpt-5.5-pro" ? 16000 : 16000;
  const response = await client.responses.create(
    {
      model,
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: `${COMMON_INSTRUCTIONS}\n\n${userText}` }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "SolutionResult",
          schema: SOLUTION_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
      max_output_tokens: maxOutput,
      reasoning: { effort: "low" },
    } as Parameters<typeof client.responses.create>[0],
    { signal: input.signal ?? undefined },
  );

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
        if ((c.type === "output_text" || c.type === "text") && typeof c.text === "string") {
          rawJson += c.text;
        }
      }
    }
  }
  if (!rawJson) {
    const reason = r.incomplete_details?.reason;
    if (reason === "max_output_tokens" || r.status === "incomplete") {
      throw new Error(
        `${model} 응답이 reasoning 단계에서 토큰을 모두 소진해 보이는 결과를 만들지 못했습니다. reasoning.effort 를 낮추거나 더 가벼운 모델을 사용하세요.`,
      );
    }
    throw new Error(`[ai/openai] ${model} returned no output_text / output messages.`);
  }
  return parseJsonOrThrow<RawSolutionResponse>(stripCodeFences(rawJson));
};

const callOpenAI = async (
  input: SolutionGenInput,
  model: OpenAIModel,
): Promise<RawSolutionResponse> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }
  try {
    if (requiresResponsesAPI(model)) {
      return await callOpenAIResponsesAPI(input, model);
    }

    const client = getOpenAIClient();
    const userText = buildSolutionPrompt(input.problem, input.grade);
    const useCompletionTokens = usesCompletionTokens(model);
    const response = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: COMMON_INSTRUCTIONS },
          { role: "user", content: userText },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "SolutionResult",
            schema: SOLUTION_SCHEMA as unknown as Record<string, unknown>,
            strict: true,
          },
        },
        // Pin sampling for solution consistency. GPT-5 / o-series
        // reject `temperature` so the reasoning-effort path skips it.
        ...(useCompletionTokens
          ? { max_completion_tokens: 16000 }
          : { max_tokens: 16000, temperature: 0.1 }),
      },
      { signal: input.signal ?? undefined },
    );

    const rawJson = response.choices[0]?.message?.content ?? "";
    if (!rawJson) throw new Error("[ai/openai] Empty solution response.");
    return parseJsonOrThrow<RawSolutionResponse>(stripCodeFences(rawJson));
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    const raw = (err as Error).message ?? String(err);
    const friendly = friendlyOpenAIError(raw, model);
    const wrapped = new Error(friendly);
    (wrapped as Error & { cause?: unknown }).cause = raw;
    throw wrapped;
  }
};

// ─── Public entry point ───────────────────────────────────────────────
/**
 * Generate a step-by-step solution and short answer for a single OCR'd
 * problem. Throws on AbortError (caller decides whether to surface) or on
 * model failure (with a friendly Korean message attached).
 *
 * Default model: Claude Sonnet 4.6. The team will evaluate quality and may
 * promote to Opus 4.7 — when that happens just change the default here.
 */
export const generateSolution = async (
  input: SolutionGenInput,
): Promise<SolutionGenResult> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }

  const model = (input.model ?? SONNET_MODEL) as OCRModel;
  const provider = providerOf(model);

  let parsed: RawSolutionResponse;
  if (provider === "anthropic") {
    parsed = await callAnthropic(input, model as AnthropicModelId);
  } else if (provider === "gemini" && isGeminiModel(model)) {
    parsed = await callGemini(input, model);
  } else {
    parsed = await callOpenAI(input, model as OpenAIModel);
  }

  // 답 후처리 순서: (1) sanitizeAnswer (쉼표 공백 + LaTeX 정규화) →
  // (2) resolveMCAnswer (값 → ①②③ 마커, choices 가 있을 때만 — 보기 없으면 skip).
  // mathlab post-processor 패턴 차용.
  const cleanedAnswer = sanitizeAnswer(parsed.answer ?? "");
  const finalAnswer = input.choices
    ? resolveMCAnswer(cleanedAnswer, input.choices)
    : cleanedAnswer;

  return {
    solution: sanitizeText(parsed.solution ?? ""),
    answer: finalAnswer,
    modelUsed: model,
  };
};
