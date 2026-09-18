-- testchange Supabase에 mathg-gen 핵심 기능만 추가합니다.
-- 기존 exams/questions 테이블과 데이터는 변경하지 않습니다.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('system_admin', 'tenant_admin', 'teacher');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.user_status AS ENUM ('pending', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text, role public.user_role NOT NULL DEFAULT 'teacher',
  status public.user_status NOT NULL DEFAULT 'pending', tenant_id uuid,
  display_name text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  title text NOT NULL, subject text, grade text, exam_category text,
  problem_count int NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'draft',
  status_text text, tags text[] NOT NULL DEFAULT '{}', topic_distribution jsonb,
  uploaded_file_name text, furthest_step smallint DEFAULT 0, settings jsonb, tenant_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  page_num int NOT NULL, rotation smallint NOT NULL DEFAULT 0, text_layer text,
  is_problem_page boolean NOT NULL DEFAULT true, force_ocr boolean DEFAULT false,
  image_storage_path text, thumb_storage_path text,
  ocr_complete boolean NOT NULL DEFAULT false, ocr_model text, ocr_error text,
  crop_boxes jsonb DEFAULT '[]'::jsonb, crop_inspected boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(test_id,page_num)
);

CREATE TABLE IF NOT EXISTS public.ocr_problems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.pages(id) ON DELETE CASCADE,
  problem_number int NOT NULL, topic text, text text NOT NULL, choices jsonb,
  choices_layout text DEFAULT 'auto', answer text, solution text,
  solution_model text, ocr_model text, solution_warnings jsonb,
  body_missing boolean DEFAULT false, choices_missing boolean DEFAULT false,
  status text NOT NULL DEFAULT 'pending', reviewed boolean NOT NULL DEFAULT false,
  images jsonb, diagram_params jsonb, solution_auto_retried boolean DEFAULT false,
  figures jsonb, blocks jsonb, choice_groups jsonb, sub_questions jsonb,
  score numeric, printed_score text, label_type text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.problem_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  ocr_problem_id uuid REFERENCES public.ocr_problems(id) ON DELETE CASCADE,
  original_problem jsonb NOT NULL, variant_problem jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending', gen_model text, gen_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.variant_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  intensity smallint NOT NULL, count int NOT NULL, label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ocr_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ocr_problem_id uuid NOT NULL REFERENCES public.ocr_problems(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, tenant_id uuid,
  rating text NOT NULL CHECK(rating IN ('like','dislike')),
  reason_codes text[] NOT NULL DEFAULT '{}', reason_text text,
  resolved boolean NOT NULL DEFAULT false, resolved_at timestamptz,
  resolved_by uuid, resolved_note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ocr_problem_id,user_id)
);

