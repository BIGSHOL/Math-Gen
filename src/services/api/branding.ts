import { supabase, currentUserId } from "./supabase";

/**
 * Phase 2 — 학원 로고 (branding-assets) Storage util.
 *
 * Bucket: `branding-assets` (public)
 * Path 규약: `{user_id}/logo.{ext}` — 사용자당 1 로고 (덮어쓰기 가능)
 *
 * 단일 사용자 1 로고. 새 업로드 시 *이전 파일 덮어쓰기* (`upsert: true`).
 * Supabase Storage public bucket 이라 SELECT 는 익명 fetch 가능 — public URL
 * 그대로 인쇄 시 사용. signed URL 의 만료 race 회피.
 *
 * 사용자 액션 흐름:
 *   1. PrintOptionsPanel 의 file input → `uploadLogo(file)` 호출
 *   2. client-side canvas resize (max 600x600) → PNG 또는 JPEG blob
 *   3. Supabase Storage upload → public URL 반환
 *   4. caller (PrintOptionsPanel) 가 URL 을 localStorage `mathgen_print_branding`
 *      에 저장 + UI 미리보기 갱신
 *   5. PrintableHeader 에 prop drill → 4 variants 의 로고 자리 표시
 */

/** Max image dimension after client-side resize (px). */
const MAX_DIM = 600;

/** Allowed MIME types — PNG/JPEG only (SVG XSS 위험). */
const ALLOWED_MIMES = ["image/png", "image/jpeg"];

/**
 * File 을 client-side canvas resize → Blob 반환. 원본보다 작으면 그대로 통과.
 * resize 비용은 *수십 ms* — 사용자 인지 X.
 */
const resizeImage = async (file: File): Promise<Blob> => {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("이미지 로드 실패"));
    i.src = URL.createObjectURL(file);
  });
  const ratio = Math.min(MAX_DIM / img.width, MAX_DIM / img.height, 1);
  const w = Math.round(img.width * ratio);
  const h = Math.round(img.height * ratio);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context 생성 실패");
  ctx.drawImage(img, 0, 0, w, h);
  URL.revokeObjectURL(img.src);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Blob 변환 실패"));
        else resolve(blob);
      },
      file.type, // 원본 MIME 유지 (PNG/JPEG)
      0.92, // JPEG quality (PNG 은 무시됨)
    );
  });
};

/**
 * 로고 업로드 → public URL 반환.
 * @throws SUPABASE_ENABLED=false 또는 MIME 불일치 또는 Storage 오류 시.
 */
export const uploadLogo = async (file: File): Promise<string> => {
  if (!supabase) throw new Error("Supabase 비활성 — 로고 업로드 불가");
  if (!ALLOWED_MIMES.includes(file.type)) {
    throw new Error(`지원 형식: PNG 또는 JPEG 만 가능 (현재: ${file.type})`);
  }
  const userId = await currentUserId();
  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `${userId}/logo.${ext}`;
  const resized = await resizeImage(file);
  const { error: uploadErr } = await supabase.storage
    .from("branding-assets")
    .upload(path, resized, {
      upsert: true, // 이전 로고 덮어쓰기
      contentType: file.type,
      cacheControl: "3600",
    });
  if (uploadErr) throw new Error(`업로드 실패: ${uploadErr.message}`);
  const { data: urlData } = supabase.storage
    .from("branding-assets")
    .getPublicUrl(path);
  // Cache busting — 같은 URL 의 이전 파일이 브라우저 캐시되어 새 로고 안 보이는 경우 방지.
  return `${urlData.publicUrl}?t=${Date.now()}`;
};

/**
 * 현재 사용자의 로고 삭제. PNG / JPEG 모두 시도 (이전 업로드 형식 모를 때 대비).
 */
export const deleteLogo = async (): Promise<void> => {
  if (!supabase) return;
  const userId = await currentUserId();
  const paths = [`${userId}/logo.png`, `${userId}/logo.jpg`];
  await supabase.storage.from("branding-assets").remove(paths);
};
