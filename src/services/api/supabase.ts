import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client (singleton) — Phase A 인프라.
 *
 * **환경 변수** (`.env.local` — gitignored, vite.config.ts 의 readEnvLocal 가
 * 우선순위대로 읽음):
 *   - `VITE_SUPABASE_URL` — project URL (예: `https://xxx.supabase.co`)
 *   - `VITE_SUPABASE_ANON_KEY` — public anon key (RLS 의해 row 접근 제한)
 *   - `VITE_SUPABASE_ENABLED` — `"true"` 면 client 활성. 그 외 (`"false"` 또는
 *     미설정) 면 client `null` → 기존 IndexedDB / sessionStorage 만 동작.
 *
 * **Feature flag 패턴**: `SUPABASE_ENABLED === false` 면 *모든 supabase API 함수*
 * 가 early return → 기존 코드 100% 보존. dev 단계에서 backend 없이 작업 가능
 * + 1-flag rollback.
 *
 * **DEV anon UUID**: 인증 없는 상태의 사용자 식별자. RLS 정책 (schema.sql 참고)
 * 이 `COALESCE(auth.uid(), DEV_USER_ID)` 패턴이라 dev 단계에 모든 row 가 이
 * UUID 로 적힌다. Phase E (Supabase Auth 도입) 후 실제 사용자 UUID 로 backfill.
 */

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Feature flag — false 면 client null + 모든 API 함수 no-op. */
export const SUPABASE_ENABLED: boolean =
  import.meta.env.VITE_SUPABASE_ENABLED === "true" && Boolean(URL) && Boolean(ANON_KEY);

/**
 * Singleton client. SUPABASE_ENABLED=false 면 null — 모든 호출 측에서
 * `if (!supabase) return;` 가드 후 사용.
 */
export const supabase: SupabaseClient | null = SUPABASE_ENABLED
  ? createClient(URL!, ANON_KEY!, {
      auth: {
        // dev 단계엔 인증 없으므로 persistence 불필요. Phase E 에서 true 로.
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

/**
 * Dev 단계의 *모든 row 의 user_id 값*. RLS 정책이 anon 일 때 이 UUID 와 비교.
 * Phase E (auth 도입) 이후엔 `auth.uid()` 가 자동으로 매처가 되므로 이 상수는
 * fallback 으로만 사용.
 */
export const DEV_USER_ID = "00000000-0000-0000-0000-000000000000";

/**
 * 현재 사용자 UUID — 로그인 됐으면 `auth.uid()`, 아니면 DEV_USER_ID.
 * Phase E 에 auth 도입 후 의미 있음. dev 단계엔 항상 DEV_USER_ID 반환.
 */
export const currentUserId = async (): Promise<string> => {
  if (!supabase) return DEV_USER_ID;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? DEV_USER_ID;
};

/**
 * DEV 콘솔에서 *Supabase 활성 상태* 확인용. App 진입 시 한 번 호출.
 * 운영에선 호출하지 말 것 (key 노출 우려 — anon key 라 큰 문제 없지만 일관성).
 */
if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.info(
    `[api/supabase] SUPABASE_ENABLED=${SUPABASE_ENABLED}, client=${supabase ? "created" : "null"}, url=${URL?.slice(0, 40) ?? "(unset)"}`,
  );
}
