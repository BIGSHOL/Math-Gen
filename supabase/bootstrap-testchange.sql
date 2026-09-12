-- mathg-gen -> testchange Supabase 전체 설치본
-- 대상 프로젝트: pqylrbowrfliicxzurex
-- Supabase Dashboard > SQL Editor > New query에 이 파일 전체를 붙여 넣고 Run 하세요.
-- 기존 testchange 테이블(exams, questions 등)은 삭제하거나 변경하지 않습니다.
-- 이 스크립트는 재실행할 수 있도록 멱등 형태로 구성했습니다.

-- ============================================================================
-- 0. 공통 함수와 tests 선생성
-- ----------------------------------------------------------------------------
-- schema-admin.sql은 tests를 참조하고, schema.sql의 RLS는 관리자 함수를 참조한다.
-- 따라서 이 최소 정의를 먼저 만든 뒤 관리자 스키마와 본 스키마를 차례로 적용한다.
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.tests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  title               TEXT NOT NULL,
  subject             TEXT,
  grade               TEXT,
  exam_category       TEXT,
  problem_count       INT NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'draft',
  status_text         TEXT,
  tags                TEXT[] NOT NULL DEFAULT '{}',
  topic_distribution  JSONB,
  uploaded_file_name  TEXT,
  furthest_step       SMALLINT DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tests_user_created
  ON public.tests(user_id, created_at DESC);

-- ======================== 관리자/권한 스키마 ========================

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
-- 13. admin_anomalies view (Phase D — 이상 감지)
-- ----------------------------------------------------------------------------
-- ai_usage 위에 3 가지 이상 패턴 통합:
--   1. high_volume      : 1시간 누적 호출 > 100
--   2. high_error_rate  : 24시간 누적 ≥ 50회 + 에러율 > 30%
--   3. high_cost        : 24시간 누적 비용 > $20
--
-- RLS 는 *view 자체에 INHERIT* — underlying ai_usage 의 정책이 자동 적용.
-- Admin UI 의 Monitoring 섹션이 30초 polling 으로 조회.
-- ============================================================================
DROP VIEW IF EXISTS admin_anomalies;
CREATE VIEW admin_anomalies WITH (security_invoker = true) AS
-- 1. high_volume — 1시간 누적 100회 초과
SELECT
  'high_volume'::TEXT       AS kind,
  user_id,
  tenant_id,
  count(*)::NUMERIC         AS metric,           -- 호출 횟수
  count(*)::NUMERIC         AS display_value,
  max(created_at)           AS last_at,
  '시간당 호출 ' || count(*) || '회' AS description
FROM ai_usage
WHERE created_at > now() - interval '1 hour'
GROUP BY user_id, tenant_id
HAVING count(*) > 100

UNION ALL

-- 2. high_error_rate — 24시간 누적 ≥ 50회 + 에러율 > 30%
SELECT
  'high_error_rate'::TEXT   AS kind,
  user_id,
  tenant_id,
  (count(*) FILTER (WHERE error IS NOT NULL))::NUMERIC / count(*)::NUMERIC * 100  AS metric,
  (count(*) FILTER (WHERE error IS NOT NULL))::NUMERIC AS display_value,
  max(created_at)           AS last_at,
  '에러율 ' || ROUND((count(*) FILTER (WHERE error IS NOT NULL))::NUMERIC / count(*)::NUMERIC * 100, 1) || '% (' || count(*) FILTER (WHERE error IS NOT NULL) || '/' || count(*) || ')' AS description
FROM ai_usage
WHERE created_at > now() - interval '24 hours'
GROUP BY user_id, tenant_id
HAVING count(*) >= 50
   AND (count(*) FILTER (WHERE error IS NOT NULL))::NUMERIC / count(*)::NUMERIC > 0.3

UNION ALL

-- 3. high_cost — 24시간 누적 $20+
SELECT
  'high_cost'::TEXT         AS kind,
  user_id,
  tenant_id,
  sum(cost_usd)::NUMERIC    AS metric,
  sum(cost_usd)::NUMERIC    AS display_value,
  max(created_at)           AS last_at,
  '24시간 비용 $' || ROUND(sum(cost_usd)::NUMERIC, 2) AS description
