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
-- 인증: dev 단계 anon role 도 dev_user_id 로 접근. Phase E 에 auth.uid() 로 자연 전환.
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
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tests_user_created
  ON tests(user_id, created_at DESC);

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
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (test_id, page_num)
);
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
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
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
-- 7. RLS 정책 (dev anon + production authenticated 양쪽 호환)
-- ----------------------------------------------------------------------------
-- dev 단계: auth.uid() 가 null 이면 anon UUID 와 비교 → 같은 dev row 모두 접근.
-- production: 사용자가 로그인하면 auth.uid() 가 본인 UUID → 본인 row 만.
-- 두 단계가 *같은 정책* — Phase E 에 코드 변경 없이 자연 전환.
-- ============================================================================

ALTER TABLE tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE problem_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE variant_history ENABLE ROW LEVEL SECURITY;

-- ── tests ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS tests_select_own ON tests;
CREATE POLICY tests_select_own ON tests
  FOR SELECT TO anon, authenticated
  USING (user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID));
DROP POLICY IF EXISTS tests_insert_own ON tests;
CREATE POLICY tests_insert_own ON tests
  FOR INSERT TO anon, authenticated
  WITH CHECK (user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID));
DROP POLICY IF EXISTS tests_update_own ON tests;
CREATE POLICY tests_update_own ON tests
  FOR UPDATE TO anon, authenticated
  USING (user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID));
DROP POLICY IF EXISTS tests_delete_own ON tests;
CREATE POLICY tests_delete_own ON tests
  FOR DELETE TO anon, authenticated
  USING (user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID));

-- ── pages: tests FK 통해 user_id 확인 ────────────────────────────────────────
DROP POLICY IF EXISTS pages_all_own ON pages;
CREATE POLICY pages_all_own ON pages
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tests
      WHERE tests.id = pages.test_id
        AND tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tests
      WHERE tests.id = pages.test_id
        AND tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    )
  );

-- ── ocr_problems: pages → tests 조인 ─────────────────────────────────────────
DROP POLICY IF EXISTS ocr_problems_all_own ON ocr_problems;
CREATE POLICY ocr_problems_all_own ON ocr_problems
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM pages
      JOIN tests ON tests.id = pages.test_id
      WHERE pages.id = ocr_problems.page_id
        AND tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM pages
      JOIN tests ON tests.id = pages.test_id
      WHERE pages.id = ocr_problems.page_id
        AND tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    )
  );

-- ── problem_reviews: tests FK 통해 ────────────────────────────────────────────
DROP POLICY IF EXISTS reviews_all_own ON problem_reviews;
CREATE POLICY reviews_all_own ON problem_reviews
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tests
      WHERE tests.id = problem_reviews.test_id
        AND tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tests
      WHERE tests.id = problem_reviews.test_id
        AND tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    )
  );

-- ── variant_history ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS variant_history_all_own ON variant_history;
CREATE POLICY variant_history_all_own ON variant_history
  FOR ALL TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tests
      WHERE tests.id = variant_history.test_id
        AND tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM tests
      WHERE tests.id = variant_history.test_id
        AND tests.user_id = COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID)
    )
  );

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

-- 검증: 다음 query 가 빈 결과 반환하면 schema apply 성공.
SELECT 'Schema apply OK. 다음 단계: Storage 탭에서 3 buckets 생성.' AS status;
