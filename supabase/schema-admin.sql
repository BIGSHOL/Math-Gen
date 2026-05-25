-- ============================================================================
-- mathg-gen Supabase admin schema (Phase A — admin 시스템 인프라)
-- ----------------------------------------------------------------------------
-- 실행 방법:
--   1. supabase/schema.sql 먼저 적용 (이미 적용된 상태면 skip)
--   2. Supabase 대시보드 → SQL Editor → 새 query
--   3. 이 파일 통째로 paste → Run
--   4. supabase/schema.sql 의 RLS 정책 부분 *재실행* (role-aware 로 갱신)
--   5. 첫 system_admin 부여:
--        UPDATE profiles SET role='system_admin', status='active' WHERE id='<자기 UUID>';
--
-- 멱등성: CREATE TABLE IF NOT EXISTS / CREATE TYPE IF NOT EXISTS 패턴 + DROP
-- POLICY IF EXISTS 사용 — 여러 번 실행해도 안전.
--
-- 신규 객체:
--   - 2 enum: user_role, user_status
--   - 5 테이블: tenants, profiles, ai_usage, error_logs, content_feedback
--   - 3 helper function: auth_role(), auth_tenant(), upsert_error_log()
--   - 1 trigger: on_auth_user_created (auth.users 신규 가입 → profiles auto-insert)
--   - tests.tenant_id 컬럼 추가 (nullable)
-- ============================================================================

