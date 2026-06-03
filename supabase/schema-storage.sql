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
