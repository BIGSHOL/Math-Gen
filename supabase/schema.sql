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