-- ============================================================================
-- 1. ENUM 타입
-- ============================================================================
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('system_admin', 'tenant_admin', 'teacher');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE user_status AS ENUM ('pending', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- 2. tenants (학원 / 조직 단위)
-- ----------------------------------------------------------------------------
-- 학원 admin 이 invite_code 발급 → 교사 가입 시 입력 → tenant_id 자동 set.
-- 교사 가입은 `pending` 상태로 진입 — 학원 admin 이 admin 화면에서 승인.
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  invite_code  TEXT NOT NULL UNIQUE,                              -- 예: 'MATHGEN-ABC123'
  plan_tier    TEXT NOT NULL DEFAULT 'free',                      -- 'free' / 'pro' / 'enterprise'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tenants_invite ON tenants(invite_code);

-- ============================================================================
-- 3. profiles (auth.users 와 1:1)
-- ----------------------------------------------------------------------------
-- Supabase 권장 패턴 — auth.users 는 SDK / RLS 가 관리, 추가 메타는 profiles 에.
-- id = auth.users.id 그대로. trigger 가 자동 빈 row 생성.
-- ============================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT,                                              -- denormalized (admin UI 조회용)
  role          user_role NOT NULL DEFAULT 'teacher',
  status        user_status NOT NULL DEFAULT 'pending',
  tenant_id     UUID REFERENCES tenants(id) ON DELETE SET NULL,
  display_name  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON profiles(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role, status);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

DROP TRIGGER IF EXISTS profiles_touch ON profiles;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================================
-- 4. ai_usage (AI 호출 비용 / 토큰 로그)
-- ----------------------------------------------------------------------------
-- Vercel function 의 api/_logUsage.ts 가 fire-and-forget insert.
-- service role key 로 RLS 우회. SELECT 만 RLS 적용 (admin 권한별).
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_usage (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id                UUID REFERENCES tenants(id) ON DELETE SET NULL,
  endpoint                 TEXT NOT NULL,                          -- 'ai-ocr' / 'ai-solution' / 'ai-variant' / 'export-pdf'
  provider                 TEXT NOT NULL,                          -- 'anthropic' / 'gemini' / 'openai'
  model                    TEXT NOT NULL,
  input_tokens             INT NOT NULL DEFAULT 0,
  output_tokens            INT NOT NULL DEFAULT 0,
  cache_read_tokens        INT NOT NULL DEFAULT 0,
  cache_creation_tokens    INT NOT NULL DEFAULT 0,
  cost_usd                 NUMERIC(10, 6) NOT NULL DEFAULT 0,
  latency_ms               INT,
  error                    TEXT,                                   -- NULL if success
  test_id                  UUID REFERENCES tests(id) ON DELETE SET NULL,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant_created ON ai_usage(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created   ON ai_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_model_created  ON ai_usage(model, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_errors ON ai_usage(created_at DESC) WHERE error IS NOT NULL;

-- ============================================================================
-- 5. error_logs (클라이언트 + 서버 모든 에러 통합)
-- ----------------------------------------------------------------------------
-- - 클라이언트: src/lib/errorReporter.ts 가 window.onerror / unhandledrejection /
--   hook catch 에서 reportError(err, context) 호출 → 이 테이블에 upsert
-- - 서버: api/_logUsage.ts 가 에러 발생 시 ai_usage.error + error_logs 양쪽 insert
-- - fingerprint 매칭 시 occurrence_count++ + last_seen_at = now() (별도 row X)
-- ============================================================================
CREATE TABLE IF NOT EXISTS error_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id         UUID REFERENCES tenants(id) ON DELETE SET NULL,
  kind              TEXT NOT NULL,                                  -- 'client_uncaught' / 'unhandled_rejection' / 'api_call' / 'ocr' / 'solution' / 'variant' / 'export_pdf'
  severity          TEXT NOT NULL DEFAULT 'error',                  -- 'info' / 'warning' / 'error' / 'fatal'
  message           TEXT NOT NULL,
  stack             TEXT,
  context           JSONB,                                          -- {url, route, model, endpoint, page_id, problem_id, attempt, http_status, ...}
  user_agent        TEXT,
  fingerprint       TEXT NOT NULL,                                  -- normalized hash (message + stack first line + endpoint)
  occurrence_count  INT NOT NULL DEFAULT 1,
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- fingerprint + user_id + kind 조합으로 unique → upsert 시 매칭
  UNIQUE (fingerprint, user_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON error_logs(fingerprint);
CREATE INDEX IF NOT EXISTS idx_error_logs_severity ON error_logs(severity, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_kind ON error_logs(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_tenant ON error_logs(tenant_id, last_seen_at DESC);

-- ============================================================================
-- 6. content_feedback (사용자 👍/👎 + 사유)
-- ----------------------------------------------------------------------------
-- Step 3/4 카드의 FeedbackBar 가 submit. Phase E 의 ContentInsights 가 집계.
-- polymorphic target — target_kind + target_id 로 OCR/solution/variant 모두 가리킴.
-- ============================================================================
CREATE TABLE IF NOT EXISTS content_feedback (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id    UUID REFERENCES tenants(id) ON DELETE SET NULL,
  target_kind  TEXT NOT NULL,                                     -- 'ocr_problem' / 'solution' / 'variant'
  target_id    UUID NOT NULL,                                     -- 어플리케이션 레벨 검증 (polymorphic FK)
  rating       SMALLINT,                                          -- 1 (👎) | 5 (👍) | NULL
  comment      TEXT,
  reason_chips TEXT[] NOT NULL DEFAULT '{}',                      -- ['accuracy', 'terminology', 'diagram', 'other']
  context      JSONB,                                             -- {model, grade, topic, problem_text_snippet, ...}
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_target ON content_feedback(target_kind, target_id);
CREATE INDEX IF NOT EXISTS idx_feedback_rating ON content_feedback(rating, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_tenant ON content_feedback(tenant_id, created_at DESC);

-- ============================================================================
-- 7. tests.tenant_id 컬럼 추가 (nullable, backfill 별도)
-- ----------------------------------------------------------------------------
-- 기존 row 는 NULL — RLS 의 OR 분기 (`user_id = auth.uid()`) 가 그대로 잡음.
-- 추후 backfill: 학원 admin 이 자기 tenant 의 교사 profiles 조회 후 그들의 tests
-- UPDATE SET tenant_id = ...
-- ============================================================================
ALTER TABLE tests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tests_tenant ON tests(tenant_id, created_at DESC);

-- ============================================================================
-- 8. Helper functions (RLS 우회 — SECURITY DEFINER)
-- ----------------------------------------------------------------------------
-- profiles 의 RLS 정책이 auth_role() 을 호출하면 무한루프 위험 →
-- SECURITY DEFINER + 함수 본문 안에서 SET LOCAL row_security = off 명시.
-- ============================================================================
CREATE OR REPLACE FUNCTION auth_role() RETURNS user_role
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_role user_role;
BEGIN
  -- RLS 우회 (SECURITY DEFINER 의 owner 권한)
  SELECT role INTO v_role FROM profiles WHERE id = auth.uid();
  RETURN v_role;
END;
$$;

CREATE OR REPLACE FUNCTION auth_tenant() RETURNS UUID
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM profiles WHERE id = auth.uid();
  RETURN v_tenant;
END;
$$;

-- ============================================================================
-- 9. auth.users 신규 가입 → profiles 자동 row 생성 trigger
-- ----------------------------------------------------------------------------
-- 기본 status='pending', role='teacher'. 학원 admin 또는 system_admin 이
-- profiles UPDATE 로 활성화.
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email)
    VALUES (NEW.id, NEW.email)
    ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- 10. 기존 가입자 backfill (멱등 — 이미 있는 profiles 는 ON CONFLICT skip)
-- ============================================================================
INSERT INTO profiles (id, email)
  SELECT id, email FROM auth.users
  ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 11. error_logs upsert helper
-- ----------------------------------------------------------------------------
-- 같은 fingerprint+user+kind 조합이면 occurrence_count++ + last_seen_at = now().
-- 새 조합이면 새 row.
-- ============================================================================
CREATE OR REPLACE FUNCTION upsert_error_log(
  p_user_id     UUID,
  p_tenant_id   UUID,
  p_kind        TEXT,
  p_severity    TEXT,
  p_message     TEXT,
  p_stack       TEXT,
  p_context     JSONB,
  p_user_agent  TEXT,
  p_fingerprint TEXT
) RETURNS UUID
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO error_logs (
    user_id, tenant_id, kind, severity, message, stack, context, user_agent, fingerprint
  ) VALUES (
    p_user_id, p_tenant_id, p_kind, p_severity, p_message, p_stack, p_context, p_user_agent, p_fingerprint
  )
  ON CONFLICT (fingerprint, user_id, kind) DO UPDATE
    SET occurrence_count = error_logs.occurrence_count + 1,
        last_seen_at = now(),
        message = EXCLUDED.message,    -- 최신 메시지 갱신 (포맷 변경 대응)
        stack = COALESCE(EXCLUDED.stack, error_logs.stack),
        context = EXCLUDED.context
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ============================================================================
-- 12. RLS 활성화 + 정책 (새 5 테이블)
-- ============================================================================
ALTER TABLE tenants          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage         ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_feedback ENABLE ROW LEVEL SECURITY;

-- ── profiles ─────────────────────────────────────────────────────────────────
-- SELECT: 본인 + (tenant_admin 의 자기 tenant 의 모든 profile) + system_admin 전체
DROP POLICY IF EXISTS profiles_select_role ON profiles;
CREATE POLICY profiles_select_role ON profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR (auth_role() = 'tenant_admin' AND tenant_id = auth_tenant())
    OR auth_role() = 'system_admin'
  );

-- UPDATE: 본인 (display_name 등) + tenant_admin (자기 tenant 의 status/role) + system_admin
DROP POLICY IF EXISTS profiles_update_own_or_admin ON profiles;
CREATE POLICY profiles_update_own_or_admin ON profiles
  FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR (auth_role() = 'tenant_admin' AND tenant_id = auth_tenant())
    OR auth_role() = 'system_admin'
  )
  WITH CHECK (
    id = auth.uid()
    OR (auth_role() = 'tenant_admin' AND tenant_id = auth_tenant())
    OR auth_role() = 'system_admin'
  );

-- INSERT: trigger 만 — application 측 차단. 명시적 정책으로 표현 X (RLS 가 막음).
-- DELETE: system_admin 만.
DROP POLICY IF EXISTS profiles_delete_sysadmin ON profiles;
CREATE POLICY profiles_delete_sysadmin ON profiles
  FOR DELETE TO authenticated
  USING (auth_role() = 'system_admin');

-- ── tenants ──────────────────────────────────────────────────────────────────
-- SELECT: 본인 tenant + system_admin 전체
DROP POLICY IF EXISTS tenants_select_role ON tenants;
CREATE POLICY tenants_select_role ON tenants
  FOR SELECT TO authenticated
  USING (
    id = auth_tenant()
    OR auth_role() = 'system_admin'
  );

-- INSERT / UPDATE / DELETE: system_admin 만
DROP POLICY IF EXISTS tenants_modify_sysadmin ON tenants;
CREATE POLICY tenants_modify_sysadmin ON tenants
  FOR ALL TO authenticated
  USING (auth_role() = 'system_admin')
  WITH CHECK (auth_role() = 'system_admin');

-- ── ai_usage ────────────────────────────────────────────────────────────────
-- SELECT only — INSERT 는 service role (RLS 우회).
DROP POLICY IF EXISTS ai_usage_select_role ON ai_usage;
CREATE POLICY ai_usage_select_role ON ai_usage
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (auth_role() = 'tenant_admin' AND tenant_id = auth_tenant())
    OR auth_role() = 'system_admin'
  );

-- ── error_logs ──────────────────────────────────────────────────────────────
-- SELECT: admin role 만 (개인 사용자는 자기 에러 안 봐도 됨 — UI 노출 X)
DROP POLICY IF EXISTS error_logs_select_admin ON error_logs;
CREATE POLICY error_logs_select_admin ON error_logs
  FOR SELECT TO authenticated
  USING (
    (auth_role() = 'tenant_admin' AND tenant_id = auth_tenant())
    OR auth_role() = 'system_admin'
  );

-- INSERT: 본인 에러는 본인이 (client error reporter). admin 도 가능.
DROP POLICY IF EXISTS error_logs_insert_own ON error_logs;
CREATE POLICY error_logs_insert_own ON error_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR auth_role() IN ('tenant_admin', 'system_admin')
  );

-- UPDATE: upsert_error_log() 가 occurrence_count 증가 — admin / 본인.
DROP POLICY IF EXISTS error_logs_update_own ON error_logs;
CREATE POLICY error_logs_update_own ON error_logs
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR auth_role() IN ('tenant_admin', 'system_admin')
  );

-- ── content_feedback ───────────────────────────────────────────────────────
-- INSERT: 본인.
DROP POLICY IF EXISTS feedback_insert_own ON content_feedback;
CREATE POLICY feedback_insert_own ON content_feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- SELECT: 본인 + tenant admin + system_admin.
DROP POLICY IF EXISTS feedback_select_role ON content_feedback;
CREATE POLICY feedback_select_role ON content_feedback
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (auth_role() = 'tenant_admin' AND tenant_id = auth_tenant())
    OR auth_role() = 'system_admin'
  );

-- ============================================================================
-- 13. 검증 — 다음 query 가 무에러로 끝나면 schema-admin 적용 성공
-- ============================================================================
SELECT 'schema-admin.sql apply OK. 다음 단계: schema.sql 의 RLS 부분 재실행 (role-aware 갱신).' AS status;
