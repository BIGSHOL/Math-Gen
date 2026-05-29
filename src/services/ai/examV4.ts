/**
 * V4 학원 블로그 서비스 (Phase N+5 — 비활성).
 *
 * mathlab `commentary-agent.ts` 의 generateV4Extension (line 1090-1133) +
 * parseV4Response (line 1138-1220) carry-over. Sonnet 4.6 + prompt caching.
 *
 * V4Extension (9 키) 만 생성 — 기본 commentary 와 별도 lazy 호출. 결과는
 * record.commentary 에 머지 저장 (CommentaryResult 가 v4_* 필드 포함).
 */

import { anthropic, SONNET_MODEL } from "./client";
import { SYSTEM_BLOCKS } from "./generate";
import { SYSTEM_PROMPT_V4, buildV4UserPrompt } from "./examV4Prompts";
import type {
  BasicAnalysisResult,
  CommentaryResult,
} from "@app/types/examAnalysis";

/** V4 확장 9 필드 — CommentaryResult 의 v4_* subset. */
export type V4Extension = Pick<
  CommentaryResult,
  | "v4_exam_overview"
  | "v4_intro"
  | "v4_academy_strategy"
  | "v4_difficulty_rows"
  | "v4_exam_features"
  | "v4_main_analysis"
  | "v4_previous_comparison"
  | "v4_key_questions"
  | "v4_final_strategy"
>;

export interface AnalyzeV4Input {
  basic: BasicAnalysisResult;
  grade?: string | null;
  examCategory?: string | null;
  /** 학원명 — {학원명} placeholder 치환용. */
  academyName?: string | null;
  signal?: AbortSignal;
}

