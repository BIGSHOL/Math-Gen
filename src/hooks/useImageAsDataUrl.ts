import { useEffect, useState } from "react";

/**
 * 임의 URL (Storage signed URL 등) → base64 dataURL.
 *
 * Detail view 의 OCRItem 이 도형 crop 을 위해 *base64 dataURL* 을 받음 (canvas
 * 의 createImage 가 cross-origin 제약). signed URL 직접 전달하면 canvas
 * tainted 로 toDataURL 실패. → fetch + FileReader.readAsDataURL 로 base64
 * 변환 후 전달.
 *
 * 비용: 페이지당 ~2MB hi-res PNG → ~2.5MB base64. 한 번 fetch 후 메모리 캐시.
 * 활성 페이지 1개만 fetch (DetailScreen 의 activePage 변경 시 hook 재실행).
 *
 * url 이 undefined 면 dataUrl=null. fetch 실패도 null.
 */
export const useImageAsDataUrl = (url: string | undefined): string | null => {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const reader = new FileReader();
        reader.onload = () => {
          if (!cancelled) setDataUrl(reader.result as string);
        };
        reader.onerror = () => {
          if (!cancelled) setDataUrl(null);
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.warn("[useImageAsDataUrl]", (err as Error).message);
        if (!cancelled) setDataUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return dataUrl;
};
