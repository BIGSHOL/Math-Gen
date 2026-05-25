/**
 * Wizard Step 2 — page-level OCR.
 *
 * Single entry point `extractPageProblems` that dispatches to the right
 * provider based on the `model` parameter:
 *
 *   - claude-haiku-4-5 / claude-sonnet-4-6 / claude-opus-4-7 → Anthropic
 *   - gemini-2.5-flash / gemini-2.5-pro / gemini-3-pro-preview → Google Gemini
 *
 * Output is normalized into the same `OCRProblem[]` shape regardless of
 * provider — callers don't need to know which family produced the result.
 *
 * Strategy: one call per page returns a complete JSON array of problems on
 * that page (see OCR_PAGE_SCHEMA). Progressive UX comes from the
 * orchestrator (`usePageOcr`) running multiple pages concurrently and
 * surfacing each page's result the moment it lands.
 *
 * AbortSignal handling: cancellation can come from two places —
 *   1. The Step 2 component unmounting (user navigates away mid-call).
 *   2. A queued worker firing AFTER unmount (pLimit had it pending).
 * We check `signal.aborted` both at the entry of this function AND right
 * before the network call, AND we pass the signal to the SDK so an in-flight
 * fetch is cancelled at the transport layer. The orchestrator wraps the
 * result handling with one more aborted-check.
 */

import type { OCRProblem } from "../../stores/wizardStore.js";
import {
  anthropic,
  DEFAULT_MODEL,
  HAIKU_MODEL,
  OPUS_MODEL,
  SONNET_MODEL,
  type AnthropicModelId,
} from "./client.js";
import {
  getGeminiClient,
  GEMINI_2_5_FLASH,
  GEMINI_2_5_FLASH_LITE,
  GEMINI_2_5_PRO,
  GEMINI_3_1_FLASH_LITE,
  GEMINI_3_1_PRO,
  GEMINI_3_5_FLASH,
  GEMINI_3_FLASH,
  type GeminiModel,
} from "./gemini.js";
import {
  getOpenAIClient,
  GPT_4_1,
  GPT_4_1_MINI,
  GPT_4O,
  GPT_4O_MINI,
  GPT_5,
  GPT_5_2,
  GPT_5_5,
  GPT_5_5_PRO,
  GPT_5_MINI,
  GPT_5_NANO,
  O3,
  O4_MINI,
  type OpenAIModel,
} from "./openai.js";
import {
  SYSTEM_BLOCKS,
  extractJsonText,
  extractToolUseInput,
  stripCodeFences,
} from "./generate.js";
import { COMMON_INSTRUCTIONS, OCR_PAGE_PROMPT } from "./prompts.js";
import { OCR_PAGE_SCHEMA } from "./ocrSchema.js";
import { parseDataUrl, sanitizeText } from "./sanitize.js";

/** Unified union — every provider's vision-capable model the OCR layer accepts. */
export type OCRModel = AnthropicModelId | GeminiModel | OpenAIModel;

export interface OCRModelInfo {
  id: OCRModel;
  /** Provider family. */
  provider: "anthropic" | "gemini" | "openai";
  /** Human-readable label for UI. */
  label: string;
  /** One-line description shown next to the label. */
  blurb: string;
  /** Rough cost band relative to Sonnet 4.6 (1.0). */
  costBand: number;
  /** Vision capability — gate UI for non-vision models. */
  vision: boolean;
}

/**
 * Registry of all models the OCR layer knows how to call. UI dropdowns,
 * benchmark grids, and pricing summaries all key off this table — adding
 * a new model means one entry here plus a dispatch case below.
 *
 * Entries are ordered approximately from cheapest to most expensive so the
 * bench grid renders in a sensible order.
 */
