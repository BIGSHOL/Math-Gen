import { supabase, SUPABASE_ENABLED } from "./supabase";
import type { ProblemReview } from "@app/stores/wizardStore";
import {
  reviewToInsert,
  type ReviewRow,
  type ReviewInsert,
} from "./mappers";

/**
 * problem_reviews 테이블 CRUD — Step 4 변형 결과 (원본+변형 pair).
 *
 * Step 4 mount 시 useVariantGen 이 problems 를 seed 한 시점에 `upsertReviews(testId,
 * pairs)` 로 batch upsert. 각 변형 완료 / 사용자 편집 시 `updateReview(id, patch)`.
 */

export const upsertReview = async (
  testId: string,
  ocrProblemId: string | null,
  review: ProblemReview,
): Promise<string | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const payload = reviewToInsert(testId, ocrProblemId, review);
  const { data, error } = await supabase
    .from("problem_reviews")
    .upsert(payload, { onConflict: "id" })
    .select("id")
    .single();
  if (error) {
    console.warn("[api/reviews] upsertReview failed:", error.message);
    return null;
  }
  return data.id;
};

export const upsertReviews = async (
  testId: string,
  reviews: Array<{ ocrProblemId: string | null; review: ProblemReview }>,
): Promise<void> => {
  if (!SUPABASE_ENABLED || !supabase) return;
  if (reviews.length === 0) return;
  const payloads = reviews.map(({ ocrProblemId, review }) =>
    reviewToInsert(testId, ocrProblemId, review),
  );
  const { error } = await supabase
    .from("problem_reviews")
    .upsert(payloads, { onConflict: "id" });
  if (error) {
    console.warn("[api/reviews] upsertReviews failed:", error.message);
  }
};

// ── updateReview: id 별 debounce ─────────────────────────────────────────────
type TimerId = ReturnType<typeof setTimeout>;
const updateTimers = new Map<string, TimerId>();
const pendingPatches = new Map<string, Partial<ReviewInsert>>();

export const updateReview = async (
  id: string,
  patch: Partial<ReviewInsert>,
  options: { debounceMs?: number } = {},
): Promise<boolean> => {
  if (!SUPABASE_ENABLED || !supabase) return false;
  const debounceMs = options.debounceMs ?? 0;
  if (debounceMs > 0) {
    const existing = updateTimers.get(id);
    if (existing) clearTimeout(existing);
    pendingPatches.set(id, { ...(pendingPatches.get(id) ?? {}), ...patch });
    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        updateTimers.delete(id);
        const merged = pendingPatches.get(id) ?? patch;
        pendingPatches.delete(id);
        const ok = await updateReview(id, merged, { debounceMs: 0 });
        resolve(ok);
      }, debounceMs);
      updateTimers.set(id, timer);
    });
  }
  const { error } = await supabase.from("problem_reviews").update(patch).eq("id", id);
  if (error) {
    console.warn("[api/reviews] updateReview failed:", error.message);
    return false;
  }
  return true;
};

export const loadReviewsByTest = async (testId: string): Promise<ReviewRow[] | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const { data, error } = await supabase
    .from("problem_reviews")
    .select("*")
    .eq("test_id", testId)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[api/reviews] loadReviewsByTest failed:", error.message);
    return null;
  }
  return data as ReviewRow[];
};

export const deleteReview = async (id: string): Promise<boolean> => {
  if (!SUPABASE_ENABLED || !supabase) return false;
  const { error } = await supabase.from("problem_reviews").delete().eq("id", id);
  if (error) {
    console.warn("[api/reviews] deleteReview failed:", error.message);
    return false;
  }
  return true;
};
