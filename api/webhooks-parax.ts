import crypto from "node:crypto";
import type { VercelRequest, VercelResponse } from "./_types.js";
import { getServiceClient } from "./_supabase.js";

/**
 * POST /api/webhooks-parax — para-x 결제 허브의 "이용권 지급(grant)" 통지 수신.
 *
 * **인증**: 무인증 + HMAC 서명검증 — para-x(lib/grants.js)가 헤더
 * `x-parax-signature` = HMAC-SHA256(rawBody, MATHGEN_GRANT_SECRET) hex 로 서명.
 * (requireAuth 미적용 — 서버 간 호출이라 사용자 JWT 가 없고, 서명이 인증을 대신한다.)
 *
 * **payload**: { orderId, tenantId, site:'mathgen', buyerUserId?, kind, feature?,
 *               qty?, planId?, amount? }
 *
 * **멱등**: credit_lots.ref_order_id UNIQUE — para-x grant 는 at-least-once
 * (실패 시 retry-grants cron 재발송)라 같은 주문이 중복 도착할 수 있다.
 * unique 충돌(23505)이면 이미 지급된 것 → 200 { already: true }.
 * 비2xx 응답이면 para-x 가 재발송하므로, 일시 오류는 500 으로 되돌려도 안전.
 *
 * **크레딧 유효기간**: 충전일로부터 1년 (mathlab 약관 제6조와 동일 정책) —
 * lot 의 expires_at 기록, 잔액은 lot 기준 SUM(qty-used).
 */

const CREDIT_FEATURES = new Set(["EXAM_PROCESS"]);
const PLAN_TIERS = new Set(["basic", "pro", "enterprise"]);
const CREDIT_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 충전일 +1년
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * HMAC 검증용 raw body 확보. Vercel Node runtime 의 body 파싱 시점이 버전에 따라
 * 다르므로 2단 방어: ① req.body 미파싱이면 스트림 직접 읽기(바이트 보존),
 * ② 이미 파싱됐으면 재직렬화 — para-x 는 공백 없는 JSON.stringify 로 발송하고
 * payload 가 문자열/정수/null 만 포함하므로 parse→stringify 왕복이 byte-identical.
 */
