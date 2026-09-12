import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const supabaseDir = path.join(repoRoot, "supabase");

const readSql = (name) => readFile(path.join(supabaseDir, name), "utf8");

const [adminSchema, coreSchema, storagePolicies, creditsSchema] = await Promise.all([
  readSql("schema-admin.sql"),
  readSql("schema.sql"),
  readSql("schema-storage.sql"),
  readSql("schema-credits.sql"),
]);

const prelude = String.raw`-- ============================================================================
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
  ON public.tests(user_id, created_at DESC);`;

const storageBuckets = String.raw`-- ============================================================================
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
  allowed_mime_types = EXCLUDED.allowed_mime_types;`;

const ownerActivation = String.raw`-- ============================================================================
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
  updated_at = now();`;

const verification = String.raw`-- ============================================================================
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
ORDER BY object_name;`;

const output = [
  `-- mathg-gen -> testchange Supabase 전체 설치본
-- 대상 프로젝트: pqylrbowrfliicxzurex
-- Supabase Dashboard > SQL Editor > New query에 이 파일 전체를 붙여 넣고 Run 하세요.
-- 기존 testchange 테이블(exams, questions 등)은 삭제하거나 변경하지 않습니다.
-- 이 스크립트는 재실행할 수 있도록 멱등 형태로 구성했습니다.`,
  prelude,
  "-- ======================== 관리자/권한 스키마 ========================",
  adminSchema.trim(),
  "-- =========================== 본 스키마 =============================",
  coreSchema.trim(),
  storageBuckets,
  "-- ========================= Storage 정책 ============================",
  storagePolicies.trim(),
  "-- ========================== 이용권 스키마 ==========================",
  creditsSchema.trim(),
  ownerActivation,
  verification,
  "",
].join("\n\n");

await writeFile(path.join(supabaseDir, "bootstrap-testchange.sql"), output, "utf8");
console.log(`Wrote supabase/bootstrap-testchange.sql (${output.length} chars)`);