export const OCR_MODELS: Record<OCRModel, OCRModelInfo> = {
  // ── Anthropic ──────────────────────────────────────────────
  [HAIKU_MODEL]: {
    id: HAIKU_MODEL,
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    blurb: "가장 저렴 · 빠름. 텍스트 위주 페이지에 적합.",
    costBand: 0.2,
    vision: true,
  },
  [SONNET_MODEL]: {
    id: SONNET_MODEL,
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    blurb: "기본값. 비전 + JSON 균형.",
    costBand: 1.0,
    vision: true,
  },
  [OPUS_MODEL]: {
    id: OPUS_MODEL,
    provider: "anthropic",
    label: "Claude Opus 4.7",
    blurb: "도형 정확도 최상. 느림·비쌈 (Sonnet의 약 5×).",
    costBand: 5.0,
    vision: true,
  },

  // ── Gemini 3 (current) ─────────────────────────────────────
  [GEMINI_3_1_FLASH_LITE]: {
    id: GEMINI_3_1_FLASH_LITE,
    provider: "gemini",
    label: "Gemini 3.1 Flash-Lite",
    blurb: "정식. 가장 저렴한 Gemini 비전 — 단순 OCR에 적합.",
    costBand: 0.15,
    vision: true,
  },
  [GEMINI_3_FLASH]: {
    id: GEMINI_3_FLASH,
    provider: "gemini",
    label: "Gemini 3 Flash (Preview)",
    blurb: "프리뷰. 큰 모델 품질을 저렴하게.",
    costBand: 0.4,
    vision: true,
  },
  [GEMINI_3_5_FLASH]: {
    id: GEMINI_3_5_FLASH,
    provider: "gemini",
    label: "Gemini 3.5 Flash",
    blurb: "정식. 가장 똑똑한 Gemini Flash, 에이전트·코딩 균형.",
    costBand: 0.8,
    vision: true,
  },
  [GEMINI_3_1_PRO]: {
    id: GEMINI_3_1_PRO,
    provider: "gemini",
    label: "Gemini 3.1 Pro (Preview)",
    blurb: "최고 시각 인텔리전스. 무료 한도 0 — Google Cloud 결제 필요.",
    costBand: 3.0,
    vision: true,
  },

  // ── Gemini 2.5 (legacy / fallback) ─────────────────────────
  [GEMINI_2_5_FLASH_LITE]: {
    id: GEMINI_2_5_FLASH_LITE,
    provider: "gemini",
    label: "Gemini 2.5 Flash-Lite",
    blurb: "레거시. 텍스트 전용 — 비전 작업엔 비추천.",
    costBand: 0.1,
    vision: false,
  },
  [GEMINI_2_5_FLASH]: {
    id: GEMINI_2_5_FLASH,
    provider: "gemini",
    label: "Gemini 2.5 Flash",
    blurb: "레거시. 저렴한 비전, 무료 한도 사용 가능.",
    costBand: 0.3,
    vision: true,
  },
  [GEMINI_2_5_PRO]: {
    id: GEMINI_2_5_PRO,
    provider: "gemini",
    label: "Gemini 2.5 Pro",
    blurb: "레거시. 무료 한도 0 — 결제 필요. 3.1 Pro 권장.",
    costBand: 2.0,
    vision: true,
  },

  // ── OpenAI / GPT ───────────────────────────────────────────
  [GPT_5_NANO]: {
    id: GPT_5_NANO,
    provider: "openai",
    label: "GPT-5 Nano",
    blurb: "초저가. 단순 OCR · 짧은 문항에 적합.",
    costBand: 0.2,
    vision: true,
  },
  [GPT_4O_MINI]: {
    id: GPT_4O_MINI,
    provider: "openai",
    label: "GPT-4o Mini",
    blurb: "안정 · 저렴 · 빠른 비전. 베이스라인.",
    costBand: 0.2,
    vision: true,
  },
  [GPT_4_1_MINI]: {
    id: GPT_4_1_MINI,
    provider: "openai",
    label: "GPT-4.1 Mini",
    blurb: "4.1 라이트. 균형형 비전 + JSON.",
    costBand: 0.4,
    vision: true,
  },
  [GPT_5_MINI]: {
    id: GPT_5_MINI,
    provider: "openai",
    label: "GPT-5 Mini",
    blurb: "GPT-5 축소판. 가성비 좋음.",
    costBand: 0.6,
    vision: true,
  },
  [GPT_4O]: {
    id: GPT_4O,
    provider: "openai",
    label: "GPT-4o",
    blurb: "검증된 안정성. OCR 베이스라인으로 인기.",
    costBand: 1.0,
    vision: true,
  },
  [O4_MINI]: {
    id: O4_MINI,
    provider: "openai",
    label: "o4-mini",
    blurb: "경량 reasoning 모델. 복잡 도형에 강함.",
    costBand: 1.2,
    vision: true,
  },
  [GPT_4_1]: {
    id: GPT_4_1,
    provider: "openai",
    label: "GPT-4.1",
    blurb: "비전 + 구조화 출력 균형. GPT-4o 대안.",
    costBand: 1.5,
    vision: true,
  },
  [GPT_5]: {
    id: GPT_5,
    provider: "openai",
    label: "GPT-5",
    blurb: "초기 GPT-5. 안정적인 비전·추론.",
    costBand: 3.0,
    vision: true,
  },
  [GPT_5_2]: {
    id: GPT_5_2,
    provider: "openai",
    label: "GPT-5.2",
    blurb: "5.5 직전 마이너. 안정성 좋음.",
    costBand: 1.8,
    vision: true,
  },
  [GPT_5_5]: {
    id: GPT_5_5,
    provider: "openai",
    label: "GPT-5.5",
    blurb: "2026-04 출시 플래그십. 1M 컨텍스트, $5/$30 per 1M.",
    costBand: 1.7,
    vision: true,
  },
  [GPT_5_5_PRO]: {
    id: GPT_5_5_PRO,
    provider: "openai",
    label: "GPT-5.5 Pro",
    blurb: "최고 정확도. 가장 어려운 도형용. $30/$180 per 1M.",
    costBand: 6.0,
    vision: true,
  },
  [O3]: {
    id: O3,
    provider: "openai",
    label: "o3",
    blurb: "고비용 reasoning. 가장 어려운 도형 케이스용.",
    costBand: 5.0,
    vision: true,
  },
};