CREATE TABLE IF NOT EXISTS public.content_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id uuid, target_kind text NOT NULL, target_id uuid NOT NULL, rating smallint,
  comment text, reason_chips text[] NOT NULL DEFAULT '{}', context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  tenant_id uuid, endpoint text NOT NULL, provider text NOT NULL, model text NOT NULL,
  input_tokens int NOT NULL DEFAULT 0, output_tokens int NOT NULL DEFAULT 0,
  cache_read_tokens int NOT NULL DEFAULT 0, cache_creation_tokens int NOT NULL DEFAULT 0,
  cost_usd numeric(10,6) NOT NULL DEFAULT 0, latency_ms int, error text,
  test_id uuid REFERENCES public.tests(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tests_user_created ON public.tests(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pages_test ON public.pages(test_id,page_num);
CREATE INDEX IF NOT EXISTS idx_problems_page ON public.ocr_problems(page_id,problem_number);
CREATE INDEX IF NOT EXISTS idx_reviews_test ON public.problem_reviews(test_id);
CREATE INDEX IF NOT EXISTS idx_variant_history_test ON public.variant_history(test_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_feedback_test ON public.ocr_feedback(test_id,created_at DESC);

DROP TRIGGER IF EXISTS profiles_touch ON public.profiles;
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS tests_touch ON public.tests;
CREATE TRIGGER tests_touch BEFORE UPDATE ON public.tests
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
DROP TRIGGER IF EXISTS feedback_touch ON public.ocr_feedback;
CREATE TRIGGER feedback_touch BEFORE UPDATE ON public.ocr_feedback
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.is_system_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id=auth.uid() AND role='system_admin' AND status='active')
$$;
CREATE OR REPLACE FUNCTION public.owns_test(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM tests WHERE id=p_id AND user_id=auth.uid()) OR is_system_admin()
$$;
CREATE OR REPLACE FUNCTION public.owns_page(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM pages p JOIN tests t ON t.id=p.test_id WHERE p.id=p_id AND t.user_id=auth.uid()) OR is_system_admin()
$$;
CREATE OR REPLACE FUNCTION public.owns_problem(p_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM ocr_problems o JOIN pages p ON p.id=o.page_id JOIN tests t ON t.id=p.test_id WHERE o.id=p_id AND t.user_id=auth.uid()) OR is_system_admin()
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problem_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variant_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS core_profiles_read ON public.profiles;
CREATE POLICY core_profiles_read ON public.profiles FOR SELECT TO authenticated
USING(id=auth.uid() OR public.is_system_admin());
DROP POLICY IF EXISTS core_profiles_admin_update ON public.profiles;
CREATE POLICY core_profiles_admin_update ON public.profiles FOR UPDATE TO authenticated
USING(public.is_system_admin()) WITH CHECK(public.is_system_admin());
DROP POLICY IF EXISTS core_tests ON public.tests;
CREATE POLICY core_tests ON public.tests FOR ALL TO authenticated
USING(user_id=auth.uid() OR public.is_system_admin())
WITH CHECK(user_id=auth.uid() OR public.is_system_admin());
DROP POLICY IF EXISTS core_pages ON public.pages;
CREATE POLICY core_pages ON public.pages FOR ALL TO authenticated
USING(public.owns_test(test_id)) WITH CHECK(public.owns_test(test_id));
DROP POLICY IF EXISTS core_problems ON public.ocr_problems;
CREATE POLICY core_problems ON public.ocr_problems FOR ALL TO authenticated
USING(public.owns_page(page_id)) WITH CHECK(public.owns_page(page_id));
DROP POLICY IF EXISTS core_reviews ON public.problem_reviews;
CREATE POLICY core_reviews ON public.problem_reviews FOR ALL TO authenticated
USING(public.owns_test(test_id)) WITH CHECK(public.owns_test(test_id));
DROP POLICY IF EXISTS core_variants ON public.variant_history;
CREATE POLICY core_variants ON public.variant_history FOR ALL TO authenticated
USING(public.owns_test(test_id)) WITH CHECK(public.owns_test(test_id));
DROP POLICY IF EXISTS core_ocr_feedback ON public.ocr_feedback;
CREATE POLICY core_ocr_feedback ON public.ocr_feedback FOR ALL TO authenticated
USING(public.owns_problem(ocr_problem_id))
WITH CHECK(public.owns_problem(ocr_problem_id) AND user_id=auth.uid());
DROP POLICY IF EXISTS core_content_feedback ON public.content_feedback;
CREATE POLICY core_content_feedback ON public.content_feedback FOR ALL TO authenticated
USING(user_id=auth.uid() OR public.is_system_admin())
WITH CHECK(user_id=auth.uid());
DROP POLICY IF EXISTS core_ai_usage_read ON public.ai_usage;
CREATE POLICY core_ai_usage_read ON public.ai_usage FOR SELECT TO authenticated
USING(user_id=auth.uid() OR public.is_system_admin());

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN INSERT INTO profiles(id,email) VALUES(NEW.id,NEW.email) ON CONFLICT(id) DO NOTHING; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
INSERT INTO public.profiles(id,email) SELECT id,email FROM auth.users ON CONFLICT(id) DO NOTHING;
UPDATE public.profiles SET role='system_admin',status='active'
WHERE lower(email)='chrismathone@gmail.com';

INSERT INTO storage.buckets(id,name,"public",file_size_limit,allowed_mime_types)
VALUES('pdfs','pdfs',false,52428800,ARRAY['application/pdf']::text[])
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,"public"=EXCLUDED."public",
file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets(id,name,"public",file_size_limit,allowed_mime_types)
VALUES('page-images','page-images',false,10485760,ARRAY['image/png','image/jpeg']::text[])
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,"public"=EXCLUDED."public",
file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets(id,name,"public",file_size_limit,allowed_mime_types)
VALUES('page-thumbnails','page-thumbnails',false,512000,ARRAY['image/jpeg']::text[])
ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,"public"=EXCLUDED."public",
file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS mathgen_storage_own ON storage.objects;
CREATE POLICY mathgen_storage_own ON storage.objects FOR ALL TO authenticated
USING(bucket_id IN ('pdfs','page-images','page-thumbnails') AND (storage.foldername(name))[1]=auth.uid()::text)
WITH CHECK(bucket_id IN ('pdfs','page-images','page-thumbnails') AND (storage.foldername(name))[1]=auth.uid()::text);

SELECT name, to_regclass('public.'||name) AS relation FROM (VALUES
('profiles'),('tests'),('pages'),('ocr_problems'),('problem_reviews'),
('variant_history'),('ocr_feedback'),('content_feedback'),('ai_usage')) AS v(name);
