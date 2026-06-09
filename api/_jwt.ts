import type { VercelRequest, VercelResponse } from "./_types.js";
import { getServiceClient } from "./_supabase.js";

/**
 * Vercel function 의 Authorization header → user_id + tenant_id 해석.
 *
 * **흐름**:
 *   1. `Authorization: Bearer <jwt>` 헤더 추출
 *   2. supabase.auth.getUser(jwt) 로 user 정보 가져오기 (service role 사용)
 *   3. profiles 테이블 join → tenant_id 가져오기
 *
 * **anon 허용**: JWT 없거나 invalid → {userId: null, tenantId: null} 반환. ai_usage
 * insert 는 진행됨 (trace 보존 — 누군지 모르는 호출도 기록).
 *
 * **무한 루프 방지**: getServiceClient() null 이면 즉시 null 반환 — env 미설정
 * 환경에서 panic 없이 silent skip.
 */

export interface AuthContext {
  userId: string | null;
  tenantId: string | null;
}

export interface RequiredAuthContext extends AuthContext {
  userId: string;
}

const EMPTY_CONTEXT: AuthContext = { userId: null, tenantId: null };

/**
 * Authorization header → AuthContext. 실패 시 EMPTY_CONTEXT — throw 안 함.
 */
export const resolveAuth = async (
  req: VercelRequest,
): Promise<AuthContext> => {
  const client = getServiceClient();
  if (!client) return EMPTY_CONTEXT;

  const authHeader = req.headers.authorization;
  if (!authHeader || typeof authHeader !== "string") return EMPTY_CONTEXT;

  const jwt = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : authHeader.trim();
  if (!jwt) return EMPTY_CONTEXT;

  try {
    const { data, error } = await client.auth.getUser(jwt);
    if (error || !data.user) return EMPTY_CONTEXT;
    const userId = data.user.id;

    // profiles join — tenant_id 조회 (없어도 OK, null 그대로)
    const { data: profile } = await client
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();
    return {
      userId,
      tenantId: (profile?.tenant_id as string | null) ?? null,
    };
  } catch {
    // JWT 만료 / 위조 등 — 인증 실패는 silent (anon 으로 진행).
    return EMPTY_CONTEXT;
  }
};

/**
 * Authorization header 를 필수로 요구한다. 비용이 발생하는 AI/PDF API 앞단에서
 * 호출해 인증 실패 시 모델 호출이나 Chromium launch 전에 차단한다.
 */
export const requireAuth = async (
  req: VercelRequest,
  res: VercelResponse,
): Promise<RequiredAuthContext | null> => {
  const auth = await resolveAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "로그인이 필요합니다." });
    return null;
  }
  return auth as RequiredAuthContext;
};