interface RawOcrImage {
  box: [number, number, number, number];
  label: string;
}

interface RawOcrItem {
  number: number;
  text: string;
  topic: string;
  images: RawOcrImage[];
  confidence: "high" | "medium" | "low";
  /** Phase F: vector 도형 spec — optional (느슨한 array, 런타임 normalizeDiagram 보정). */
  diagramParams?: unknown;
}

interface RawOcrResponse {
  items: RawOcrItem[];
}

export interface OCRPageInput {
  /** Hi-res page image as a `data:image/...;base64,...` URL. */
  pageBase64: string;
  /** PDF text layer — appended to the prompt as an OCR hint. */
  textLayer: string;
  /** Cancels the underlying fetch on abort. */
  signal?: AbortSignal;
  /**
   * Which model to use. Anthropic and Gemini families both accepted —
   * `extractPageProblems` dispatches based on the provider in OCR_MODELS.
   * Defaults to Sonnet 4.6.
   */
  model?: OCRModel;
}

export interface OCRPageResult {
  items: OCRProblem[];
}

const confidenceToStatus = (c: RawOcrItem["confidence"]): OCRProblem["status"] =>
  c === "high" ? "ok" : "warn";

/**
 * 객관식 발문 패턴 — "...값은?", "...옳은 것은?", "...구하면?" 등.
 * 본문이 이 패턴으로 끝나면 5지선다 보기가 따라와야 정상. 사용자가 보고한
 * 7번 ("두 자연수 225와 135의 공약수의 개수는?") 같은 케이스 잡는 데 사용.
 */
const MULTIPLE_CHOICE_PROMPT = /(\?\s*$|값은\??|옳은\s*것은\??|옳지\s*않은\s*것은\??|구하면\??|개수는\??|넓이는\??|크기는\??|길이는\??|되는\s*것은\??|구하시오\.?|구하여라\.?)/;
const HAS_CHOICE_MARKERS = /[①②③④⑤]/;

/**
 * 모델이 본문(body) 추출에 실패해 옵션만 emit하는 케이스를 감지.
 *
 * Flash-Lite 같이 약한 비전 모델이 한 페이지에 여러 문제 + 5지선다가
 * 빽빽한 경우 본문 텍스트를 통째로 놓치고 ①②③④⑤ 옵션만 가져오는 일이
 * 관찰됨. 사용자는 카드에 본문이 없어 "왜 이 문제가 비어있지?" 가 됨.
 *
 * 휴리스틱: text 의 ①②③④⑤ 마커 첫 등장 이전 부분 (= 본문 후보) 이
 *   - 공백·줄바꿈 제외 10자 미만 → 본문 누락
 *   - 또는 ①②③④⑤ 마커가 없고 객관식 발문 패턴도 아닌데 너무 짧음 (30자 미만) → 본문 부족
 * 일 때 `body-missing` 으로 표시.
 *
 * **객관식 발문이지만 보기 마커 없음** 은 `bodyMissing` 아니라 `choicesMissing`
 * (별도 휴리스틱 — 아래) 으로 잡으므로 여기선 false.
 */
const isBodyTooShort = (text: string): boolean => {
  if (!text) return true;
  const firstMarker = text.search(HAS_CHOICE_MARKERS);
  if (firstMarker >= 0) {
    const body = text.slice(0, firstMarker).replace(/\s+/g, "");
    return body.length < 10;
  }
  // 마커 없음. 객관식 발문이면 보기 누락이지 본문 누락 아님 — false 반환.
  if (MULTIPLE_CHOICE_PROMPT.test(text)) return false;
  return text.replace(/\s+/g, "").length < 30;
};

/**
 * 객관식 발문(`...의 값은?`, `옳은 것은?` 등) 이 있는데 ①②③④⑤ 보기
 * 마커가 통째로 누락된 케이스. 사용자가 7번 문제에서 직접 보고:
 *   "두 자연수 225와 135의 공약수의 개수는?"  ← 본문은 잘 들어왔는데
 *   ① 5  ② 6  ③ 7  ④ 8  ⑤ 9 가 통째로 빠짐.
 *
 * 본문 누락보다 더 흔하고 더 chip-confusing 한 실패 모드라 별도 표시
 * 한다. UI 가 `bodyMissing` 과 다른 banner 를 띄울 수 있음.
 */
