/**
 * Supabase API layer — barrel export.
 *
 * 사용처 패턴 1 — 네임스페이스 import (권장):
 *   import { tests, pages, storage } from "@app/services/api";
 *   await tests.insertTest({ id, title, ... });
 *
 * 사용처 패턴 2 — 함수 직접 import:
 *   import { insertTest } from "@app/services/api/tests";
 *
 * 두 패턴 자유롭게 mix.
 */

export {
  supabase,
  SUPABASE_ENABLED,
  DEV_USER_ID,
  currentUserId,
} from "./supabase";

export * as tests from "./tests";
export * as pages from "./pages";
export * as problems from "./problems";
export * as reviews from "./reviews";
export * as variantHistory from "./variantHistory";
export * as storage from "./storage";
export * as mappers from "./mappers";

// Sync 설치 — index.tsx (entry) 에서 1회 호출.
export { installWizardSync } from "./wizardSync";
