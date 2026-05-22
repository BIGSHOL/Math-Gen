import type { WizardPage } from "@app/stores/wizardStore";
import { getPageImage, putPageImage, putThumbnail } from "@app/lib/imageStore";
import { getSignedUrl } from "@app/services/api/storage";

/**
 * "이어서 작업" — lazy 페이지 이미지 복원.
 *
 * 저장된 시험지를 위자드로 불러오면 페이지 hi-res 이미지는 Supabase Storage 에만
 * 있고 IndexedDB 는 비어 있다 (`pageRowToWizard` 가 `imageRef` 를 "" 로 둠).
 * 재OCR 시 `usePageOcr` 가 `getPageImage(imageRef)` 로 IndexedDB 에서 이미지를
 * 읽으므로, 그 시점에 이 헬퍼가 Storage → IndexedDB 로 on-demand 복원한다.
 *
 * 해설/옵션/검토 단계는 이미지가 불필요 → hydrate 시점엔 다운로드 0건, 재OCR 이
 * 실제로 일어나는 페이지만 받아 IndexedDB 에 캐시한다.
 */

/** Storage path 끝의 `{pageNum}.png` 에서 페이지 번호 추출. 실패 시 0. */
const pageNumFromPath = (path: string): number => {
  const m = path.match(/(\d+)\.[a-z]+$/i);
  return m ? Number.parseInt(m[1], 10) : 0;
};

/** signed URL → base64 dataURL. `useImageAsDataUrl` 과 동일 패턴 (fetch→FileReader). */
const fetchAsDataUrl = async (url: string): Promise<string | null> => {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error("FileReader 실패"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

/**
 * 페이지 hi-res 이미지를 IndexedDB 에 보장한다.
 * - `page.imageRef` 가 이미 있고 IndexedDB 에 존재하면 그대로 반환.
 * - 없으면 Storage(`page-images`) 에서 받아 `putPageImage` 로 캐시 후 새 ref 반환.
 * - `storagePath` 가 null (업로드 당시 Storage 실패) 이면 null — 그 페이지만
 *   재OCR 불가, 텍스트 작업(해설 등)은 영향 없음.
 */
export const ensurePageImage = async (
  page: WizardPage,
  storagePath: string | null,
): Promise<{ ref: string; dataUrl: string } | null> => {
  if (page.imageRef) {
    const existing = await getPageImage(page.imageRef);
    if (existing) return { ref: page.imageRef, dataUrl: existing.dataUrl };
  }
  if (!storagePath) return null;
  const signedUrl = await getSignedUrl("page-images", storagePath, 3600);
  if (!signedUrl) return null;
  const dataUrl = await fetchAsDataUrl(signedUrl);
  if (!dataUrl) return null;
  const ref = await putPageImage({ pageNum: pageNumFromPath(storagePath), dataUrl });
  return { ref, dataUrl };
};

/**
 * 페이지 썸네일을 Supabase Storage(`page-thumbnails`)에서 받아 IndexedDB 에
 * 저장하고 ref 를 반환. "이어서 작업" hydrate 가 위자드 PageThumbColumn 표시용
 * 으로 호출. 썸네일은 작아서(수십 KB) hydrate 시점에 eager 로 받아도 무방.
 * 실패(경로 null·fetch 실패) 시 null → 그 페이지만 placeholder 표시.
 */
export const restoreThumbnail = async (
  thumbStoragePath: string | null,
): Promise<string | null> => {
  if (!thumbStoragePath) return null;
  const signedUrl = await getSignedUrl("page-thumbnails", thumbStoragePath, 3600);
  if (!signedUrl) return null;
  const dataUrl = await fetchAsDataUrl(signedUrl);
  if (!dataUrl) return null;
  return putThumbnail({ pageNum: pageNumFromPath(thumbStoragePath), dataUrl });
};