const isChoicesMissing = (text: string): boolean => {
  if (!text) return false;
  if (HAS_CHOICE_MARKERS.test(text)) return false;
  return MULTIPLE_CHOICE_PROMPT.test(text);
};

const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `ocr-${Math.random().toString(36).slice(2)}-${Date.now()}`;

/** Build the user-facing prompt + OCR-layer hint (used by every provider). */
const buildUserText = (textLayer: string): string => {
  const hint = textLayer.trim().slice(0, 2000);
  return hint
    ? `${OCR_PAGE_PROMPT}\n\n[PDF text-layer OCR hint — may contain noise; use only to disambiguate]\n${hint}`
    : OCR_PAGE_PROMPT;
};

/** Map a raw JSON response (provider-agnostic) to OCRProblem[]. */
const normalizeResponse = (parsed: RawOcrResponse): OCRProblem[] =>
  (parsed.items ?? []).map((raw) => {
    const text = sanitizeText(raw.text ?? "");
    const bodyMissing = isBodyTooShort(text);
    const choicesMissing = isChoicesMissing(text);
    return {
      id: newId(),
      number: raw.number,
      text,
      topic: raw.topic?.trim() ? raw.topic.trim() : undefined,
      images:
        Array.isArray(raw.images) && raw.images.length > 0
          ? raw.images
              .filter((im) => Array.isArray(im.box) && im.box.length === 4)
              .map((im) => ({
                box: [im.box[0], im.box[1], im.box[2], im.box[3]] as [
                  number,
                  number,
                  number,
                  number,
                ],
                label: typeof im.label === "string" ? im.label : "",
              }))
          : undefined,
      // Phase F: vector 도형 spec 보존. array 가 아니거나 빈 배열이면 undefined →
      // OCRItem 이 bbox crop fallback 사용 (images 필드).
      diagramParams:
        Array.isArray(raw.diagramParams) && raw.diagramParams.length > 0
          ? (raw.diagramParams as OCRProblem["diagramParams"])
          : undefined,
      // 본문 또는 보기 누락은 confidence 와 무관하게 강제 warn — 사용자 검토 필수.
      status:
        bodyMissing || choicesMissing
          ? ("warn" as const)
          : confidenceToStatus(raw.confidence),
      bodyMissing,
      choicesMissing,
      reviewed: false,
    };
  });

/**
 * Generic JSON parser with truncation-aware error messages. Exported so the
 * solutions-generation layer (and any future schema-output caller) can reuse
 * the same Korean-friendly diagnostics.
 */
export const parseJsonOrThrow = <T = unknown>(rawJson: string): T => {
  try {
    return JSON.parse(rawJson) as T;
  } catch (err) {
    const errMsg = (err as Error).message;
    const isTruncation = /Unexpected end of JSON input|Unterminated string/i.test(errMsg);
    const preview = rawJson.slice(0, 200).replace(/\s+/g, " ");
    const tail = rawJson.slice(-160).replace(/\s+/g, " ");
    if (isTruncation) {
      throw new Error(
        `모델 응답이 토큰 한도에서 잘렸습니다 (출력 ${rawJson.length}자, JSON 미완성). ` +
          `inline SVG가 많거나 문제 수가 많은 페이지에서 자주 발생합니다. ` +
          `더 강한 모델(3 Flash / 3.5 Flash / 3.1 Pro) 사용 또는 도형 적은 페이지에서만 Flash-Lite 사용 권장.\n` +
          `시작: ${preview}…\n끝: …${tail}`,
      );
    }
    throw new Error(
      `[ai] Model returned invalid JSON (length=${rawJson.length}). ` +
        `Preview: ${preview}${rawJson.length > 200 ? "…" : ""}. ` +
        `Original error: ${errMsg}`,
    );
  }
};

