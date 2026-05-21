import { supabase, SUPABASE_ENABLED } from "./supabase";
import type { VariantHistoryRow } from "./mappers";

/**
 * variant_history 테이블 — 변형 배치의 메타 (intensity / count / label).
 *
 * Step 4 mount 시 useVariantGen 의 seed effect 가 1회 호출. 후속 phase 에서 "재변형"
 * 버튼 추가 시 매 클릭마다 row 추가.
 */

export const insertVariantBatch = async (
  testId: string,
  intensity: 0 | 1 | 2,
  count: number,
  label?: string,
): Promise<string | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const { data, error } = await supabase
    .from("variant_history")
    .insert({
      test_id: testId,
      intensity,
      count,
      label: label ?? null,
    })
    .select("id")
    .single();
  if (error) {
    console.warn("[api/variantHistory] insertVariantBatch failed:", error.message);
    return null;
  }
  return data.id;
};

export const loadVariantHistory = async (
  testId: string,
): Promise<VariantHistoryRow[] | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const { data, error } = await supabase
    .from("variant_history")
    .select("*")
    .eq("test_id", testId)
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("[api/variantHistory] loadVariantHistory failed:", error.message);
    return null;
  }
  return data as VariantHistoryRow[];
};
