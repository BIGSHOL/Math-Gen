import { supabase } from "./supabase";
import type { UserProfile } from "@app/stores/authStore";

/**
 * Admin 전용 query 함수들. RLS 가 권한별 row 필터링 — system_admin 은 전체,
 * tenant_admin 은 자기 tenant 만, teacher 는 *호출 자체 차단됨* (AdminGate).
 *
 * 모든 함수가 supabase null (env disabled) 일 때 *빈 결과* 반환 — caller 가
 * 빈 화면 표시. throw 안 함.
 */

// ============================================================================
// 1. ai_usage 집계 (UsageDashboard)
// ============================================================================

export interface UsageStatsByModel {
  model: string;
  count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cost_usd: number;
}

export interface UsageStatsTimeseries {
  date: string; // YYYY-MM-DD
  count: number;
  total_cost_usd: number;
}

export interface UsageSummary {
  totalCalls: number;
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  errorCount: number;
}

/**
 * 지난 30일 모델별 집계. RLS 가 권한별 필터 — tenant_admin 은 자기 tenant 만.
 */
export const loadUsageByModel = async (
  days = 30,
): Promise<UsageStatsByModel[]> => {
  if (!supabase) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("ai_usage")
    .select("model, input_tokens, output_tokens, cache_read_tokens, cost_usd")
    .gte("created_at", since)
    .limit(50000);
  if (error || !data) return [];
  const agg = new Map<string, UsageStatsByModel>();
  for (const row of data) {
    const r = row as {
      model: string;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cost_usd: number | string;
    };
    const ex = agg.get(r.model) ?? {
      model: r.model,
      count: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cache_read_tokens: 0,
      total_cost_usd: 0,
    };
    ex.count += 1;
    ex.total_input_tokens += r.input_tokens ?? 0;
    ex.total_output_tokens += r.output_tokens ?? 0;
    ex.total_cache_read_tokens += r.cache_read_tokens ?? 0;
    ex.total_cost_usd += Number(r.cost_usd ?? 0);
    agg.set(r.model, ex);
  }
  return Array.from(agg.values()).sort((a, b) => b.total_cost_usd - a.total_cost_usd);
};

/**
 * 지난 N일의 *일별* 집계 — line chart 용.
 */
export const loadUsageTimeseries = async (
  days = 30,
): Promise<UsageStatsTimeseries[]> => {
  if (!supabase) return [];
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("ai_usage")
    .select("created_at, cost_usd")
    .gte("created_at", since)
    .limit(50000);
  if (error || !data) return [];
  const agg = new Map<string, UsageStatsTimeseries>();
  for (const row of data) {
    const r = row as { created_at: string; cost_usd: number | string };
    const date = r.created_at.slice(0, 10); // YYYY-MM-DD
    const ex = agg.get(date) ?? { date, count: 0, total_cost_usd: 0 };
    ex.count += 1;
    ex.total_cost_usd += Number(r.cost_usd ?? 0);
    agg.set(date, ex);
  }
  return Array.from(agg.values()).sort((a, b) => a.date.localeCompare(b.date));
};

/**
 * 전체 요약 카드 — total cost / tokens / calls / errors.
 */
export const loadUsageSummary = async (days = 30): Promise<UsageSummary> => {
  if (!supabase) {
    return {
      totalCalls: 0,
      totalCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      errorCount: 0,
    };
  }
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("ai_usage")
    .select("input_tokens, output_tokens, cache_read_tokens, cost_usd, error")
    .gte("created_at", since)
    .limit(50000);
  if (!data) {
    return {
      totalCalls: 0,
      totalCostUsd: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCacheReadTokens: 0,
      errorCount: 0,
    };
  }
  let totalCostUsd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let errorCount = 0;
  for (const row of data) {
    const r = row as {
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cost_usd: number | string;
      error: string | null;
    };
    totalCostUsd += Number(r.cost_usd ?? 0);
    totalInputTokens += r.input_tokens ?? 0;
    totalOutputTokens += r.output_tokens ?? 0;
    totalCacheReadTokens += r.cache_read_tokens ?? 0;
    if (r.error) errorCount += 1;
  }
  return {
    totalCalls: data.length,
    totalCostUsd,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    errorCount,
  };
};