// ─── Anthropic backend ────────────────────────────────────────────────
const callAnthropic = async (
  input: OCRPageInput,
  model: AnthropicModelId,
): Promise<RawOcrResponse> => {
  const { mediaType, data } = parseDataUrl(input.pageBase64);

  // ⚠ STREAMING 필수 — Anthropic SDK는 `max_tokens > ~21333` (모델별 threshold)
  //   에서 non-streaming 호출을 차단한다 (10분 이상 걸릴 수 있는 요청은
  //   streaming만 허용). 우리는 multi-problem + inline SVG를 한 번에 받기
  //   위해 64k까지 요청하므로 streaming 경로를 쓴다.
  //
  //   `messages.stream()` → `await stream.finalMessage()` 로 최종 메시지를
  //   받으면 응답 shape 은 non-streaming `messages.create` 결과와 동일하므로
  //   기존 `extractJsonText` 후처리가 그대로 통한다.
  // tool_use 패턴 — Anthropic 권장. output_config.format.schema 의 strict
  // validator 가 array schema 거부 (`maxItems is not supported`) 문제 회피.
  // streaming + tool_use 호환됨 (final 메시지 content 에 tool_use block 포함).
  const TOOL_NAME = "emit_ocr_result";
  const stream = anthropic.messages.stream(
    {
      model,
      max_tokens: 64000,
      // OCR is transcription — pin sampling so reruns of the same image
      // give the same JSON. Default 1.0 caused noticeable run-to-run
      // drift in problem-body extraction. See callGemini comment.
      temperature: 0.1,
      system: SYSTEM_BLOCKS,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data } },
            { type: "text", text: buildUserText(input.textLayer) },
          ],
        },
      ],
      tools: [
        {
          name: TOOL_NAME,
          description:
            "Emit the OCR result for this page as JSON — items array of problems with body/choices/images/etc.",
          input_schema: OCR_PAGE_SCHEMA as unknown as {
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

  const response = await stream.finalMessage();
  // tool_use 패턴: 응답 content 에서 emit_ocr_result tool block 의 input
  // (이미 parsed JSON object) 추출.
  return extractToolUseInput(response, TOOL_NAME) as RawOcrResponse;
};

// ─── Gemini backend ───────────────────────────────────────────────────
/**
 * Convert our JSON-Schema-flavoured OCR_PAGE_SCHEMA into Gemini's
 * responseSchema shape. The two are structurally similar (Gemini accepts
 * an OpenAPI-3 subset) but use uppercase `Type.OBJECT` enum strings that
 * Gemini wraps as `"OBJECT"` / `"ARRAY"` / `"STRING"` / `"NUMBER"` /
 * `"INTEGER"` / `"BOOLEAN"` and ignores `additionalProperties`.
 */
export const toGeminiSchema = (jsonSchema: unknown): Record<string, unknown> => {
  const convert = (s: any): any => {
    if (s === null || typeof s !== "object") return s;
    if (Array.isArray(s)) return s.map(convert);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) {
      if (k === "additionalProperties") continue; // not supported
      if (k === "type" && typeof v === "string") {
        out.type = v.toUpperCase(); // object → OBJECT
      } else if (k === "items" || k === "properties") {
        out[k] = convert(v);
      } else if (k === "enum") {
        out[k] = v;
      } else {
        out[k] = convert(v);
      }
    }
    return out;
  };
  return convert(jsonSchema);
};

/**
 * Convert raw Gemini SDK errors (which arrive as a long JSON-encoded
 * message containing nested QuotaFailure protos) into a short Korean
 * message that fits in a UI banner. The original raw message is appended
 * as a footer so power users can still inspect details.
 */
export const friendlyGeminiError = (rawMessage: string, model: GeminiModel): string => {
  // RESOURCE_EXHAUSTED / 429 — almost always the free-tier-limit-0 case for
  // Pro models when the user hasn't enabled billing on the API key.
  if (/429|RESOURCE_EXHAUSTED|quota/i.test(rawMessage)) {
    // Pull `retryDelay` if present so we can hint at the wait time.
    const delayMatch = rawMessage.match(/"retryDelay":"([^"]+)"/);
    const delay = delayMatch ? ` (재시도 권장 대기: ${delayMatch[1]})` : "";
    // Pro / preview models that ship with free-tier-0 limits.
    const billingRequired = [
      "gemini-2.5-pro",
      "gemini-3.1-pro-preview",
      "gemini-3-pro-preview", // legacy alias
    ];
    if (billingRequired.includes(model)) {
      return (
        `Gemini ${model}는 무료 티어 한도가 0입니다 — Google Cloud 결제(billing) 활성화가 필요합니다.${delay}\n` +
        `https://aistudio.google.com/apikey 에서 결제 설정 후 다시 시도하거나, ` +
        `무료 한도가 있는 Flash 모델(Gemini 3.5 Flash / 3 Flash / 3.1 Flash-Lite)을 선택해 주세요.`
      );
    }
    return `Gemini 할당량 초과 (RESOURCE_EXHAUSTED).${delay}`;
  }
  // Permission / invalid key
  if (/PERMISSION_DENIED|API key/i.test(rawMessage)) {
    return "Gemini API 키가 유효하지 않거나 권한이 없습니다. .env.local의 GEMINI_API_KEY를 확인해 주세요.";
  }
  // Model not available in this region
  if (/NOT_FOUND|not found|unsupported/i.test(rawMessage)) {
    return `Gemini 모델 ${model}을 호출할 수 없습니다 — 모델명/지역(region) 지원 여부를 확인하세요.`;
  }
  // Anything else — first sentence of the raw message.
  const firstSentence = rawMessage.split(/[.\n]/).find((s) => s.trim().length > 0);
  return firstSentence?.trim() || rawMessage.slice(0, 200);
};

