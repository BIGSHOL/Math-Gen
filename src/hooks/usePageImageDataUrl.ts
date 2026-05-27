// usePageImageDataUrl.ts (Phase I-8)
//
// 페이지 이미지의 dataUrl 을 *비동기* 로 로드하는 공용 hook.
//
// 로딩 경로 (3 layer):
//   1. IndexedDB (`getPageImage(imageRef)`) — 같은 device + recent dev.
//   2. Supabase Storage fallback (`ensurePageImage` via `getPageStoragePath`)
//      — 다른 device / 시크릿 모드 / "이어서 작업" hydrate 시점.
//   3. 둘 다 miss → null 반환 (caller 가 placeholder/empty state 표시).
//
// 옵션:
//   - `rotate: boolean` (default true) — `applyRotation(dataUrl, page.rotation)`
//     적용. preview / OCR 호출 시 true, raw 이미지 필요 시 false.
//
// **무한 루프 방지** (CLAUDE.md §3-6): page 객체 자체를 dep 으로 두면 zustand
// 가 새 reference 반환할 때마다 effect 재실행. 안전을 위해 *page.id +
// page.imageRef + page.rotation* 만 dep — 같은 페이지의 다른 무관한 필드
// 변경 (cropDetectInflight 등) 에는 영향 없음.

import { useEffect, useState } from "react";

import { ensurePageImage } from "@app/lib/imageRestore";
import { getPageImage } from "@app/lib/imageStore";
import { applyRotation } from "@app/lib/pdfProcessor";
import { getPageStoragePath } from "@app/services/api/wizardHydrate";
import type { WizardPage } from "@app/stores/wizardStore";

export interface UsePageImageDataUrlOptions {
  /** `applyRotation` 적용 여부. 기본 true. */
  rotate?: boolean;
}

export const usePageImageDataUrl = (
  page: WizardPage | undefined,
  opts: UsePageImageDataUrlOptions = {},
): string | null => {
  const { rotate = true } = opts;
  const [url, setUrl] = useState<string | null>(null);

  // page 자체가 아닌 *원자적 필드만 dep* — zustand reference churn 방어.
  const pageId = page?.id;
  const imageRef = page?.imageRef;
  const rotation = page?.rotation ?? 0;

  useEffect(() => {
    if (!page) {
      setUrl(null);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        // 1. IndexedDB lookup
        let dataUrl: string | null = null;
        const existing = await getPageImage(page.imageRef);
        if (existing) {
          dataUrl = existing.dataUrl;
        } else {
          // 2. Storage fallback
          const storagePath = getPageStoragePath(page.id);
          const restored = await ensurePageImage(page, storagePath);
          dataUrl = restored?.dataUrl ?? null;
        }

        if (cancelled) return;
        if (!dataUrl) {
          setUrl(null);
          return;
        }

        // 3. 회전 적용 (옵션)
        const final = rotate && rotation !== 0
          ? await applyRotation(dataUrl, rotation)
          : dataUrl;
        if (!cancelled) setUrl(final);
      } catch (err) {
        if (cancelled) return;
        setUrl(null);
        if (import.meta.env?.DEV) {
          // eslint-disable-next-line no-console
          console.warn(
            `[usePageImageDataUrl] page ${pageId}:`,
            (err as Error).message,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // page 객체 dep 대신 *원자 필드* — reference 변경에 둔감.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, imageRef, rotation, rotate]);

  return url;
};

export default usePageImageDataUrl;