const readRawBody = async (req: VercelRequest): Promise<string> => {
  const r = req as VercelRequest & AsyncIterable<Buffer | string>;
  if (r.body === undefined || r.body === null) {
    const chunks: Buffer[] = [];
    for await (const chunk of r) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  return typeof r.body === "string" ? r.body : JSON.stringify(r.body);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const secret = process.env.MATHGEN_GRANT_SECRET;
  if (!secret) {
    // eslint-disable-next-line no-console
    console.error("[webhooks-parax] MATHGEN_GRANT_SECRET 미설정");
    return res.status(500).json({ error: "Server misconfigured" });
  }

  let rawBody = "";
  try {
    rawBody = await readRawBody(req);
  } catch {
    return res.status(400).json({ error: "Invalid request" });
  }
  const signature = typeof req.headers["x-parax-signature"] === "string"
    ? req.headers["x-parax-signature"]
    : "";
  if (!rawBody || !signature) {
    return res.status(400).json({ error: "Invalid request" });
  }

  // HMAC-SHA256 서명검증 — 길이비교 후 timingSafeEqual (mathlab 웹훅과 동일 패턴).
  // Buffer.from(hex) 는 invalid hex 에서 throw 하지 않고 짧은 버퍼 반환 → 길이 불일치로 거부됨.
  const hmac = crypto.createHmac("sha256", secret).update(rawBody).digest();
  const sigBuf = Buffer.from(signature, "hex");
  if (sigBuf.length !== hmac.length || !crypto.timingSafeEqual(sigBuf, hmac)) {
    return res.status(401).json({ error: "서명 불일치" });
  }

  const supa = getServiceClient();
  if (!supa) {
    // env 미설정 — 500 으로 되돌리면 para-x retry-grants 가 재발송 (지급 유실 없음)
    return res.status(500).json({ error: "Server misconfigured" });
  }

  try {
    const g = JSON.parse(rawBody) as Record<string, unknown>;
    const orderId = typeof g.orderId === "string" ? g.orderId : "";
    const tenantId = typeof g.tenantId === "string" ? g.tenantId : "";
    const kind = typeof g.kind === "string" ? g.kind : "";

    // 해지 통지는 orderId 가 없다 — kind 먼저 분기.
    // mathgen 구독 상품 도입 전이므로 수신만 하고 무시 (비2xx 면 para-x 로그 noise).
    if (kind === "subscription_canceled") {
      // eslint-disable-next-line no-console
      console.log("[webhooks-parax] subscription_canceled 수신(현재 no-op):", tenantId);
      return res.status(200).json({ received: true, noop: true });
    }

    if (!orderId || !tenantId || !kind) {
      return res.status(400).json({ error: "orderId, tenantId, kind 필요" });
    }
    if (!UUID_RE.test(tenantId)) {
      return res.status(400).json({ error: "tenantId 가 UUID 형식이 아닙니다" });
    }

    const { data: tenant, error: tErr } = await supa
      .from("tenants").select("id").eq("id", tenantId).maybeSingle();
    if (tErr) return res.status(500).json({ error: tErr.message });
    if (!tenant) return res.status(400).json({ error: "존재하지 않는 tenant" });

    if (kind === "credits") {
      const feature = typeof g.feature === "string" ? g.feature : "";
      if (!CREDIT_FEATURES.has(feature)) {
        return res.status(400).json({ error: `알 수 없는 feature: ${feature}` });
      }
      const qty = Number(g.qty);
      if (!Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ error: "qty 가 올바르지 않습니다" });
      }
      const buyerUserId = typeof g.buyerUserId === "string" && UUID_RE.test(g.buyerUserId)
        ? g.buyerUserId
        : null;
      const expiresAt = new Date(Date.now() + CREDIT_TTL_MS).toISOString();

      const { error } = await supa.from("credit_lots").insert({
        tenant_id: tenantId,
        feature,
        qty,
        ref_order_id: orderId,
        buyer_user_id: buyerUserId,
        amount: g.amount != null && Number.isFinite(Number(g.amount)) ? Number(g.amount) : null,
        expires_at: expiresAt,
      });
      if (error) {
        if (error.code === "23505") {
          // ref_order_id unique 충돌 = 이미 지급된 주문 (재발송 중복) — 멱등 성공
          return res.status(200).json({ received: true, already: true });
        }
        // 테이블 미생성(schema-credits.sql 미실행) 포함 — 500 이면 para-x 가 재발송하므로
        // SQL 적용 후 자동 지급된다.
        // eslint-disable-next-line no-console
        console.error("[webhooks-parax] credit_lots insert 실패:", orderId, error.message);
        return res.status(500).json({ error: error.message });
      }
      return res.status(200).json({ received: true, qty, expiresAt });
    }

    if (kind === "subscription") {
      const planId = typeof g.planId === "string" ? g.planId : "";
      if (!PLAN_TIERS.has(planId)) {
        return res.status(400).json({ error: `알 수 없는 plan: ${planId}` });
      }
      // 최소 반영: tenants.plan_tier 갱신. 기간 만료 강등은 mathgen 구독 상품
      // 도입 시 별도 테이블(tenant_subscriptions)과 함께 — 현재 상품 없음.
      const { error } = await supa.from("tenants")
        .update({ plan_tier: planId }).eq("id", tenantId);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(200).json({ received: true, plan: planId });
    }

    return res.status(400).json({ error: `알 수 없는 kind: ${kind}` });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[webhooks-parax] 처리 오류:", (e as Error).message);
    return res.status(500).json({ error: "Webhook handler error" });
  }
}