const callGemini = async (
  input: OCRPageInput,
  model: GeminiModel,
): Promise<RawOcrResponse> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }

  const ai = getGeminiClient();
  const { data } = parseDataUrl(input.pageBase64);
  // Infer MIME from the data-URL prefix; default to png since pdfProcessor
  // always emits PNG.
  const mimeMatch = input.pageBase64.match(/^data:([^;]+);base64,/);
  const mimeType = mimeMatch?.[1] ?? "image/png";

  // Gemini doesn't have prompt-caching first-class; we still inline the
  // common math instructions so the model has the same formatting context.
  const system = COMMON_INSTRUCTIONS;
  const userText = buildUserText(input.textLayer);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data } },
            { text: `${system}\n\n${userText}` },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: toGeminiSchema(OCR_PAGE_SCHEMA) as any,
        // OCR is a transcription task — we want the same image to produce
        // the same text every time. Gemini's default temperature (~1.0)
        // gave the user noticeably different `(-3) + (-6) = ?` extractions
        // across reruns. Pinning to 0.1 makes runs near-deterministic
        // without quite hitting greedy-decoding stuck-loop pathologies
        // that pure 0.0 occasionally has on long structured outputs.
        temperature: 0.1,
        // 토큰 한도 — 시험지 OCR은 multi-problem + inline SVG 때문에 한
        // 페이지 응답이 50k 토큰 넘어가는 케이스가 정상. Gemini 3.x 는 모델
        // 별로 65536 토큰 출력까지 허용 (3.1 Pro는 모델에 따라 더 큼).
        // 사용자 요청에 따라 모델 max 까지 풀어둠 — truncation 으로 인한
        // 재실행이 사용량보다 비싸므로 한 번에 다 받는 게 경제적.
        maxOutputTokens: 65536,
        // SDK signal hand-through. Field name matches @google/genai v1.44+.
        abortSignal: input.signal,
      },
    });

    // `response.text` in @google/genai gives the concatenated text content of
    // the first candidate. With responseMimeType: application/json, this is
    // the raw JSON string ready to parse.
    const rawJson = typeof response.text === "string" ? response.text : "";
    if (!rawJson) {
      throw new Error("[ocr/gemini] Empty response — no text content.");
    }

    // Check finishReason: if MAX_TOKENS, the response was truncated mid-emit.
    // The JSON may or may not be parseable depending on where the cut landed,
    // but the result is incomplete either way — fail with an actionable hint
    // rather than letting parseJsonOrThrow surface a generic "Unexpected end"
    // message that doesn't tell the user *why* it ended.
    const finishReason = (response as { candidates?: Array<{ finishReason?: string }> })
      .candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") {
      throw new Error(
        `${model} 응답이 출력 토큰 한도(${65536})에 막혀 잘렸습니다 — 한 페이지에 들어가는 ` +
          `문제 수와 inline SVG 양이 모델 단일 응답 capacity를 초과합니다. ` +
          `해결: (1) 더 큰 모델(3.1 Pro / Gemini 3.5 Flash 등) 사용, ` +
          `(2) 페이지를 더 잘게 나눠서 별도 호출.`,
      );
    }

    return parseJsonOrThrow(stripCodeFences(rawJson));
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    const raw = (err as Error).message ?? String(err);
    const friendly = friendlyGeminiError(raw, model);
    // Throw a single Error whose message is the friendly summary; keep raw
    // message as `cause` so the UI can offer a "원본 에러" disclosure.
    const wrapped = new Error(friendly);
    (wrapped as Error & { cause?: unknown }).cause = raw;
    throw wrapped;
  }
};

// ─── OpenAI backend ───────────────────────────────────────────────────
/**
 * Models that require `max_completion_tokens` instead of `max_tokens` AND
 * reject `temperature`. Includes the entire GPT-5 family and the o-series
 * reasoning models — empirically confirmed by 400 errors of the form
 * "Unsupported parameter: 'max_tokens' is not supported with this model.
 *  Use 'max_completion_tokens' instead." from gpt-5 / gpt-5.2 / gpt-5.5.
 */
export const usesCompletionTokens = (model: OpenAIModel): boolean =>
  model === "o3" ||
  model === "o4-mini" ||
  model === "gpt-5" ||
  model === "gpt-5-mini" ||
  model === "gpt-5-nano" ||
  model === "gpt-5.2" ||
  model === "gpt-5.5";

/**
 * Short Korean summary of OpenAI errors. Same idea as `friendlyGeminiError`
 * — the raw API message is long English with HTTP codes and rate-limit
 * proto noise; we surface the actionable summary up top, keep the original
 * as `cause` for the "원본 에러" disclosure.
 */
