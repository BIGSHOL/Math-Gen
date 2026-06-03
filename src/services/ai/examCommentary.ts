/**
 * 시험지 commentary 서비스 (Phase N+3).
 *
 * mathlab `D:\mathlab\src\lib\exam-analysis\agents\commentary-agent.ts` 의
 * aiAnalysis 메소드 carry-over. Sonnet 4.6 + prompt caching.
 *
 * 흐름:
 *   1. COMMENTARY_SYSTEM_PROMPT → cacheable system block
 *   2. buildCommentaryUserPrompt(basic) → user content
 *   3. anthropic.messages.create({ system, messages, max_tokens: 16000 })
 *   4. content 추출 → parseJsonResponse (3-tier fallback)
 *   5. CommentaryResult 반환
 */

import { anthropic, SONNET_MODEL } from "./client.js";
import { SYSTEM_BLOCKS } from "./generate.js";
import {
  COMMENTARY_SYSTEM_PROMPT,
  buildCommentaryUserPrompt,
} from "./examCommentaryPrompts.js";
import type {
  AnalyzeCommentaryInput,
  AnalyzeCommentaryOutput,
  CommentaryResult,
} from "@app/types/examAnalysis";

// ════════════════════════════════════════════════════════════════════
// §1. parseJsonResponse — 3-tier fallback (mathlab ai-engine.ts 동일)
// ════════════════════════════════════════════════════════════════════

const stripCodeFence = (text: string): string => {
  return text
    .replace(/^\s*```(?:json)?\s*\n?/i, "")
    .replace(/\n?\s*```\s*$/i, "")
    .trim();
};

const fixTrailingCommasAndUndefined = (text: string): string => {
  return text
    .replace(/,(\s*[}\]])/g, "$1") // trailing comma
    .replace(/:\s*undefined\b/g, ": null"); // undefined → null
};

const fixInvalidEscapes = (text: string): string => {
  // \s, \w 같은 정규식 escape 가 JSON 안 들어오면 invalid
  return text.replace(/\\([^"\\/bfnrtu])/g, "\\\\$1");
};

const parseJsonResponse = (text: string): unknown => {
  const stripped = stripCodeFence(text);
  // 첫 { 부터 마지막 } 까지 추출
  const startIdx = stripped.indexOf("{");
  const endIdx = stripped.lastIndexOf("}");
  if (startIdx < 0 || endIdx <= startIdx) {
    throw new Error("Commentary JSON 객체 미발견");
  }
  const jsonStr = stripped.slice(startIdx, endIdx + 1);

  // Tier 1: 그대로 시도
  try {
    return JSON.parse(jsonStr);
  } catch {
    // 계속 다음 tier
  }

  // Tier 2: trailing comma + undefined 정리
  try {
    return JSON.parse(fixTrailingCommasAndUndefined(jsonStr));
  } catch {
    // 계속
  }

  // Tier 3: invalid escape 정리
  try {
    return JSON.parse(
      fixInvalidEscapes(fixTrailingCommasAndUndefined(jsonStr)),
    );
  } catch (err) {
    throw new Error(
      `Commentary JSON parse 실패 (3-tier 모두 실패): ${(err as Error).message}`,
    );
  }
};

// ════════════════════════════════════════════════════════════════════
// §2. analyzeCommentaryDirect — direct SDK 호출
// ════════════════════════════════════════════════════════════════════

const analyzeCommentaryDirect = async (
  input: AnalyzeCommentaryInput,
): Promise<AnalyzeCommentaryOutput> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }

  const userContent = buildCommentaryUserPrompt(input.basic, {
    schoolName: input.schoolName,
    examName: input.examName,
    nearbyNote: input.nearbyComparisonNote,
    yearNote: input.yearComparisonNote,
  });

  // System blocks:
  //   block 0~ = 기존 SYSTEM_BLOCKS (COMMON_INSTRUCTIONS, 이미 cache)
  //   block 마지막 = COMMENTARY_SYSTEM_PROMPT (cache_control: ephemeral)
  const systemBlocks: Array<{
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral" };
  }> = [
    ...SYSTEM_BLOCKS,
    {
      type: "text",
      text: COMMENTARY_SYSTEM_PROMPT,
      cache_control: { type: "ephemeral" as const },
    },
  ];

  const response = await anthropic.messages.create(
    {
      model: SONNET_MODEL,
      max_tokens: 16384,
      temperature: 0.5,
      system: systemBlocks,
      messages: [{ role: "user", content: userContent }],
    },
    input.signal ? { signal: input.signal } : undefined,
  );

  // text content 추출 — Anthropic SDK ContentBlock union 안전 분기
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  if (!text) {
    throw new Error("Commentary 응답이 비어있습니다");
  }

  if (
    (response as { stop_reason?: string }).stop_reason === "max_tokens"
  ) {
    console.warn(
      "[examCommentary] max_tokens 도달 — 응답이 잘렸을 수 있음. partial 파싱 시도.",
    );
  }

  // JSON 추출 + 후처리
  const parsed = parseJsonResponse(text) as CommentaryResult;

  const usage = (
    response as {
      usage?: {
        input_tokens?: number;
        output_tokens?: number;
        cache_read_input_tokens?: number;
        cache_creation_input_tokens?: number;
      };
    }
  ).usage;

  if (import.meta.env?.DEV) {
    console.debug(
      `[ai/examCommentary] cache_read=${usage?.cache_read_input_tokens ?? 0} cache_create=${usage?.cache_creation_input_tokens ?? 0} input=${usage?.input_tokens ?? 0} output=${usage?.output_tokens ?? 0}`,
    );
  }

  return {
    result: parsed,
    modelUsed: SONNET_MODEL,
    _usage: usage,
  };
};

// ════════════════════════════════════════════════════════════════════
// §3. analyzeCommentaryViaApi — Vercel function 경유
// ════════════════════════════════════════════════════════════════════

const analyzeCommentaryViaApi = async (
  input: AnalyzeCommentaryInput,
): Promise<AnalyzeCommentaryOutput> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }
  const { signal, ...body } = input;
  const { currentAccessToken } = await import("../api/supabase.js");
  const token = await currentAccessToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch("/api/ai-exam-commentary", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
};

// ════════════════════════════════════════════════════════════════════
// §4. USE_API switch
// ════════════════════════════════════════════════════════════════════

const USE_API: boolean =
  typeof window !== "undefined" &&
  typeof import.meta !== "undefined" &&
  Boolean(
    import.meta.env?.PROD || import.meta.env?.VITE_USE_API === "true",
  );

/** Commentary 메인 entry — direct / fetch 자동 분기. */
export const analyzeCommentary: (
  input: AnalyzeCommentaryInput,
) => Promise<AnalyzeCommentaryOutput> = USE_API
  ? analyzeCommentaryViaApi
  : analyzeCommentaryDirect;

export { analyzeCommentaryDirect, analyzeCommentaryViaApi };
export type { AnalyzeCommentaryInput, AnalyzeCommentaryOutput };