FROM ai_usage
WHERE created_at > now() - interval '24 hours'
GROUP BY user_id, tenant_id
HAVING sum(cost_usd) > 20;

COMMENT ON VIEW admin_anomalies IS
  'AI 호출의 3가지 이상 패턴 — Phase D. RLS 는 ai_usage 의 정책 자동 상속.';

-- ============================================================================
-- 14. 검증 — 다음 query 가 무에러로 끝나면 schema-admin 적용 성공
-- ============================================================================
SELECT 'schema-admin.sql apply OK. 다음 단계: schema.sql 의 RLS 부분 재실행 (role-aware 갱신).' AS status;

-- =========================== 본 스키마 =============================

-- ============================================================================
-- mathg-gen Supabase schema (Phase A — 인프라)
-- ----------------------------------------------------------------------------
-- 실행 방법:
--   1. Supabase 대시보드 → SQL Editor → 새 query
--   2. 이 파일 통째로 paste → Run
--   3. 끝나면 Storage 탭에서 3 buckets 생성 (별도, 아래 주석 참고)
--
-- 멱등성: `CREATE TABLE IF NOT EXISTS` / `CREATE POLICY IF NOT EXISTS` 패턴 —
-- 여러 번 실행해도 안전. 단 컬럼 추가 / 정책 변경 시 별도 ALTER 필요.
--
-- 5 테이블: tests → pages → ocr_problems → problem_reviews → variant_history
-- 인증: 실 사용자는 auth.uid() (Phase G Auth 가동). 정책은 COALESCE 로 zero UUID
-- 폴백 (auth 없는 dev/anon 호출 보호용 — production 사용자는 항상 auth.uid() 보유).
-- ============================================================================

-- pgcrypto 는 Supabase 기본 활성 (gen_random_uuid() 사용 가능).

-- ============================================================================
-- 1. tests (시험지 root)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  title               TEXT NOT NULL,
  subject             TEXT,
  grade               TEXT,                                  -- mathDefense GradeKey (middle1, high2_calc1 등)
  exam_category       TEXT,                                  -- MIDTERM / FINAL / MOCK / OTHER
  problem_count       INT NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'draft',         -- ok / warn / draft
  status_text         TEXT,
  tags                TEXT[] NOT NULL DEFAULT '{}',
  topic_distribution  JSONB,                                 -- TopicSlice[] { topic, count, accuracy? }
  uploaded_file_name  TEXT,
  furthest_step       SMALLINT DEFAULT 0,                      -- 진행한 가장 먼 위자드 단계 (0=업로드 … 6=내보내기)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tests_user_created
  ON tests(user_id, created_at DESC);

-- 기존 tests 테이블에 furthest_step 추가 (마이그레이션 — 2026-06-03).
-- 미실행 시 클라이언트의 tests.ts graceful fallback 이 컬럼을 strip (저장 정상).
ALTER TABLE tests ADD COLUMN IF NOT EXISTS furthest_step SMALLINT DEFAULT 0;

-- ============================================================================
-- 2. pages (시험지의 페이지 — PDF page 단위)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id             UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  page_num            INT NOT NULL,
  rotation            SMALLINT NOT NULL DEFAULT 0,           -- 0 / 90 / 180 / 270
  text_layer          TEXT,                                  -- PDF 추출 텍스트 (OCR 힌트 / skip 휴리스틱)
  is_problem_page     BOOL NOT NULL DEFAULT true,
  force_ocr           BOOL DEFAULT false,
  image_storage_path  TEXT,                                  -- {user_id}/{test_id}/{page_num}.png
  thumb_storage_path  TEXT,                                  -- {user_id}/{test_id}/{page_num}.jpg
  ocr_complete        BOOL NOT NULL DEFAULT false,
  ocr_model           TEXT,
  ocr_error           TEXT,
  crop_boxes          JSONB DEFAULT '[]'::jsonb,             -- Phase I: Step 1.5 검수 박스 [{id,class,kind,bbox[4],source,number,verified}]
  crop_inspected      BOOL DEFAULT false,                    -- Phase I: 사용자가 검수 완료 표시
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (test_id, page_num)
);
-- Phase I 마이그레이션 (멱등): 기존 행 컬럼 추가
ALTER TABLE pages ADD COLUMN IF NOT EXISTS crop_boxes JSONB DEFAULT '[]'::jsonb;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS crop_inspected BOOL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_pages_test
  ON pages(test_id, page_num);

