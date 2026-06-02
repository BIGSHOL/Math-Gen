import { supabase, currentUserId } from "./supabase";

/**
 * Phase E — 사용자 콘텐츠 피드백.
 *
 * 사용자가 Step 3 (해설) / Step 4 (변형) 카드의 FeedbackBar 에서 👍 / 👎 +
 * 사유 chip + 자유 comment 입력 → `content_feedback` 테이블에 insert.
 *
 * **anon (비로그인) 호출 차단**: RLS 정책 `feedback_insert_own` 가 `user_id =
 * auth.uid()` 강제 — anon 은 fail. UI 단에서 비로그인 시 FeedbackBar 자체 숨김.
 */

export type FeedbackTargetKind = "ocr_problem" | "solution" | "variant";

export interface SubmitFeedbackInput {
  target_kind: FeedbackTargetKind;
  target_id: string;
  /** 1 = 👎, 5 = 👍. NULL 은 사용 안 함 (binary). */
  rating: 1 | 5;
  comment?: string;
  /** ['accuracy', 'terminology', 'diagram', 'other'] — 부정 평가 시. */
  reason_chips?: string[];
  /** model / grade / topic / problem_text_snippet 등 — 후속 분석용. */
  context?: Record<string, unknown>;
}

/**
 * content_feedback row insert. fire-and-forget — caller 의 UI 흐름 영향 X.
 * 성공 시 true, 실패 시 false (silent — RLS 차단 / network).
 */
export const submitFeedback = async (input: SubmitFeedbackInput): Promise<boolean> => {
  if (!supabase) return false;
  // tenant_id 는 profile join 에서 가져옴 (RLS 차원에서 자동 검증 X, app-level)
  let tenant_id: string | null = null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .maybeSingle();
  if (profile && typeof (profile as { tenant_id?: string }).tenant_id === "string") {
    tenant_id = (profile as { tenant_id: string }).tenant_id;
  }
  // RLS 정책 feedback_insert_own 은 WITH CHECK (user_id = auth.uid()) — user_id
  // 를 *반드시* 명시해야 통과. 누락 시 403 (new row violates RLS). 사용자 보고
  // 2026-06-02. content_feedback.user_id 는 default auth.uid() 가 없으므로 직접
  // 채운다 (tests insert 와 동일 패턴: currentUserId()).
  const user_id = await currentUserId();
  const { error } = await supabase.from("content_feedback").insert({
    user_id,
    target_kind: input.target_kind,
    target_id: input.target_id,
    rating: input.rating,
    comment: input.comment ?? null,
    reason_chips: input.reason_chips ?? [],
    context: input.context ?? null,
    tenant_id,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[feedback] submit failed:", error.message);
    return false;
  }
  return true;
};

// ============================================================================
// Admin §7 (ContentInsights) — 집계 query
// ============================================================================

export interface FeedbackSummary {
  total: number;
  positive: number;
  negative: number;
  negativeRate: number;
}

export interface FeedbackByModel {
  model: string;
  count: number;
  avg_rating: number;
  negative_count: number;
}

export interface FeedbackByTopic {
  topic: string;
  count: number;
  avg_rating: number;
  negative_count: number;
}

/**
 * 전체 피드백 요약 — admin ContentInsights 의 상단 카드.
 */
export const loadFeedbackSummary = async (
  days = 30,
): Promise<FeedbackSummary> => {
  const empty = { total: 0, positive: 0, negative: 0, negativeRate: 0 };
  if (!supabase) return empty;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("content_feedback")
    .select("rating")
    .gte("created_at", since)
    .limit(50000);
  if (!data) return empty;
  let positive = 0;
  let negative = 0;
  for (const row of data) {
    const r = (row as { rating: number | null }).rating;
    if (r === null) continue;
    if (r >= 3) positive += 1;
    else negative += 1;
  }
  const total = positive + negative;
  return {
    total,
    positive,
    negative,
    negativeRate: total > 0 ? (negative / total) * 100 : 0,
  };
};

/**
 * 모델별 피드백 — *부정 평가 빈도 높은 모델* 식별.
 *
 * context.model 을 grouping key 로 사용. model 없는 row 는 skip.
 */
export const loadFeedbackByModel = async (
  days = 30,
): Promise<FeedbackByModel[]> => {
  if (!supabase) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("content_feedback")
    .select("rating, context")
    .gte("created_at", since)
    .limit(50000);
  if (!data) return [];
  const agg = new Map<string, { count: number; sum: number; neg: number }>();
  for (const row of data) {
    const r = row as { rating: number | null; context: unknown };
    if (r.rating === null) continue;
    const model = (r.context as { model?: string } | null)?.model;
    if (!model) continue;
    const ex = agg.get(model) ?? { count: 0, sum: 0, neg: 0 };
    ex.count += 1;
    ex.sum += r.rating;
    if (r.rating < 3) ex.neg += 1;
    agg.set(model, ex);
  }
  return Array.from(agg.entries())
    .map(([model, v]) => ({
      model,
      count: v.count,
      avg_rating: v.sum / v.count,
      negative_count: v.neg,
    }))
    .sort((a, b) => b.negative_count - a.negative_count);
};

/**
 * 단원별 피드백 — 같은 패턴, context.topic 기준.
 */
export const loadFeedbackByTopic = async (
  days = 30,
): Promise<FeedbackByTopic[]> => {
  if (!supabase) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("content_feedback")
    .select("rating, context")
    .gte("created_at", since)
    .limit(50000);
  if (!data) return [];
  const agg = new Map<string, { count: number; sum: number; neg: number }>();
  for (const row of data) {
    const r = row as { rating: number | null; context: unknown };
    if (r.rating === null) continue;
    const topic = (r.context as { topic?: string } | null)?.topic;
    if (!topic) continue;
    const ex = agg.get(topic) ?? { count: 0, sum: 0, neg: 0 };
    ex.count += 1;
    ex.sum += r.rating;
    if (r.rating < 3) ex.neg += 1;
    agg.set(topic, ex);
  }
  return Array.from(agg.entries())
    .map(([topic, v]) => ({
      topic,
      count: v.count,
      avg_rating: v.sum / v.count,
      negative_count: v.neg,
    }))
    .sort((a, b) => b.negative_count - a.negative_count)
    .slice(0, 20);
};
