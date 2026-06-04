import { supabase, SUPABASE_ENABLED, currentUserId } from "./supabase";
import { compressForStorage, estimateDataUrlBytes } from "@app/lib/imagePreprocess";
import { showToast } from "@app/stores/toastStore";

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

/**
 * page-images 버킷의 파일 크기 한도 (bytes). **Supabase 대시보드 버킷 설정과
 * 동기화** (현재 10MB). 초과하는 페이지는 업로드 전 JPEG 압축으로 fit (silent
 * 400 "exceeded maximum allowed size" 회피 — 사용자 보고 2026-06-04).
 */
const STORAGE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Storage 업로드 에러 메시지 → *사용자가 이해할 구체적 원인*. 두루뭉술한 "저장
 * 실패" 대신 용량/권한/네트워크/공간 등 정확한 사유 (사용자 요청 2026-06-04).
 * 분류 안 되면 원문 일부를 그대로 노출 — 절대 vague 하지 않게.
 */
const classifyUploadError = (msg: string | undefined): string => {
  const m = (msg ?? "").toLowerCase();
  if (/exceeded the maximum allowed size|payload too large|413|entity too large|too large/.test(m))
    return "용량 한도 초과 (페이지 이미지가 버킷 한도보다 큼)";
  if (/403|unauthorized|not authorized|permission|row-level|rls|policy|jwt|token/.test(m))
    return "권한 오류 (로그인 세션 만료 가능 — 재로그인 후 다시 시도)";
  if (/quota|storage.*full|exceeded.*quota|insufficient_storage|507/.test(m))
    return "저장 공간 부족 (Supabase 용량 한도 초과)";
  if (/network|failed to fetch|load failed|timeout|timed out|50[234]|gateway|econn|aborted/.test(m))
    return "네트워크 오류 (연결 불안정 — 잠시 후 다시 시도)";
  const raw = (msg ?? "알 수 없는 오류").trim().slice(0, 80);
  return `오류: ${raw}`;
};

/**
 * 페이지 이미지 클라우드 저장 실패를 *원인 + 페이지 번호* 와 함께 사용자에게 알림
 * (silent failure 방지 — 사용자 요청 2026-06-04). 페이지 loop 의 다중 실패는
 * 900ms debounce 로 모아 *토스트 1개* 에 페이지 목록 + 사유 표시 (스팸 방지).
 * dual-write 라 로컬(IndexedDB)은 정상이므로 *경고(warn)* 수준 — 작업은 계속 진행.
 */
let pendingUploadFailures: Array<{ pageNum: number; reason: string }> = [];
let uploadFailFlushTimer: ReturnType<typeof setTimeout> | null = null;

const surfacePageImageUploadFailure = (pageNum: number, errorMessage?: string): void => {
  pendingUploadFailures.push({ pageNum, reason: classifyUploadError(errorMessage) });
  if (uploadFailFlushTimer) clearTimeout(uploadFailFlushTimer);
  uploadFailFlushTimer = setTimeout(() => {
    const failures = pendingUploadFailures;
    pendingUploadFailures = [];
    uploadFailFlushTimer = null;
    if (failures.length === 0) return;
    const pages = failures.map((f) => f.pageNum).sort((a, b) => a - b);
    const reasons = Array.from(new Set(failures.map((f) => f.reason)));
    const pageText =
      pages.length === 1 ? `${pages[0]}페이지` : `${pages.length}개 페이지 (${pages.join(", ")})`;
    showToast({
      kind: "warn",
      message: `${pageText} 이미지 클라우드 저장 실패 — ${reasons.join(" / ")}. 다른 기기·‘이어서 작업’ 에서 해당 페이지가 안 보일 수 있어요.`,
      durationMs: 8000,
    });
  }, 900);
};
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

  // 사전 크기 체크 — 버킷 한도 초과 페이지만 JPEG 압축 (정상 크기는 PNG 원본
  // 그대로 = 품질 손실 0). 무손실 PNG 스캔본이 한도 초과 시 silent 400 으로
  // 클라우드 사본이 통째로 누락되던 함정 (사용자 보고 2026-06-04) 방지.
  let uploadUrl = dataUrl;
  let ext = "png";
  let fallbackContentType = "image/png";
  if (estimateDataUrlBytes(dataUrl) > STORAGE_IMAGE_MAX_BYTES) {
    try {
      uploadUrl = await compressForStorage(dataUrl, {
        maxBytes: Math.floor(STORAGE_IMAGE_MAX_BYTES * 0.9),
      });
      ext = "jpg";
      fallbackContentType = "image/jpeg";
    } catch (e) {
      console.warn("[api/storage] page image 압축 실패 — 원본으로 시도:", (e as Error).message);
    }
  }

  const path = `${userId}/${testId}/${pageNum}.${ext}`;
  const blob = dataUrlToBlob(uploadUrl);
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, {
    contentType: blob.type || fallbackContentType,
    upsert: true,
  });
  if (error) {
    // 압축까지 했는데도 실패 (한도 매우 작거나 네트워크 등) — silent 금지,
    // 사용자에게 surface. dual-write 라 로컬 OCR 진행은 영향 없음.
    console.warn("[api/storage] uploadPageImage failed:", error.message);
    surfacePageImageUploadFailure(pageNum, error.message);
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
 * ai-crop freeze — *작은* 크롭 PNG 를 `page-images` 버킷에 업로드, path 반환.
 * 경로 `{userId}/{testId}/crop-{ocrProblemId}-{idx}.png` 는 testId 폴더 *직속 파일*
 * 이라 `removeTestFolder` 의 list({userId}/{testId}) 에 잡혀 시험지 삭제 시 자동 정리
 * (ai-gen orphan 개선). 크롭은 수십 KB 라 압축 불필요. upsert:true — box 편집 후 같은
 * 경로 덮어씀. 실패 시 null (caller 가 페이지 재크롭 fallback, dual-source).
 */
export const uploadCropImage = async (
  testId: string,
  ocrProblemId: string,
  idx: number,
  dataUrl: string,
): Promise<string | null> => {
  if (!SUPABASE_ENABLED || !supabase) return null;
  const userId = await currentUserId();
  const path = `${userId}/${testId}/crop-${ocrProblemId}-${idx}.png`;
  const blob = dataUrlToBlob(dataUrl);
  const { error } = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, {
    contentType: blob.type || "image/png",
    upsert: true,
  });
  if (error) {
    console.warn("[api/storage] uploadCropImage failed:", error.message);
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
