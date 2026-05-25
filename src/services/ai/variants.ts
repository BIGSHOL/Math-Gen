/**
 * Wizard Step 4 — single-problem variant generation.
 *
 * `solutions.ts` 의 1:1 복제 — provider dispatch (Anthropic / Gemini /
 * OpenAI), JSON schema 강제, sanitize 후처리. *다른 점*만:
 *   - prompt: `VARIANT_PROMPT` / `buildVariantPrompt*` (variants 도메인)
 *   - schema: `VARIANT_SCHEMA` (question / choices / answer / solution /
 *     topic / difficulty / diagramSVG)
 *   - 입력: 원본 문제 + goal/difficulty 옵션
 *   - 출력: GeneratedProblem-호환 객체
 *   - 검증: choicesCount mismatch 시 1 회 retry, 두 번째도 실패 → fallback
 *     (원본 보기 유지)
 *
 * **prompt caching** (Anthropic): `buildVariantPromptBlocksAnthropic` 이
 * 2 blocks 로 분리. 학년·옵션 dynamic but 시험지 내 동일한 prefix (~7,000
 * tokens) 를 cache_control 마킹 → 첫 호출 cache write, 이후 cache read.
 *
 * **AbortSignal**: 모든 SDK 에 전달. unmount / step 이동 시 cancel.
 */

import { anthropic, SONNET_MODEL, type AnthropicModelId } from "./client.js";
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
} from "./gemini.js";
import { getOpenAIClient, type OpenAIModel } from "./openai.js";
import {
  friendlyGeminiError,
  friendlyOpenAIError,
  parseJsonOrThrow,
  requiresResponsesAPI,
  toGeminiSchema,
  usesCompletionTokens,
  OCR_MODELS,
  type OCRModel,
} from "./ocr.js";
import {
  SYSTEM_BLOCKS,
  extractJsonText,
  extractToolUseInput,
  stripCodeFences,
} from "./generate.js";
import {
  COMMON_INSTRUCTIONS,
  buildVariantPrompt,
  buildVariantPromptBlocksAnthropic,
} from "./prompts.js";
import { VARIANT_SCHEMA } from "./variantSchema.js";
import { resolveMCAnswer, sanitizeAnswer, sanitizeText } from "./sanitize.js";
import type { GradeKey } from "./mathDefense.js";
import type {
  ConversionGoal,
  DifficultyShift,
} from "../../stores/wizardStore.js";
import type { GeneratedProblem } from "../../types/index.js";
import type { DiagramParams } from "../../lib/diagram/index.js";

export interface VariantGenInput {
  /** 원본 문제 (Step 2 의 OCRProblem → GeneratedProblem 어댑터 결과). */
  problem: Pick<
    GeneratedProblem,
    "question" | "choices" | "answer" | "solution" | "topic"
  >;
  /** 변형 옵션. */
  goal: ConversionGoal;
  difficulty: DifficultyShift;
  /** 학년·과목 fragment key — mathDefense + prompt 페르소나에 inject. */
  grade?: GradeKey | null;
  /**
   * 객관식 보기 개수 — 결과 검증 시 사용. 원본이 객관식이면 5, 주관식이면 0.
   * caller (useVariantGen) 가 `problem.choices?.length ?? 0` 으로 자동 결정.
   */
  choicesCount?: number;
  /** Cancel in-flight call when set. */
  signal?: AbortSignal;
  /** Override the default model. Defaults to Claude Sonnet 4.6. */
  model?: OCRModel;
}

export interface VariantGenResult {
  question: string;
  choices: string[];
  answer: string;
  solution: string;
  topic: string;
  difficulty: string;
  /** @deprecated 항상 null. diagramParams 우선. */
  diagramSVG: string | null;
  /** Vector 도형 spec — Phase E. AI emit → renderDiagram. */
  diagramParams: DiagramParams[] | null;
  modelUsed: OCRModel;
}

interface RawVariantResponse {
  question: string;
  choices: string[];
  answer: string;
  solution: string;
  topic: string;
  difficulty: string;
  diagramSVG: string | null;
  diagramParams?: unknown;
}

