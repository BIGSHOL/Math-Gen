/**
 * AI 모델 단가 + 사용량 → 비용 계산.
 *
 * 단위: USD per 1,000,000 tokens. Vercel function 의 `api/_logUsage.ts` 가
 * SDK 응답의 usage 를 추출 → `computeCost(model, normalized)` 호출 → `ai_usage`
 * row 의 `cost_usd` 컬럼에 저장.
 *
 * **provider 별 usage shape 차이**:
 *   - Anthropic: `response.usage.{input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens}`
 *   - Gemini:    `response.usageMetadata.{promptTokenCount, candidatesTokenCount}` (cache 미지원)
 *   - OpenAI:    `response.usage.{prompt_tokens, completion_tokens}` 또는 `{input_tokens, output_tokens}` (Responses API)
 *
 * → `NormalizedUsage` 로 통일 후 computeCost 가 cost 계산.
 *
 * **가격 갱신**: provider 가 단가 변경하면 PRICING 만 수정. 모델 미정의 시
 * 0으로 fallback (cost_usd=0 으로 기록 — total 통계만 약간 부정확).
 */

export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;     // Anthropic only — Gemini/OpenAI 는 0
  cacheCreationTokens: number; // Anthropic only
}

interface ModelPricing {
  /** Input tokens 단가 (USD per 1M). */
  input: number;
  /** Output tokens 단가. */
  output: number;
  /** Cache read 단가 — Anthropic prompt caching (보통 input 의 10%). */
  cacheRead: number;
  /** Cache creation 단가 — 5분 TTL 기본 (input 의 1.25x). */
  cacheCreation: number;
}

/**
 * 2026-05 기준 단가 (USD per 1M tokens). 변동 시 provider 콘솔 가격표 확인 후 갱신.
 */
const PRICING: Record<string, ModelPricing> = {
  // ── Anthropic Claude ──────────────────────────────────────────────────
  "claude-sonnet-4-6":  { input: 3.0,  output: 15.0, cacheRead: 0.30, cacheCreation: 3.75 },
  "claude-opus-4-7":    { input: 15.0, output: 75.0, cacheRead: 1.50, cacheCreation: 18.75 },
  "claude-haiku-4-5":   { input: 1.0,  output: 5.0,  cacheRead: 0.10, cacheCreation: 1.25 },

  // ── Google Gemini ─────────────────────────────────────────────────────
  // Gemini 는 prompt caching 미지원 — cacheRead / cacheCreation 0.
  "gemini-2.5-flash":          { input: 0.30, output: 2.50, cacheRead: 0, cacheCreation: 0 },
  "gemini-2.5-flash-lite":     { input: 0.10, output: 0.40, cacheRead: 0, cacheCreation: 0 },
  "gemini-2.5-pro":            { input: 1.25, output: 5.00, cacheRead: 0, cacheCreation: 0 },
  "gemini-3-flash-preview":    { input: 0.30, output: 2.50, cacheRead: 0, cacheCreation: 0 },
  "gemini-3.5-flash":          { input: 0.30, output: 2.50, cacheRead: 0, cacheCreation: 0 },
  "gemini-3.1-flash-lite":     { input: 0.10, output: 0.40, cacheRead: 0, cacheCreation: 0 },
  "gemini-3.1-pro-preview":    { input: 1.25, output: 5.00, cacheRead: 0, cacheCreation: 0 },

  // ── OpenAI ────────────────────────────────────────────────────────────
  "gpt-5":         { input: 5.00,  output: 30.00, cacheRead: 0, cacheCreation: 0 },
  "gpt-5-mini":    { input: 0.30,  output: 2.40,  cacheRead: 0, cacheCreation: 0 },
  "gpt-5-nano":    { input: 0.10,  output: 0.80,  cacheRead: 0, cacheCreation: 0 },
  "gpt-5.2":       { input: 5.00,  output: 30.00, cacheRead: 0, cacheCreation: 0 },
  "gpt-5.5":       { input: 5.00,  output: 30.00, cacheRead: 0, cacheCreation: 0 },
  "gpt-5.5-pro":   { input: 15.00, output: 60.00, cacheRead: 0, cacheCreation: 0 },
  "gpt-4.1":       { input: 2.00,  output: 8.00,  cacheRead: 0, cacheCreation: 0 },
  "gpt-4.1-mini":  { input: 0.40,  output: 1.60,  cacheRead: 0, cacheCreation: 0 },
  "gpt-4o":        { input: 2.50,  output: 10.00, cacheRead: 0, cacheCreation: 0 },
  "gpt-4o-mini":   { input: 0.15,  output: 0.60,  cacheRead: 0, cacheCreation: 0 },
  "o3":            { input: 60.00, output: 240.00, cacheRead: 0, cacheCreation: 0 },
  "o4-mini":       { input: 1.10,  output: 4.40,  cacheRead: 0, cacheCreation: 0 },
};

const DEFAULT_PRICING: ModelPricing = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };

/**
 * normalized usage → USD 비용. model 미등록 시 0.
 *
 * Anthropic prompt caching 적용 시 `inputTokens` 는 *cache miss 부분만* —
 * `cacheReadTokens` 는 별도 90% 할인 단가로 계산.
 */
export const computeCost = (
  model: string,
  usage: NormalizedUsage,
): number => {
  const p = PRICING[model] ?? DEFAULT_PRICING;
  return (
    usage.inputTokens * p.input +
    usage.outputTokens * p.output +
    usage.cacheReadTokens * p.cacheRead +
    usage.cacheCreationTokens * p.cacheCreation
  ) / 1_000_000;
};

/**
 * Anthropic SDK 응답 → NormalizedUsage. response.usage 가 undefined 면 모두 0.
 */
export const normalizeAnthropicUsage = (
  usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  } | undefined,
): NormalizedUsage => ({
  inputTokens: usage?.input_tokens ?? 0,
  outputTokens: usage?.output_tokens ?? 0,
  cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
  cacheCreationTokens: usage?.cache_creation_input_tokens ?? 0,
});

/**
 * Gemini SDK 응답 → NormalizedUsage. cache 무관.
 */
export const normalizeGeminiUsage = (
  usage: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  } | undefined,
): NormalizedUsage => ({
  inputTokens: usage?.promptTokenCount ?? 0,
  outputTokens: usage?.candidatesTokenCount ?? 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
});

/**
 * OpenAI SDK 응답 → NormalizedUsage. chat completions / responses 두 형식 호환.
 */
export const normalizeOpenAIUsage = (
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  } | undefined,
): NormalizedUsage => ({
  inputTokens: usage?.prompt_tokens ?? usage?.input_tokens ?? 0,
  outputTokens: usage?.completion_tokens ?? usage?.output_tokens ?? 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
});
