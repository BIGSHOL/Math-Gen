import { supabase, SUPABASE_ENABLED, currentUserId } from "./supabase";

/**
 * Supabase Storage 추상화 — 3 buckets (`pdfs` / `page-images` / `page-thumbnails`).
 *
 * 경로 규칙:
 *   - pdfs:            `{user_id}/{testId}.pdf`                (단일 파일)
 *   - page-images:     `{user_id}/{testId}/{pageNum}.png`      (폴더)
 *   - page-thumbnails: `{user_id}/{testId}/{pageNum}.jpg`      (폴더)
 *
 * RLS 정책 (대시보드 설정): `(storage.foldername(name))[1] = COALESCE(auth.uid()::text, DEV_USER_ID)`
 * → 본인 폴더만 접근.
 *
 * 모든 함수는 throw 하지 않고 null/void 반환 — 호출 측이 fallback (IndexedDB) 으로
 * 우회 가능. SUPABASE_ENABLED=false 면 모든 함수 early return.
 */

export type BucketName = "pdfs" | "page-images" | "page-thumbnails";

const PDF_BUCKET: BucketName = "pdfs";
const IMAGE_BUCKET: BucketName = "page-images";
const THUMB_BUCKET: BucketName = "page-thumbnails";

/**
 * `data:image/png;base64,...` → `Blob`. atob 으로 base64 → Uint8Array → Blob.
 * 큰 페이지 (~2MB) 의 경우 동기 atob 이 ~200ms 정도 — 충분히 빠름.
 */
const dataUrlToBlob = (dataUrl: string): Blob => {
  const commaIdx = dataUrl.indexOf(",");
  const meta = commaIdx >= 0 ? dataUrl.slice(0, commaIdx) : "";
  const b64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
  const mimeMatch = /:([^;]+);/.exec(meta);
  const mime = mimeMatch?.[1] ?? "application/octet-stream";
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

/**
 * PDF 원본 업로드. Step 1 onFile 의 background 호출.
 * 성공 시 storage path, 실패 시 null. IndexedDB pdfBlobs 와 dual-write.
 */
export const uploadPdf = async (testId: string, file: File): Promise<string | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const userId = await currentUserId();
  const path = `${userId}/${testId}.pdf`;
  const { error } = await supabase.storage.from(PDF_BUCKET).upload(path, file, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) {
    console.warn("[api/storage] uploadPdf failed:", error.message);
    return null;
  }
  return path;
};

/**
 * 페이지 hi-res image (PNG) 업로드. Step 1 페이지 loop 의 background.
 * IndexedDB pageImages 와 dual-write — Storage 실패해도 IndexedDB 로 OCR 진행.
 */
export const uploadPageImage = async (
  testId: string,
  pageNum: number,
  dataUrl: string,
): Promise<string | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const userId = await currentUserId();
  const path = `${userId}/${testId}/${pageNum}.png`;
  const blob = dataUrlToBlob(dataUrl);
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, {
    contentType: blob.type || "image/png",
    upsert: true,
  });
  if (error) {
    console.warn("[api/storage] uploadPageImage failed:", error.message);
    return null;
  }
  return path;
};

/**
 * 페이지 thumbnail (JPEG) 업로드.
 */
export const uploadPageThumbnail = async (
  testId: string,
  pageNum: number,
  dataUrl: string,
): Promise<string | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const userId = await currentUserId();
  const path = `${userId}/${testId}/${pageNum}.jpg`;
  const blob = dataUrlToBlob(dataUrl);
  const { error } = await supabase.storage.from(THUMB_BUCKET).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: true,
  });
  if (error) {
    console.warn("[api/storage] uploadPageThumbnail failed:", error.message);
    return null;
  }
  return path;
};

/**
 * Signed URL — Phase C detail/preview 가 SRC 로 사용. TTL 기본 1시간.
 */
export const getSignedUrl = async (
  bucket: BucketName,
  path: string,
  ttlSec = 3600,
): Promise<string | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, ttlSec);
  if (error) {
    console.warn(`[api/storage] getSignedUrl ${bucket}/${path} failed:`, error.message);
    return null;
  }
  return data.signedUrl;
};

/**
 * 시험지 삭제 시 호출 — 3 buckets 의 해당 testId 파일 일괄 제거.
 * - pdfs: 단일 파일 `{userId}/{testId}.pdf`
 * - page-images / page-thumbnails: 폴더 `{userId}/{testId}/` 내 전체 파일
 */
export const removeTestFolder = async (testId: string): Promise<void> => {
  if (!SUPABASE_ENABLED || !supabase) return;
  const userId = await currentUserId();
  const client = supabase;
  await Promise.all([
    // PDF — 단일 파일
    (async () => {
      const { error } = await client.storage.from(PDF_BUCKET).remove([`${userId}/${testId}.pdf`]);
      if (error) console.warn("[api/storage] removeTestFolder pdf failed:", error.message);
    })(),
    // page-images / page-thumbnails — list 후 batch remove
    ...[IMAGE_BUCKET, THUMB_BUCKET].map(async (bucket) => {
      const prefix = `${userId}/${testId}`;
      const { data, error } = await client.storage.from(bucket).list(prefix);
      if (error) {
        console.warn(`[api/storage] removeTestFolder list ${bucket} failed:`, error.message);
        return;
      }
      if (!data || data.length === 0) return;
      const paths = data.map((f) => `${prefix}/${f.name}`);
      const { error: rmErr } = await client.storage.from(bucket).remove(paths);
      if (rmErr) console.warn(`[api/storage] removeTestFolder remove ${bucket} failed:`, rmErr.message);
    }),
  ]);
};
