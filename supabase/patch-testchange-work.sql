-- 편집본을 브라우저(IndexedDB) 대신 DB 에만 저장하도록 전환하면서 필요한 컬럼.
-- patch-testchange-core.sql 적용 이후 실행. 기존 exams/questions 는 건드리지 않는다.
-- 멱등 — 여러 번 실행해도 안전.

-- 소수 배점(2.2점 등) 저장. 기존 정수 값은 그대로 보존된다.
ALTER TABLE public.ocr_problems ALTER COLUMN score TYPE numeric USING score::numeric;
-- 원본 배점 표기 ("2.2").
ALTER TABLE public.ocr_problems ADD COLUMN IF NOT EXISTS printed_score text;
-- 위자드 설정 (변환 목표·인쇄 옵션·내보내기 설정) — "이어서 작업" 시 복원.
ALTER TABLE public.tests ADD COLUMN IF NOT EXISTS settings jsonb;

-- PostgREST 스키마 캐시 갱신 (새 컬럼 즉시 인식).
NOTIFY pgrst, 'reload schema';

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'ocr_problems' AND column_name IN ('score', 'printed_score'))
    OR (table_name = 'tests' AND column_name = 'settings'))
ORDER BY table_name, column_name;
