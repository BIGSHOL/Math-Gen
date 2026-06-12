-- ============================================================================
--  schema-credits.sql — para-x 결제 허브 연동: 이용권 크레딧 lot
-- ----------------------------------------------------------------------------
--  para-x(중앙 결제 허브)에서 결제가 승인되면 grant 웹훅(api/webhooks-parax.ts)이
--  이 테이블에 lot 을 적립한다. 1회 = 시험지 1개 전체 처리.
--
--  설계 (mathlab EntitlementLedger lot 패턴 동일):
--    - 멱등: ref_order_id UNIQUE — para-x 의 grant 는 at-least-once 재발송이라
--      같은 주문이 두 번 도착할 수 있다. unique 충돌(23505) = 이미 지급 → 200.
--    - 만료: 충전일로부터 1년(약관 — mathlab 제6조와 동일 정책). 잔액 계산은
--      반드시 lot 기준: SUM(qty - used) WHERE expires_at > now().
--    - 차감(후속 phase): 만료 임박 lot 부터 FIFO 로 used 증가.
--
--  적용: Supabase 대시보드 → SQL Editor 에서 실행 (멱등 — 재실행 안전).
--  실행 전이어도 앱은 정상 동작 — 웹훅 insert 실패 시 para-x retry-grants 가
--  재발송하므로 SQL 적용 후 자동 지급된다 (at-least-once 설계).
-- ============================================================================

CREATE TABLE IF NOT EXISTS credit_lots (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature        TEXT NOT NULL DEFAULT 'EXAM_PROCESS',     -- 기능 키 (para-x products.js 의 feature 와 일치)
  qty            INT  NOT NULL CHECK (qty > 0),            -- 충전량
  used           INT  NOT NULL DEFAULT 0 CHECK (used >= 0),-- 차감 누적 (used <= qty 는 아래 제약)
  ref_order_id   TEXT UNIQUE,                              -- para-x orderId — grant 멱등 키
  buyer_user_id  UUID,                                     -- 구매자 (para-x 핸드오프 토큰의 userId)
  amount         INT,                                      -- 결제 금액(원) — 기록용
  expires_at     TIMESTAMPTZ NOT NULL,                     -- 충전일 +1년
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT credit_lots_used_le_qty CHECK (used <= qty)
);

-- 잔액 조회 (tenant 별 유효 lot 스캔)
CREATE INDEX IF NOT EXISTS idx_credit_lots_tenant
  ON credit_lots(tenant_id, feature, expires_at);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- SELECT: 같은 tenant 멤버(잔액 표시) + system_admin.
-- INSERT/UPDATE/DELETE: 정책 없음 = service role 만 (웹훅/차감은 서버 전용 —
-- 클라이언트가 잔액을 조작할 수 없어야 한다).
ALTER TABLE credit_lots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS credit_lots_select_tenant ON credit_lots;
CREATE POLICY credit_lots_select_tenant ON credit_lots
  FOR SELECT TO authenticated
  USING (
    tenant_id = auth_tenant()
    OR auth_role() = 'system_admin'
  );