// `OCR_MODELS` already enumerates every known model id; we re-use it to
// figure out provider dispatch without duplicating the list.
const providerOf = (model: OCRModel): "anthropic" | "gemini" | "openai" =>
  OCR_MODELS[model]?.provider ?? "anthropic";

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
  input: VariantGenInput,
  model: AnthropicModelId,
): Promise<RawVariantResponse> => {
  const userBlocks = buildVariantPromptBlocksAnthropic(input.problem, {
    goal: input.goal,
    difficulty: input.difficulty,
    grade: input.grade,
    choicesCount: input.choicesCount,
  });
  // tool_use 패턴 — Anthropic 권장. output_config.format.schema 의 server-side
  // strict validator 가 array schema 일괄 거부 (`maxItems is not supported`)
  // 문제 회피. input_schema 는 동일 VARIANT_SCHEMA.
  const TOOL_NAME = "emit_variant";
  const response = await anthropic.messages.create(
    {
      model,
      max_tokens: 16000,
      // Variant 생성은 *약간의 창의성* 이 필요 (단순 transcription 아님).
      // 단 단원·답 구조는 보존이 핵심이라 temperature 는 약간 올린 0.3 으로.
      temperature: 0.3,
      system: SYSTEM_BLOCKS,
      messages: [
        {
          role: "user",
          content: userBlocks,
        },
      ],
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Emit the variant problem JSON with question / choices / answer / solution / topic / difficulty / diagramSVG / diagramParams fields.",
          input_schema: VARIANT_SCHEMA as unknown as {
            type: "object";
            properties?: Record<string, unknown>;
            required?: string[];
          },
        },
      ],
      tool_choice: { type: "tool", name: TOOL_NAME },
    },
    input.signal ? { signal: input.signal } : undefined,
  );

  // DEV-only — cache hit 측정. 1 호출: creation > 0, read = 0. 이후: read > 0.
  // Vercel function (Node ESM) 에서는 import.meta.env 가 undefined → ?. 으로 안전 access.
  if (import.meta.env?.DEV) {
    const usage = (
      response as {
        usage?: {
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
          input_tokens?: number;
        };
      }
    ).usage;
    // eslint-disable-next-line no-console
    console.debug(
      `[ai/variants] cache_read=${usage?.cache_read_input_tokens ?? 0} cache_create=${usage?.cache_creation_input_tokens ?? 0} input=${usage?.input_tokens ?? 0} model=${model}`,
    );
  }

  // tool_use 패턴: 응답 content 에서 emit_variant tool block 의 input (이미
  // parsed JSON object) 추출. JSON.parse 불필요.
  return extractToolUseInput<RawVariantResponse>(response, TOOL_NAME);
};

// ─── Gemini backend ───────────────────────────────────────────────────
const callGemini = async (
  input: VariantGenInput,
  model: GeminiModel,
): Promise<RawVariantResponse> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }

  const ai = getGeminiClient();
  const system = COMMON_INSTRUCTIONS;
  const userText = buildVariantPrompt(input.problem, {
    goal: input.goal,
    difficulty: input.difficulty,
    grade: input.grade,
    choicesCount: input.choicesCount,
  });

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        { role: "user", parts: [{ text: `${system}\n\n${userText}` }] },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(VARIANT_SCHEMA) as unknown as Parameters<
          typeof ai.models.generateContent
        >[0]["config"] extends infer C
          ? C extends { responseSchema?: infer R }
            ? R
            : never
          : never,
        temperature: 0.3,
        maxOutputTokens: 16384,
        abortSignal: input.signal,
      },
    });

    const finishReason = (
      response as { candidates?: Array<{ finishReason?: string }> }
    ).candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") {
      throw new Error(
        `${model} 응답이 출력 토큰 한도(${16384})에 막혀 잘렸습니다 — 변형 풀이가 너무 길어 한 응답에 안 들어갑니다. 더 큰 Gemini Pro 모델을 사용하세요.`,
      );
    }

    const rawJson = typeof response.text === "string" ? response.text : "";
    if (!rawJson) throw new Error("[ai/gemini] Empty variant response.");
    return parseJsonOrThrow<RawVariantResponse>(stripCodeFences(rawJson));
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
  input: VariantGenInput,
  model: OpenAIModel,
): Promise<RawVariantResponse> => {
  const client = getOpenAIClient();
  const userText = buildVariantPrompt(input.problem, {
    goal: input.goal,
    difficulty: input.difficulty,
    grade: input.grade,
    choicesCount: input.choicesCount,
  });
  const maxOutput = 16000;
  const response = await client.responses.create(
    {
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: `${COMMON_INSTRUCTIONS}\n\n${userText}` },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "VariantResult",
          schema: VARIANT_SCHEMA as unknown as Record<string, unknown>,
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
    const reason = r.incomplete_details?.reason;
    if (reason === "max_output_tokens" || r.status === "incomplete") {
      throw new Error(
        `${model} 응답이 reasoning 단계에서 토큰을 모두 소진해 결과를 만들지 못했습니다. reasoning.effort 를 낮추거나 더 가벼운 모델을 사용하세요.`,
      );
    }
    throw new Error(
      `[ai/openai] ${model} returned no output_text / output messages.`,
    );
  }
  return parseJsonOrThrow<RawVariantResponse>(stripCodeFences(rawJson));
};

