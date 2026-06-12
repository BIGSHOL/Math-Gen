import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "./_types.js";
import { requireAuth } from "./_jwt.js";
import { getServiceClient } from "./_supabase.js";

/**
 * GET /api/parax-checkout?product=<id> — 로그인 사용자를 para-x 결제로 안전 인계.
 *
 * mathlab 의 /api/parax/checkout 과 동일 역할이지만, mathg-gen 은 세션 쿠키가
 * 아니라 Bearer JWT 인증이라 **302 리다이렉트 대신 JSON { url } 반환** —
 * 브라우저 네비게이션에는 Authorization 헤더를 실을 수 없으므로 클라이언트가
 * fetch 로 URL 을 받아 window.location 으로 이동한다.
 *
 * **핸드오프 토큰 계약** (para-x lib/handoff.js 와 동일 알고리즘):
 *   token = base64url(JSON{tenantId,userId,role,exp}) + "." +
 *           base64url(HMAC-SHA256(payloadB64, MATHGEN_HANDOFF_SECRET))
 *   exp 는 epoch ms, TTL 10분 (para-x 는 exp 필수 + 24h 초과 거부).
 *
 * **권한**: tenant_admin / system_admin 만 — 크레딧은 tenant 단위 지급이므로
 * 구매는 학원 관리자 책임. (teacher 는 403)
 */

const HANDOFF_TTL_MS = 10 * 60 * 1000;
const PRODUCT_ID_RE = /^[A-Za-z0-9-]{1,64}$/;
const PURCHASE_ROLES = new Set(["tenant_admin", "system_admin"]);

const mintHandoffToken = (
  payload: { tenantId: string; userId: string; role: string },
  secret: string,
): string => {
  const body = { ...payload, exp: Date.now() + HANDOFF_TTL_MS };
  const payloadB64 = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  return `${payloadB64}.${sig}`;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "GET only" });
  }

  const secret = process.env.MATHGEN_HANDOFF_SECRET;
  if (!secret) {
    // eslint-disable-next-line no-console
    console.error("[parax-checkout] MATHGEN_HANDOFF_SECRET 미설정");
    return res.status(500).json({ error: "결제 연동이 아직 설정되지 않았습니다." });
  }

  const auth = await requireAuth(req, res);
  if (!auth) return;
  if (!auth.tenantId) {
    return res.status(400).json({ error: "소속 학원이 없습니다. 학원 등록 후 이용해 주세요." });
  }

  const product = typeof req.query.product === "string" ? req.query.product : "";
  if (!PRODUCT_ID_RE.test(product)) {
    return res.status(400).json({ error: "product 가 필요합니다." });
  }

  // 역할 확인 — 구매는 tenant 관리자만 (크레딧이 tenant 풀로 지급되므로)
  const supa = getServiceClient();
  if (!supa) return res.status(500).json({ error: "Server misconfigured" });
  const { data: profile, error: pErr } = await supa
    .from("profiles").select("role, status").eq("id", auth.userId).maybeSingle();
  if (pErr) return res.status(500).json({ error: pErr.message });
  const role = (profile?.role as string | undefined) ?? "";
  if (!PURCHASE_ROLES.has(role) || profile?.status !== "active") {
    return res.status(403).json({ error: "이용권 구매는 학원 관리자만 가능합니다." });
  }

  const token = mintHandoffToken({ tenantId: auth.tenantId, userId: auth.userId, role }, secret);
  const base = process.env.PARAX_CHECKOUT_URL || "https://www.para-x.co.kr/checkout.html";
  const url = `${base}?product=${encodeURIComponent(product)}&token=${encodeURIComponent(token)}`;

  return res.status(200).json({ url });
}
