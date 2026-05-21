/**
 * Supabase API layer — barrel export.
 *
 * 사용처 패턴:
 *   import { supabase, SUPABASE_ENABLED } from "@app/services/api";
 *   if (!SUPABASE_ENABLED) return;  // feature flag 가드
 *   const { data, error } = await supabase!.from("tests").select();
 *
 * Phase A 만 — 후속 phase 에서 tests / pages / problems / reviews / storage 추가.
 */

export {
  supabase,
  SUPABASE_ENABLED,
  DEV_USER_ID,
  currentUserId,
} from "./supabase";