export interface AnalyzeV4Output {
  result: V4Extension;
  modelUsed: string;
  _usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// ════════════════════════════════════════════════════════════════════
// §1. JSON 파싱 (mathlab generateV4Extension 동일 — undefined/trailing comma)
// ════════════════════════════════════════════════════════════════════

const parseV4Json = (text: string): V4Extension => {
  const startIdx = text.indexOf("{");
  const endIdx = text.lastIndexOf("}");
  if (startIdx < 0 || endIdx <= startIdx) {
    throw new Error(`V4 JSON 객체 미발견: ${text.slice(0, 200)}`);
  }
  let json = text.slice(startIdx, endIdx + 1);
  json = json.replace(/:\s*undefined/g, ": null");
  json = json.replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(json) as V4Extension;
};

// ════════════════════════════════════════════════════════════════════
// §2. parseV4Response — 학원명 strip + 구조 정규화 (mathlab carry-over)
// ════════════════════════════════════════════════════════════════════

/** {학원명} placeholder + 벤치마크 누출 학원명 → academyName 또는 "우리 학원". */
const makeAcademyStripper = (academyName: string | null) => {
  const replacement = academyName?.trim() || "우리 학원";
  return (text: unknown): string => {
    const s = String(text ?? "");
    if (!s) return s;
    return s
      .replace(/\{학원명\}/g, replacement)
      .replace(/갈수학학원/g, replacement)
      .replace(/갈수학(?!학원)/g, replacement);
  };
};

const DIFF_VALUES = ["1", "2", "3", "4", "5"] as const;

/** AI 출력 → 안전한 V4Extension (학원명 치환 + difficulty enum + number 강제). */
const parseV4Response = (
  raw: V4Extension,
  academyName: string | null,
): V4Extension => {
  const s = makeAcademyStripper(academyName);
  const o = raw.v4_exam_overview;

  return {
    v4_exam_overview: o
      ? {
          title: s(o.title),
          grade: s(o.grade),
          school: o.school ? s(o.school) : null,
          range: s(o.range),
          total_questions: Number(o.total_questions) || 0,
          total_points: Number(o.total_points) || 0,
          avg_difficulty_label: s(o.avg_difficulty_label),
          peak_difficulty: s(o.peak_difficulty),
          essay_summary: o.essay_summary ? s(o.essay_summary) : undefined,
          expected_grade_cut: o.expected_grade_cut
            ? s(o.expected_grade_cut)
            : undefined,
          one_liner: s(o.one_liner),
        }
      : undefined,
    v4_intro: raw.v4_intro ? s(raw.v4_intro) : undefined,
    v4_academy_strategy: Array.isArray(raw.v4_academy_strategy)
      ? raw.v4_academy_strategy.map((x) => ({ title: s(x.title), body: s(x.body) }))
      : undefined,
    v4_difficulty_rows: Array.isArray(raw.v4_difficulty_rows)
      ? raw.v4_difficulty_rows.map((r) => ({
          question_number: r.question_number ?? "",
          topic: s(r.topic),
          sub_topic: r.sub_topic ? s(r.sub_topic) : undefined,
          difficulty: (DIFF_VALUES.includes(
            String(r.difficulty) as (typeof DIFF_VALUES)[number],
          )
            ? String(r.difficulty)
            : "3") as (typeof DIFF_VALUES)[number],
          points: Number(r.points) || 0,
          analysis_short: r.analysis_short ? s(r.analysis_short) : undefined,
        }))
      : undefined,
    v4_exam_features: raw.v4_exam_features
      ? {
          headline: s(raw.v4_exam_features.headline),
          body: s(raw.v4_exam_features.body),
        }
      : undefined,
    v4_main_analysis: Array.isArray(raw.v4_main_analysis)
      ? raw.v4_main_analysis.map((m) => ({ heading: s(m.heading), body: s(m.body) }))
      : undefined,
    v4_previous_comparison: raw.v4_previous_comparison
      ? {
          headline: s(raw.v4_previous_comparison.headline),
          body: s(raw.v4_previous_comparison.body),
        }
      : undefined,
    v4_key_questions: Array.isArray(raw.v4_key_questions)
      ? raw.v4_key_questions.map((kq) => ({
          question_number: kq.question_number ?? "",
          title: s(kq.title),
          body: s(kq.body),
        }))
      : undefined,
    v4_final_strategy: Array.isArray(raw.v4_final_strategy)
      ? raw.v4_final_strategy.map((x) => ({
          area: s(x.area),
          current_status: s(x.current_status),
          action: s(x.action),
        }))
      : undefined,
  };
};

// ════════════════════════════════════════════════════════════════════
// §3. analyzeV4Direct — direct SDK 호출
// ════════════════════════════════════════════════════════════════════

const analyzeV4Direct = async (
  input: AnalyzeV4Input,
): Promise<AnalyzeV4Output> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }

  const userContent = buildV4UserPrompt({
    basic: input.basic,
    grade: input.grade,
    examCategory: input.examCategory,
    academyName: input.academyName,
  });

  const systemBlocks: Array<{
    type: "text";
    text: string;
    cache_control?: { type: "ephemeral" };
  }> = [
    ...SYSTEM_BLOCKS,
    {
      type: "text",
      text: SYSTEM_PROMPT_V4,
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

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  if (!text) throw new Error("V4 응답이 비어있습니다");

  const raw = parseV4Json(text);
  const result = parseV4Response(raw, input.academyName ?? null);

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
      `[ai/examV4] cache_read=${usage?.cache_read_input_tokens ?? 0} cache_create=${usage?.cache_creation_input_tokens ?? 0} output=${usage?.output_tokens ?? 0}`,
    );
  }

  return { result, modelUsed: SONNET_MODEL, _usage: usage };
};

// ════════════════════════════════════════════════════════════════════
// §4. analyzeV4ViaApi — Vercel function 경유
// ════════════════════════════════════════════════════════════════════

const analyzeV4ViaApi = async (
  input: AnalyzeV4Input,
): Promise<AnalyzeV4Output> => {
  if (input.signal?.aborted) {
    throw new DOMException("Aborted before request", "AbortError");
  }
  const { signal, ...body } = input;
  const { currentAccessToken } = await import("../api/supabase.js");
  const token = await currentAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch("/api/ai-exam-v4", {
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
// §5. USE_API switch
// ════════════════════════════════════════════════════════════════════

const USE_API: boolean =
  typeof window !== "undefined" &&
  typeof import.meta !== "undefined" &&
  Boolean(import.meta.env?.PROD || import.meta.env?.VITE_USE_API === "true");

export const analyzeV4Blog: (
  input: AnalyzeV4Input,
) => Promise<AnalyzeV4Output> = USE_API ? analyzeV4ViaApi : analyzeV4Direct;

export { analyzeV4Direct, analyzeV4ViaApi };