-- ============================================================================
-- 3. ocr_problems (한 페이지의 문항들 — Step 2 OCR + Step 3 해설 결과)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ocr_problems (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id             UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  problem_number      INT NOT NULL,
  topic               TEXT,
  text                TEXT NOT NULL,
  choices             JSONB,                                 -- string[] (객관식 5지) | null (주관식)
  choices_layout      TEXT DEFAULT 'auto',                   -- Phase #7: 'auto' | '1x5' | '2x3' | '3x2' | '5x1'
  answer              TEXT,
  solution            TEXT,
  solution_model      TEXT,
  ocr_model           TEXT,
  solution_warnings   JSONB,                                 -- SolutionWarning[] (Pattern J 등)
  body_missing        BOOL DEFAULT false,
  choices_missing     BOOL DEFAULT false,
  status              TEXT NOT NULL DEFAULT 'pending',       -- ok / warn / pending
  reviewed            BOOL NOT NULL DEFAULT false,
  images              JSONB,                                 -- OCRImage[] { box [4], label }
  diagram_params      JSONB,                                 -- Phase F: vector 도형 spec [{type, ...}] | null
  solution_auto_retried BOOL DEFAULT false,                  -- Phase G: validator warning 자동 재생성 1회 가드
  figures             JSONB,                                 -- Phase B: [그림N] 레이아웃 box [{box[4], kind, label}] | null
  blocks              JSONB,                                 -- 옵션 B: OCR 네이티브 typed-block ContentBlock[] | null (HWP blocks-native)
  choice_groups       JSONB,                                 -- 옵션 B: 보기 ChoiceGroup[] | null
  sub_questions       JSONB,                                 -- D3: 소문항 (1)(2) SubQuestion[] | null
  score               INT,                                   -- 옵션 B: 배점 | null
  label_type          TEXT,                                  -- 옵션 B: 문항 유형 라벨 | null
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Phase #7 + dedup + 옵션 B 마이그레이션 (멱등) — column 없으면 추가
ALTER TABLE ocr_problems ADD COLUMN IF NOT EXISTS choices_layout TEXT DEFAULT 'auto';
ALTER TABLE ocr_problems ADD COLUMN IF NOT EXISTS diagram_params JSONB;
ALTER TABLE ocr_problems ADD COLUMN IF NOT EXISTS solution_auto_retried BOOL DEFAULT false;
ALTER TABLE ocr_problems ADD COLUMN IF NOT EXISTS figures JSONB;            -- Phase B: 위치 기반 배치
ALTER TABLE ocr_problems ADD COLUMN IF NOT EXISTS blocks JSONB;             -- 옵션 B: typed-block
ALTER TABLE ocr_problems ADD COLUMN IF NOT EXISTS choice_groups JSONB;      -- 옵션 B: 보기 ChoiceGroup
ALTER TABLE ocr_problems ADD COLUMN IF NOT EXISTS score INT;                -- 옵션 B: 배점
ALTER TABLE ocr_problems ADD COLUMN IF NOT EXISTS label_type TEXT;          -- 옵션 B: 유형 라벨
ALTER TABLE ocr_problems ADD COLUMN IF NOT EXISTS sub_questions JSONB;      -- D3: 소문항 (1)(2)
CREATE INDEX IF NOT EXISTS idx_problems_page
  ON ocr_problems(page_id, problem_number);

-- ============================================================================
-- 4. problem_reviews (Step 4 변형 결과 — 원본 + 변형 pair)
-- ============================================================================
CREATE TABLE IF NOT EXISTS problem_reviews (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id             UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  ocr_problem_id      UUID REFERENCES ocr_problems(id) ON DELETE CASCADE,
  original_problem    JSONB NOT NULL,                        -- GeneratedProblem
  variant_problem     JSONB NOT NULL,                        -- GeneratedProblem
  status              TEXT NOT NULL DEFAULT 'pending',       -- confirmed / review / pending
  gen_model           TEXT,
  gen_error           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_test
  ON problem_reviews(test_id);

-- ============================================================================
-- 5. variant_history (변형 옵션 이력 — UI 의 "변형 N차" 카드)
-- ============================================================================
CREATE TABLE IF NOT EXISTS variant_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id             UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  intensity           SMALLINT NOT NULL,                     -- 0 (digitize) / 1 (similar) / 2 (variant)
  count               INT NOT NULL,
  label               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_variant_history_test
  ON variant_history(test_id, created_at DESC);

-- ============================================================================
-- 6. updated_at 자동 갱신 trigger
-- ============================================================================
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tests_touch ON tests;
CREATE TRIGGER tests_touch
  BEFORE UPDATE ON tests
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ============================================================================
-- 7. RLS 정책 (auth.uid() + role-aware admin)
-- ----------------------------------------------------------------------------
-- 정책 분기 (OR):
--   1. 본인:             user_id = COALESCE(auth.uid(), '00000000-...'::UUID)
--                        production 사용자는 항상 auth.uid() 보유; zero UUID 폴백은
--                        auth 미설정 dev/anon 호출 보호용. 실 데이터의 user_id 는
--                        gen_random_uuid() 라 zero 와 충돌 없음.
--   2. tenant_admin:     tests.tenant_id = auth_tenant() (같은 학원 모든 row)
--   3. system_admin:     전체 row
--
-- ⚠ 전제: schema-admin.sql 가 *먼저* 적용되어야 함 — auth_role() / auth_tenant()
-- helper 함수가 정의돼 있어야 함. 멱등 안전 — 여러 번 실행 가능.
-- ============================================================================

ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_history ENABLE ROW LEVEL SECURITY;

-- ── tests ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tests_select_own ON tests;
DROP POLICY IF EXISTS tests_select_role ON tests;
CREATE POLICY tests_select_role ON tests
  FOR SELECT TO anon, authenticated
  USING (
    user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    OR (auth_role() = 'tenant_admin' AND tenant_id IS NOT NULL AND tenant_id = auth_tenant())
    OR auth_role() = 'system_admin'
  );
DROP POLICY IF EXISTS tests_insert_own ON tests;
DROP POLICY IF EXISTS tests_insert_role ON tests;
CREATE POLICY tests_insert_role ON tests
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    OR auth_role() IN ('tenant_admin', 'system_admin')
  );
DROP POLICY IF EXISTS tests_update_own ON tests;
DROP POLICY IF EXISTS tests_update_role ON tests;
CREATE POLICY tests_update_role ON tests
  FOR UPDATE TO anon, authenticated
  USING (
    user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    OR (auth_role() = 'tenant_admin' AND tenant_id IS NOT NULL AND tenant_id = auth_tenant())
    OR auth_role() = 'system_admin'
  );
DROP POLICY IF EXISTS tests_delete_own ON tests;
DROP POLICY IF EXISTS tests_delete_role ON tests;
CREATE POLICY tests_delete_role ON tests
  FOR DELETE TO anon, authenticated
  USING (
    user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    OR (auth_role() = 'tenant_admin' AND tenant_id IS NOT NULL AND tenant_id = auth_tenant())
    OR auth_role() = 'system_admin'
  );

-- ── pages: tests FK 통해 user_id 확인 ────────────────────────────────────────
-- tests 의 새 정책이 자동 전파 — EXISTS 가 tests RLS 를 거치므로 admin row 도 보임.
DROP POLICY IF EXISTS pages_all_own ON pages;
DROP POLICY IF EXISTS pages_all_role ON pages;
CREATE POLICY pages_all_role ON pages
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tests
      WHERE tests.id = pages.test_id
        AND (
          tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
          OR (auth_role() = 'tenant_admin' AND tests.tenant_id IS NOT NULL AND tests.tenant_id = auth_tenant())
          OR auth_role() = 'system_admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tests
      WHERE tests.id = pages.test_id
        AND (
          tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
          OR auth_role() IN ('tenant_admin', 'system_admin')
        )
    )
  );

