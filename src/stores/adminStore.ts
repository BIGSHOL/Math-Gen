import { create } from "zustand";

/**
 * Admin SPA 의 *현재 섹션* state. URL ?admin=usage 같은 deep-link 미지원 — 단순
 * in-memory state.
 *
 * Phase C — 7 섹션:
 *   - usage      : ai_usage 집계 (모델별 / 학원별 / 시계열)
 *   - users      : profiles 관리 (가입 승인 / role / status)
 *   - tenants    : 학원 관리 (system_admin only)
 *   - tests      : 시험지 통계 (학년 / 단원)
 *   - errors     : error_logs 검색 + fingerprint 묶음
 *   - monitoring : admin_anomalies (Phase D — 일단 stub)
 *   - feedback   : content_feedback 집계 (Phase E — stub)
 */

export type AdminSection =
  | "usage"
  | "users"
  | "tenants"
  | "tests"
  | "errors"
  | "monitoring"
  | "feedback";

interface AdminStore {
  section: AdminSection;
  setSection: (s: AdminSection) => void;
  /** Phase D — sidebar 의 모니터링 메뉴 badge count. AdminScreen 이 30초 polling. */
  anomalyCount: number;
  setAnomalyCount: (n: number) => void;
}

export const useAdminStore = create<AdminStore>((set) => ({
  section: "usage",
  setSection: (section) => set({ section }),
  anomalyCount: 0,
  setAnomalyCount: (anomalyCount) => set({ anomalyCount }),
}));
