import OpenAI from "openai";
import { normalizeOpenAIUsage } from "../../lib/pricing.js";

export const DEEPSEEK_MODEL = "deepseek-v4-pro" as const;
let client: OpenAI | undefined;

/** Server only: the key never enters Vite's browser defines. */
export async function deepseekText(system: string, prompt: string, options: {
  schema?: object; signal?: AbortSignal; maxTokens?: number;
} = {}) {
  if (typeof window !== "undefined") throw new Error("DeepSeek는 서버 API를 통해 호출해야 합니다.");
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("서버에 DEEPSEEK_API_KEY가 설정되지 않았습니다.");
  client ??= new OpenAI({ apiKey: key, baseURL: "https://api.deepseek.com", maxRetries: 0 });
  const response = await client.chat.completions.create({
    model: DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: options.schema
        ? `${prompt}\n\nReturn only valid JSON following this schema. Escape LaTeX backslashes twice in JSON strings.\n${JSON.stringify(options.schema)}`
        : prompt },
    ],
    ...(options.schema ? { response_format: { type: "json_object" as const } } : {}),
    reasoning_effort: "low",
    max_tokens: options.maxTokens ?? 16000,
  }, { signal: options.signal });
  const choice = response.choices[0];
  if (choice?.finish_reason === "length") throw new Error("DeepSeek 응답이 출력 토큰 한도로 잘렸습니다. 문항을 나누어 다시 시도하세요.");
  if (choice?.finish_reason !== "stop") throw new Error(`DeepSeek 응답을 완료하지 못했습니다 (${choice?.finish_reason ?? "empty"}).`);
  const text = choice.message.content;
  if (!text?.trim()) throw new Error("DeepSeek가 빈 응답을 반환했습니다.");
  const usage = normalizeOpenAIUsage(response.usage);
  const cached = (response.usage as { prompt_cache_hit_tokens?: number } | undefined)?.prompt_cache_hit_tokens ?? 0;
  usage.cacheReadTokens = cached;
  usage.inputTokens = Math.max(0, usage.inputTokens - cached);
  return { text, usage };
}