-- ── ocr_problems: pages → tests 조인 ─────────────────────────────────────────
DROP POLICY IF EXISTS ocr_problems_all_own ON ocr_problems;
DROP POLICY IF EXISTS ocr_problems_all_role ON ocr_problems;
CREATE POLICY ocr_problems_all_role ON ocr_problems
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pages
      JOIN tests ON tests.id = pages.test_id
      WHERE pages.id = ocr_problems.page_id
        AND (
          tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
          OR (auth_role() = 'tenant_admin' AND tests.tenant_id IS NOT NULL AND tests.tenant_id = auth_tenant())
          OR auth_role() = 'system_admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pages
      JOIN tests ON tests.id = pages.test_id
      WHERE pages.id = ocr_problems.page_id
        AND (
          tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
          OR auth_role() IN ('tenant_admin', 'system_admin')
        )
    )
  );

-- ── problem_reviews: tests FK 통해 ────────────────────────────────────────────
DROP POLICY IF EXISTS reviews_all_own ON problem_reviews;
DROP POLICY IF EXISTS reviews_all_role ON problem_reviews;
CREATE POLICY reviews_all_role ON problem_reviews
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tests
      WHERE tests.id = problem_reviews.test_id
        AND (
          tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
          OR (auth_role() = 'tenant_admin' AND tests.tenant_id IS NOT NULL AND tests.tenant_id = auth_tenant())
          OR auth_role() = 'system_admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tests
      WHERE tests.id = problem_reviews.test_id
        AND (
          tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
          OR auth_role() IN ('tenant_admin', 'system_admin')
        )
    )
  );