export const friendlyOpenAIError = (rawMessage: string, model: OpenAIModel): string => {
  // 429 Request too large → TPM (tokens per minute) ceiling hit by a single
  // request. Common on reasoning Pro models with strict free-tier limits.
  if (/Request too large|tokens per min|TPM/i.test(rawMessage)) {
    const m = rawMessage.match(/Limit (\d+),\s*Requested (\d+)/);
    const detail = m ? ` (한도 ${m[1]} / 요청 ${m[2]} TPM)` : "";
    return (
      `${model}의 분당 토큰 한도(TPM)를 단일 요청이 초과했습니다${detail}. ` +
      `결제 등급(billing tier)을 올리거나, 더 저렴한 모델(GPT-5 Mini / GPT-4o Mini) 사용을 권장합니다. ` +
      `https://platform.openai.com/account/rate-limits 에서 한도 확인 가능합니다.`
    );
  }
  // 429 quota / billing
  if (/quota|exceeded|billing|payment/i.test(rawMessage) && /429/.test(rawMessage)) {
    return `OpenAI 할당량 초과 — 결제 등급 또는 잔액을 확인해 주세요. (${model})`;
  }
  // 401 / invalid key
  if (/401|invalid api key|incorrect/i.test(rawMessage)) {
    return "OpenAI API 키가 유효하지 않습니다. .env.local의 OPENAI_API_KEY를 확인해 주세요.";
  }
  // 404 / model not found
  if (/404|model.*not found|not a chat model/i.test(rawMessage)) {
    return `OpenAI 모델 ${model}을 호출할 수 없습니다. 계정 권한 또는 모델명을 확인하세요.`;
  }
  // Anything else — first sentence
  const firstSentence = rawMessage.split(/[.\n]/).find((s) => s.trim().length > 0);
  return firstSentence?.trim() || rawMessage.slice(0, 200);
};

/**
 * Models that DON'T support the chat-completions endpoint at all and must
 * be called via the Responses API. As of 2026-05 this is just gpt-5.5-pro,
 * which returns "404 This is not a chat model" from /v1/chat/completions.
 */
export const requiresResponsesAPI = (model: OpenAIModel): boolean =>
  model === "gpt-5.5-pro";

const callOpenAIResponsesAPI = async (
  input: OCRPageInput,
  model: OpenAIModel,
): Promise<RawOcrResponse> => {
  const client = getOpenAIClient();
  const { mediaType, data } = parseDataUrl(input.pageBase64);
  const dataUrl = `data:${mediaType};base64,${data}`;
  const userText = buildUserText(input.textLayer);

  // The Responses API uses a different shape: `input[]` instead of
  // `messages[]`, `input_image` / `input_text` instead of typed content
  // parts, and `text.format` instead of `response_format`.
  //
  // 토큰 한도 — 사용자 요청에 따라 모델 max 까지 풀어둠. GPT-5.5 Pro 는
  // reasoning 토큰을 내부적으로 소비하지만, TPM 한도(결제 등급 의존)는
  // 결제 등급이 올라가면 자동으로 해제되므로 한도에 맞춰 가변 제한을
  // 두기보다 max 까지 풀어두고 TPM 에러 시 모델 다운그레이드 안내가 더
  // 깔끔하다. 비-Pro 는 chat completions 경로의 16k cap 과 동일하게 16k.
  const maxOutput = model === "gpt-5.5-pro" ? 64000 : 16000;
  const response = await client.responses.create(
    {
      model,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: `${COMMON_INSTRUCTIONS}\n\n${userText}` },
            { type: "input_image", image_url: dataUrl, detail: "high" },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "OCRPageResult",
          schema: OCR_PAGE_SCHEMA as unknown as Record<string, unknown>,
          strict: true,
        },
      },
      max_output_tokens: maxOutput,
      // Reasoning models burn output tokens on internal "thinking" before
      // emitting a visible message. On a budget of 8k that often leaves
      // zero tokens for the actual JSON answer — output_text comes back
      // empty even though the request "succeeded". Capping reasoning effort
      // to "low" preserves enough budget for the schema-conforming reply.
      reasoning: { effort: "low" },
    } as Parameters<typeof client.responses.create>[0],
    { signal: input.signal ?? undefined },
  );

  // `output_text` is a convenience accessor that concatenates every text
  // content item across all output messages. On reasoning models it can
  // be undefined or "" even when the underlying response has data buried
  // under output[].content[].text — fall back to a manual walk before we
  // give up.
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
    // Most common cause: reasoning effort consumed the whole token budget
    // before any visible message was emitted. Surface the actionable hint
    // instead of a generic "empty response".
    const reason = r.incomplete_details?.reason;
    if (reason === "max_output_tokens" || r.status === "incomplete") {
      throw new Error(
        `${model} 응답이 reasoning 단계에서 토큰을 모두 소진해 보이는 결과를 만들지 못했습니다. ` +
          `reasoning.effort를 더 낮추거나, GPT-5.5(non-Pro) 등 경량 모델 사용을 권장합니다.`,
      );
    }
    throw new Error(`[ocr/openai] ${model} returned no output_text / output messages.`);
  }
  return parseJsonOrThrow(stripCodeFences(rawJson));
};