const callOpenAI = async (
  input: VariantGenInput,
  model: OpenAIModel,
): Promise<RawVariantResponse> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }
  try {
    if (requiresResponsesAPI(model)) {
      return await callOpenAIResponsesAPI(input, model);
    }

    const client = getOpenAIClient();
    const userText = buildVariantPrompt(input.problem, {
      goal: input.goal,
      difficulty: input.difficulty,
      grade: input.grade,
      choicesCount: input.choicesCount,
    });
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
            name: "VariantResult",
            schema: VARIANT_SCHEMA as unknown as Record<string, unknown>,
            strict: true,
          },
        },
        ...(useCompletionTokens
          ? { max_completion_tokens: 16000 }
          : { max_tokens: 16000, temperature: 0.3 }),
      },
      { signal: input.signal ?? undefined },
    );

    const rawJson = response.choices[0]?.message?.content ?? "";
    if (!rawJson) throw new Error("[ai/openai] Empty variant response.");
    return parseJsonOrThrow<RawVariantResponse>(stripCodeFences(rawJson));
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
 * 원본 문제 1 개에 대해 변형 문제 1 개 생성.
 *
 * **답 구조 검증** (B5/B6 방어선):
 * - 결과 `choices.length !== input.choicesCount` 이면 *답 구조 불일치* 로 간주.
 * - caller (useVariantGen) 는 `withRetry` 가 처리 — caller 가 `Error` throw 하면
 *   withRetry 가 1 회 더 시도 후 결국 throw → caller 가 fallback (원본 보기 유지).
 * - 본 함수에서는 검증만 하고 throw — orchestration 은 caller 가 결정.
 *
 * **default model**: Claude Sonnet 4.6. caller 가 override 가능.
 */
const generateVariantDirect = async (
  input: VariantGenInput,
): Promise<VariantGenResult> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }

  const model = (input.model ?? SONNET_MODEL) as OCRModel;
  const provider = providerOf(model);

  let parsed: RawVariantResponse;
  if (provider === "anthropic") {
    parsed = await callAnthropic(input, model as AnthropicModelId);
  } else if (provider === "gemini" && isGeminiModel(model)) {
    parsed = await callGemini(input, model);
  } else {
    parsed = await callOpenAI(input, model as OpenAIModel);
  }

  // 검증: 객관식 보기 개수가 원본과 일치하는가.
  const expectedCount = input.choicesCount ?? 0;
  const actualChoices = Array.isArray(parsed.choices) ? parsed.choices : [];
  if (expectedCount !== actualChoices.length) {
    throw new Error(
      `변형 결과의 보기 개수가 원본과 불일치합니다 (원본 ${expectedCount}, 변형 ${actualChoices.length}). caller 가 재시도 또는 fallback 처리해야 합니다.`,
    );
  }

  // 후처리: solution / choice text 모두 sanitizeText, answer 는 sanitizeAnswer +
  // resolveMCAnswer (객관식일 때만).
  const cleanedChoices = actualChoices.map((c) => sanitizeText(c));
  const cleanedAnswer = sanitizeAnswer(parsed.answer ?? "");
  const finalAnswer =
    cleanedChoices.length > 0
      ? resolveMCAnswer(cleanedAnswer, cleanedChoices)
      : cleanedAnswer;

  // 도형 spec: 모델이 array 로 emit 했으면 그대로 통과 (런타임 normalize 가 보정).
  // 잘못된 형식 (object, string 등) → null. 빈 array 도 null 로 통일.
  const rawDiagrams = parsed.diagramParams;
  const diagramParams: DiagramParams[] | null =
    Array.isArray(rawDiagrams) && rawDiagrams.length > 0
      ? (rawDiagrams as DiagramParams[])
      : null;

  return {
    question: sanitizeText(parsed.question ?? ""),
    choices: cleanedChoices,
    answer: finalAnswer,
    solution: sanitizeText(parsed.solution ?? ""),
    topic: parsed.topic ?? input.problem.topic ?? "",
    difficulty: parsed.difficulty ?? "중",
    diagramSVG: null, // deprecated — diagramParams 가 우선
    diagramParams,
    modelUsed: model,
  };
};

/**
 * 클라이언트 프로덕션 빌드 — `/api/ai-variant` Vercel function 호출.
 * dev (USE_API=false) 에서는 *direct SDK* 사용.
 */
const generateVariantViaApi = async (
  input: VariantGenInput,
): Promise<VariantGenResult> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }
  const { signal, ...body } = input;
  const res = await fetch("/api/ai-variant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
};

const USE_API: boolean =
  typeof window !== "undefined" &&
  typeof import.meta !== "undefined" &&
  Boolean(import.meta.env?.PROD || import.meta.env?.VITE_USE_API === "true");

export const generateVariant: typeof generateVariantDirect = USE_API
  ? generateVariantViaApi
  : generateVariantDirect;