-- ── variant_history ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS variant_history_all_own ON variant_history;
DROP POLICY IF EXISTS variant_history_all_role ON variant_history;
CREATE POLICY variant_history_all_role ON variant_history
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tests
      WHERE tests.id = variant_history.test_id
        AND (
          tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
          OR (auth_role() = 'tenant_admin' AND tests.tenant_id IS NOT NULL AND tests.tenant_id = auth_tenant())
          OR auth_role() = 'system_admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tests
      WHERE tests.id = variant_history.test_id
        AND (
          tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
          OR auth_role() IN ('tenant_admin', 'system_admin')
        )
    )
  );

-- ============================================================================
-- 8. ocr_feedback (OCR 단계 좋아요/싫어요 — Phase #6 사용자 보고 스크랩)
-- ----------------------------------------------------------------------------
-- 사용자가 OCR 결과 카드에 👍 / 👎 한 기록. 👎 시 사전 정의 reason_codes
-- (multi-select) + 자유 입력 reason_text. 관리자가 list / resolved 표시.
-- ============================================================================
CREATE TABLE IF NOT EXISTS ocr_feedback (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ocr_problem_id      UUID NOT NULL REFERENCES ocr_problems(id) ON DELETE CASCADE,
  test_id             UUID NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  tenant_id           UUID,                                  -- tests.tenant_id 복사 (admin filter 효율)
  rating              TEXT NOT NULL CHECK (rating IN ('like', 'dislike')),
  reason_codes        TEXT[] NOT NULL DEFAULT '{}',          -- 사전 정의 사유 코드 (body_missing / choices_missing / latex_error / figure_error / answer_wrong / other_distortion)
  reason_text         TEXT,                                  -- 자유 입력 (선택)
  resolved            BOOL NOT NULL DEFAULT false,           -- 관리자 검토 완료
  resolved_at         TIMESTAMPTZ,
  resolved_by         UUID,
  resolved_note       TEXT,                                  -- 관리자 메모 (선택)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 한 사용자 + 한 문제 = 한 피드백만 (UPSERT 패턴, like → dislike 변경 가능)
  UNIQUE (ocr_problem_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_feedback_test
  ON ocr_feedback(test_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_scrap
  ON ocr_feedback(rating, resolved, created_at DESC)
  WHERE rating = 'dislike';
CREATE INDEX IF NOT EXISTS idx_feedback_tenant
  ON ocr_feedback(tenant_id, rating, resolved)
  WHERE tenant_id IS NOT NULL AND rating = 'dislike';

DROP TRIGGER IF EXISTS feedback_touch ON ocr_feedback;
CREATE TRIGGER feedback_touch
  BEFORE UPDATE ON ocr_feedback
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE ocr_feedback ENABLE ROW LEVEL SECURITY;

-- 본인 (자신의 피드백 read/write) + tenant_admin (같은 tenant 의 dislike 만 read)
-- + system_admin (전체).
DROP POLICY IF EXISTS feedback_select_role ON ocr_feedback;
CREATE POLICY feedback_select_role ON ocr_feedback
  FOR SELECT TO anon, authenticated
  USING (
    user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    OR (auth_role() = 'tenant_admin' AND tenant_id IS NOT NULL AND tenant_id = auth_tenant())
    OR auth_role() = 'system_admin'
  );

DROP POLICY IF EXISTS feedback_insert_role ON ocr_feedback;
CREATE POLICY feedback_insert_role ON ocr_feedback
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
  );

-- UPDATE: 본인은 자신의 피드백 (rating 변경 / 사유 추가), admin 은 resolved/resolved_note 수정
DROP POLICY IF EXISTS feedback_update_role ON ocr_feedback;
CREATE POLICY feedback_update_role ON ocr_feedback
  FOR UPDATE TO anon, authenticated
  USING (
    user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    OR (auth_role() = 'tenant_admin' AND tenant_id IS NOT NULL AND tenant_id = auth_tenant())
    OR auth_role() = 'system_admin'
  );

-- DELETE: 본인만 (자신의 피드백 취소). admin 은 미허용 — 스크랩 기록 보존.
DROP POLICY IF EXISTS feedback_delete_own ON ocr_feedback;
CREATE POLICY feedback_delete_own ON ocr_feedback
  FOR DELETE TO anon, authenticated
  USING (user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID));

-- ============================================================================
-- Storage Buckets — 대시보드 Storage 탭에서 *직접* 생성 (SQL 로 안 됨)
-- ----------------------------------------------------------------------------
-- 1. `pdfs` — private, MIME: application/pdf, size limit: 50MB
-- 2. `page-images` — private, MIME: image/png, image/jpeg, size limit: 5MB
-- 3. `page-thumbnails` — private, MIME: image/jpeg, size limit: 500KB
--
-- 각 bucket 의 RLS policy (Storage > Policies 에서 직접 설정):
--   - SELECT/INSERT/UPDATE/DELETE: `(storage.foldername(name))[1] = COALESCE(auth.uid()::text, '00000000-0000-0000-0000-000000000000')`
--   - 이렇게 하면 file path 의 첫 segment (`{user_id}/...`) 가 본인 UUID 일 때만 접근.
-- ============================================================================

-- ============================================================================
-- §9 exam_analyses — 시험지 분석 결과 영구 저장 (Phase N)
-- ----------------------------------------------------------------------------
-- mathlab 의 ExamAnalysis 패턴 흡수 — blank paper (기출 원본) 만 분석.
-- 1 시험지 = 1 분석 (UNIQUE test_id). 재분석은 UPSERT 로 갱신.
-- ============================================================================
CREATE TABLE IF NOT EXISTS exam_analyses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id             UUID NOT NULL UNIQUE REFERENCES tests(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
  tenant_id           UUID,                                  -- tests.tenant_id 복사 (admin filter 효율)
  exam_info           JSONB NOT NULL,                        -- { total_questions, total_points, school_name, format_distribution }
  summary             JSONB NOT NULL,                        -- { difficulty_distribution, type_distribution, average_difficulty, dominant_type }
  questions           JSONB NOT NULL,                        -- AnalyzedQuestion[] (10필드, student 제외)
  model               TEXT NOT NULL,                         -- "claude-sonnet-4-6" 또는 모델 식별자
  input_page_count    INT NOT NULL DEFAULT 0,                -- 분석에 사용한 페이지 수 (Vision token 추정용)
  cache_read_tokens   INT,                                   -- Anthropic usage.cache_read_input_tokens (모니터링)
  cache_write_tokens  INT,                                   -- Anthropic usage.cache_creation_input_tokens
  commentary          JSONB,                                 -- Phase N+3: AI 시험 총평 (overall_comment / strength / improvement / notable / teaching / score_strategies + v4_* 비활성)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Phase N+3 migration — 기존 row 호환 (commentary 컬럼 추가)
ALTER TABLE exam_analyses ADD COLUMN IF NOT EXISTS commentary JSONB;
CREATE INDEX IF NOT EXISTS idx_exam_analyses_user
  ON exam_analyses(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_analyses_tenant
  ON exam_analyses(tenant_id, created_at DESC)
  WHERE tenant_id IS NOT NULL;

DROP TRIGGER IF EXISTS exam_analyses_touch ON exam_analyses;
CREATE TRIGGER exam_analyses_touch
  BEFORE UPDATE ON exam_analyses
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

ALTER TABLE exam_analyses ENABLE ROW LEVEL SECURITY;

-- 본인 + tenant_admin (같은 tenant) + system_admin (전체)
DROP POLICY IF EXISTS exam_analyses_select_role ON exam_analyses;
CREATE POLICY exam_analyses_select_role ON exam_analyses
  FOR SELECT TO anon, authenticated
  USING (
    user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    OR (auth_role() = 'tenant_admin' AND tenant_id IS NOT NULL AND tenant_id = auth_tenant())
    OR auth_role() = 'system_admin'
  );

DROP POLICY IF EXISTS exam_analyses_insert_role ON exam_analyses;
CREATE POLICY exam_analyses_insert_role ON exam_analyses
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
  );

DROP POLICY IF EXISTS exam_analyses_update_role ON exam_analyses;
CREATE POLICY exam_analyses_update_role ON exam_analyses
  FOR UPDATE TO anon, authenticated
  USING (
    user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    OR auth_role() = 'system_admin'
  );

DROP POLICY IF EXISTS exam_analyses_delete_own ON exam_analyses;
CREATE POLICY exam_analyses_delete_own ON exam_analyses
  FOR DELETE TO anon, authenticated
  USING (user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID));

-- 검증: 다음 query 가 빈 결과 반환하면 schema apply 성공.
SELECT 'Schema apply OK. 다음 단계: Storage 탭에서 3 buckets 생성.' AS status;

-- ============================================================================
-- Storage bucket 생성/갱신
-- ============================================================================
INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES
  ('pdfs', 'pdfs', false, 52428800, ARRAY['application/pdf']::text[]),
  ('page-images', 'page-images', false, 10485760, ARRAY['image/png', 'image/jpeg']::text[]),
  ('page-thumbnails', 'page-thumbnails', false, 512000, ARRAY['image/jpeg']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ========================= Storage 정책 ============================

-- ============================================================================
-- mathg-gen Supabase Storage 정책 — Phase B
-- ----------------------------------------------------------------------------
-- 실행 방법:
--   1. Storage 탭에서 3 buckets 먼저 생성 (대시보드 직접):
--      - `pdfs`           — private, MIME: application/pdf,         50 MB limit
--      - `page-images`    — private, MIME: image/png, image/jpeg,   10 MB limit
--        (초과 페이지는 클라이언트가 JPEG 압축으로 fit — storage.ts STORAGE_IMAGE_MAX_BYTES 동기)
--      - `page-thumbnails`— private, MIME: image/jpeg,             500 KB limit
--   2. SQL Editor 에 *이 파일 통째로* paste → Run.
--   3. 마지막에 "Storage policies OK" 메시지 확인.
--
-- 정책 패턴: `(storage.foldername(name))[1] = COALESCE(auth.uid()::text, '0...'::text)`
--   파일 경로의 첫 segment 가 `{user_id}/...` 형식일 때만 접근 → 본인 폴더만.
--
-- production 사용자는 항상 auth.uid() 보유 (Phase G Auth 가동). zero UUID 폴백은
-- auth 미설정 dev/anon 호출 보호용 — 클라이언트가 항상 auth 후 요청 보내면 무관.
--
-- 멱등성: `DROP POLICY IF EXISTS` 패턴이라 여러 번 실행 안전.
-- ============================================================================

DO $$
DECLARE
  buckets text[] := ARRAY['pdfs', 'page-images', 'page-thumbnails'];
  operations text[] := ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
  bucket text;
  op text;
  policy_name text;
  expr text;
BEGIN
  FOREACH bucket IN ARRAY buckets LOOP
    FOREACH op IN ARRAY operations LOOP
      policy_name := format('%s_%s_own',
        replace(bucket, '-', '_'),
        lower(op));
      expr := format(
        'bucket_id = %L AND (storage.foldername(name))[1] = COALESCE(auth.uid()::text, %L)',
        bucket,
        '00000000-0000-0000-0000-000000000000'
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_name);

      IF op = 'INSERT' THEN
        EXECUTE format(
          'CREATE POLICY %I ON storage.objects FOR %s TO anon, authenticated WITH CHECK (%s)',
          policy_name, op, expr
        );
      ELSIF op = 'UPDATE' THEN
        EXECUTE format(
          'CREATE POLICY %I ON storage.objects FOR %s TO anon, authenticated USING (%s) WITH CHECK (%s)',
          policy_name, op, expr, expr
        );
      ELSE
        -- SELECT / DELETE
        EXECUTE format(
          'CREATE POLICY %I ON storage.objects FOR %s TO anon, authenticated USING (%s)',
          policy_name, op, expr
        );
      END IF;

      RAISE NOTICE 'Policy created: %', policy_name;
    END LOOP;
  END LOOP;
END $$;

-- 검증
SELECT 'Storage policies OK. 12 policies (3 buckets × 4 ops) 생성됨.' AS status;

-- ========================== 이용권 스키마 ==========================

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

-- ============================================================================
-- 기존 운영 계정 활성화
-- ----------------------------------------------------------------------------
-- auth.users에 계정이 이미 있으면 profile을 system_admin/active로 맞춘다.
-- 비밀번호나 키는 SQL에 기록하지 않는다.
-- ============================================================================
INSERT INTO public.profiles (id, email, display_name, role, status)
SELECT
  id,
  email,
  COALESCE(
    raw_user_meta_data ->> 'display_name',
    raw_user_meta_data ->> 'name',
    split_part(email, '@', 1)
  ),
  'system_admin'::public.user_role,
  'active'::public.user_status
FROM auth.users
WHERE lower(email) = 'chrismathone@gmail.com'
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
  role = 'system_admin'::public.user_role,
  status = 'active'::public.user_status,
  updated_at = now();

-- ============================================================================
-- 최종 검증: 모든 object_name 행의 relation이 채워져야 한다.
-- ============================================================================
SELECT object_name, relation
FROM (
  VALUES
    ('tests', to_regclass('public.tests')),
    ('pages', to_regclass('public.pages')),
    ('ocr_problems', to_regclass('public.ocr_problems')),
    ('ocr_feedback', to_regclass('public.ocr_feedback')),
    ('profiles', to_regclass('public.profiles')),
    ('content_feedback', to_regclass('public.content_feedback')),
    ('exam_analyses', to_regclass('public.exam_analyses')),
    ('credit_lots', to_regclass('public.credit_lots'))
) AS required_objects(object_name, relation)
ORDER BY object_name;