// ============================================================================
// 2. profiles 관리 (UserManagement)
// ============================================================================

export const loadProfiles = async (): Promise<UserProfile[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, status, tenant_id, display_name")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return [];
  return data as UserProfile[];
};

/** 사용자 status 변경 (pending → active 승인, active → suspended 차단). */
export const updateProfileStatus = async (
  userId: string,
  status: "pending" | "active" | "suspended",
): Promise<boolean> => {
  if (!supabase) return false;
  const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
  return !error;
};

export const updateProfileRole = async (
  userId: string,
  role: "system_admin" | "tenant_admin" | "teacher",
): Promise<boolean> => {
  if (!supabase) return false;
  const { error } = await supabase.from("profiles").update({ role }).eq("id", userId);
  return !error;
};

export const updateProfileTenant = async (
  userId: string,
  tenant_id: string | null,
): Promise<boolean> => {
  if (!supabase) return false;
  const { error } = await supabase.from("profiles").update({ tenant_id }).eq("id", userId);
  return !error;
};

// ============================================================================
// 3. tenants 관리 (TenantManagement — system_admin only)
// ============================================================================

export interface Tenant {
  id: string;
  name: string;
  invite_code: string;
  plan_tier: string;
  created_at: string;
}

export const loadTenants = async (): Promise<Tenant[]> => {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, invite_code, plan_tier, created_at")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as Tenant[];
};

export const createTenant = async (
  name: string,
  inviteCode: string,
): Promise<Tenant | null> => {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("tenants")
    .insert({ name, invite_code: inviteCode })
    .select()
    .single();
  if (error || !data) return null;
  return data as Tenant;
};

export const deleteTenant = async (id: string): Promise<boolean> => {
  if (!supabase) return false;
  const { error } = await supabase.from("tenants").delete().eq("id", id);
  return !error;
};

// ============================================================================
// 4. tests 통계 (TestStats)
// ============================================================================

export interface TestStatsRow {
  grade: string | null;
  count: number;
  avg_problem_count: number;
}

export const loadTestStats = async (): Promise<TestStatsRow[]> => {
  if (!supabase) return [];
  const { data } = await supabase.from("tests").select("grade, problem_count").limit(10000);
  if (!data) return [];
  const agg = new Map<string, { count: number; total: number }>();
  for (const row of data) {
    const r = row as { grade: string | null; problem_count: number };
    const key = r.grade ?? "(미지정)";
    const ex = agg.get(key) ?? { count: 0, total: 0 };
    ex.count += 1;
    ex.total += r.problem_count ?? 0;
    agg.set(key, ex);
  }
  return Array.from(agg.entries()).map(([grade, v]) => ({
    grade,
    count: v.count,
    avg_problem_count: v.count > 0 ? v.total / v.count : 0,
  }));
};

// ============================================================================
// 5. error_logs 검색 (ErrorLogs)
// ============================================================================

export interface ErrorLogRow {
  id: string;
  user_id: string | null;
  tenant_id: string | null;
  kind: string;
  severity: string;
  message: string;
  stack: string | null;
  context: unknown;
  fingerprint: string;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
}

export const loadErrors = async (
  severityFilter?: string,
  kindFilter?: string,
): Promise<ErrorLogRow[]> => {
  if (!supabase) return [];
  let q = supabase
    .from("error_logs")
    .select(
      "id, user_id, tenant_id, kind, severity, message, stack, context, fingerprint, occurrence_count, first_seen_at, last_seen_at",
    )
    .order("last_seen_at", { ascending: false })
    .limit(200);
  if (severityFilter) q = q.eq("severity", severityFilter);
  if (kindFilter) q = q.eq("kind", kindFilter);
  const { data, error } = await q;
  if (error || !data) return [];
  return data as ErrorLogRow[];
};