const callOpenAI = async (
  input: OCRPageInput,
  model: OpenAIModel,
): Promise<RawOcrResponse> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }

  try {
    // gpt-5.5-pro: chat completions endpoint rejects it ("Not a chat model"),
    // so we use the Responses API instead.
    if (requiresResponsesAPI(model)) {
      return await callOpenAIResponsesAPI(input, model);
    }

    const client = getOpenAIClient();
    const { mediaType, data } = parseDataUrl(input.pageBase64);
    const dataUrl = `data:${mediaType};base64,${data}`;
    const userText = buildUserText(input.textLayer);

    // OpenAI's `response_format: json_schema` requires the schema to be wrapped
    // in `{ name, schema, strict }`. Our existing OCR_PAGE_SCHEMA already meets
    // strict-mode requirements (additionalProperties: false, all keys required).
    const useCompletionTokens = usesCompletionTokens(model);
    const response = await client.chat.completions.create(
      {
        model,
        messages: [
          { role: "system", content: COMMON_INSTRUCTIONS },
          {
            role: "user",
            content: [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "OCRPageResult",
            schema: OCR_PAGE_SCHEMA as unknown as Record<string, unknown>,
            strict: true,
          },
        },
        // GPT-5 series + o-series: only `max_completion_tokens` is accepted
        // (and `temperature` is rejected). Everything older (gpt-4o, gpt-4.1)
        // still uses the classic `max_tokens` + `temperature` pair.
        // 토큰 한도 — OpenAI chat completions는 output cap이 16k(공식 max).
        // 모델별 더 큰 cap은 Responses API 경로에서만 가능하므로 여기선
        // 16k 유지(공식 한계).
        // Pin sampling for transcription consistency. GPT-5 / o-series
        // reject `temperature` entirely (`usesCompletionTokens === true`);
        // for them the reasoning effort cap is the closest equivalent.
        ...(useCompletionTokens
          ? { max_completion_tokens: 16000 }
          : { max_tokens: 16000, temperature: 0.1 }),
      },
      { signal: input.signal ?? undefined },
    );

    const rawJson = response.choices[0]?.message?.content ?? "";
    if (!rawJson) {
      throw new Error("[ocr/openai] Empty response — no text content.");
    }
    return parseJsonOrThrow(stripCodeFences(rawJson));
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
const extractPageProblemsDirect = async (
  input: OCRPageInput,
): Promise<OCRPageResult> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }

  const model = (input.model ?? DEFAULT_MODEL) as OCRModel;
  const info = OCR_MODELS[model];
  if (!info) {
    throw new Error(`[ocr] Unknown model "${model}". Add it to OCR_MODELS.`);
  }
  if (!info.vision) {
    throw new Error(
      `[ocr] Model "${model}" doesn't support vision input — pick a vision-capable model.`,
    );
  }

  let parsed: RawOcrResponse;
  if (info.provider === "anthropic") {
    parsed = await callAnthropic(input, model as AnthropicModelId);
  } else if (info.provider === "gemini") {
    parsed = await callGemini(input, model as GeminiModel);
  } else {
    parsed = await callOpenAI(input, model as OpenAIModel);
  }

  return { items: normalizeResponse(parsed) };
};

/**
 * 클라이언트 프로덕션 빌드 — `/api/ai-ocr` Vercel function 호출. AI 키가
 * 클라이언트 번들에 박히지 않음 (Phase 5a). dev 환경에서는 `USE_API=false`
 * 라 *direct SDK* 사용.
 */
const extractPageProblemsViaApi = async (
  input: OCRPageInput,
): Promise<OCRPageResult> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }
  const { signal, ...body } = input;
  const res = await fetch("/api/ai-ocr", {
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

/**
 * USE_API 결정 — 서버 (Vercel function) 에서는 *항상 false* (자기 자신 호출
 * 무한 루프 방지). 브라우저에서는 PROD 또는 VITE_USE_API 환경에 따라.
 *
 * `import.meta.env` 는 Vite-only — Node ESM 런타임에서 *undefined* 라 .PROD
 * 접근 시 TypeError. typeof guard + optional chaining 으로 우회.
 */
const USE_API: boolean =
  typeof window !== "undefined" &&
  typeof import.meta !== "undefined" &&
  Boolean(import.meta.env?.PROD || import.meta.env?.VITE_USE_API === "true");

export const extractPageProblems: typeof extractPageProblemsDirect = USE_API
  ? extractPageProblemsViaApi
  : extractPageProblemsDirect;
