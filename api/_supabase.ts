import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Vercel function 전용 — *service role key* 로 RLS 우회 client.
 *
 * **클라이언트 노출 절대 금지** — 이 파일은 `api/` 디렉터리 안에만 import 되어야
 * 함. `src/` 어디에도 import 하지 마세요.
 *
 * **env 필수**:
 *   - `VITE_SUPABASE_URL` (또는 SUPABASE_URL) — Vercel Production env
 *   - `SUPABASE_SERVICE_ROLE_KEY` — Vercel Production env (절대 클라이언트 X)
 *
 * **사용처**:
 *   - `_logUsage.ts`: ai_usage / error_logs insert (RLS 우회로 모든 user 의 row 기록)
 *   - 추후 추가 admin endpoint
 *
 * **fail-soft 설계**: env 누락 시 *null 반환* — 호출처가 silent skip. Phase B
 * 도입 직후 env 등록 안 된 상태에서도 *AI 호출 자체는 정상 작동* (단지 usage
 * 추적만 안 됨).
 */

let _client: SupabaseClient | null = null;
let _checked = false;

/**
 * 싱글톤 service client. env 부족 시 null. cold start 시 1회 init.
 */
export const getServiceClient = (): SupabaseClient | null => {
  if (_checked) return _client;
  _checked = true;
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    // eslint-disable-next-line no-console
    console.warn(
      "[api/_supabase] VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing — usage logging disabled.",
    );
    return null;
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
};
