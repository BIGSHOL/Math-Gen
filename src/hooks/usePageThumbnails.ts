import { useEffect, useState } from "react";
import { getThumbnail } from "@app/lib/imageStore";
import { applyRotation } from "@app/lib/pdfProcessor";
import type { WizardPage } from "@app/stores/wizardStore";

/**
 * 페이지 썸네일 로드 + 회전 적용 — 위자드 공유 훅.
 *
 * `PageThumbColumn` (위자드 사이드 컬럼) 과 `Step1Upload` (업로드 미리보기
 * 그리드) 가 공유한다. 둘 다 회전이 적용된 썸네일을 표시해야 하고, 같은
 * 무한 re-render cascade 함정을 피해야 하므로 한 곳에 둔다.
 */

/**
 * 페이지 썸네일을 IndexedDB 에서 한 번에 읽어 `thumbRef → dataURL` Map 으로
 * 캐시한다. 카드마다 개별 fetch 하면 렌더마다 N round-trip — 그걸 피한다.
 *
 * dep 은 `pages` 배열이 아니라 *thumbRef 들의 문자열 키* — zustand 가 OCR
 * 갱신마다 새 pages 배열 reference 를 emit 하므로, pages 를 직접 dep 으로
 * 쓰면 OCR 진행 중 매 틱마다 IndexedDB 를 재조회하게 된다.
 */
export const usePageThumbnails = (pages: WizardPage[]): Map<string, string> => {
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());

  const thumbRefsKey = pages.map((p) => p.thumbRef ?? "").join("|");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = new Map<string, string>();
      for (const page of pages) {
        if (!page.thumbRef) continue;
        const t = await getThumbnail(page.thumbRef);
        if (t) next.set(page.thumbRef, t.dataUrl);
      }
      if (!cancelled) setThumbs(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thumbRefsKey]);

  return thumbs;
};

/**
 * 회전된 썸네일 dataURL 을 미리 만들어 `<img>` 가 `src` 만 쓰게 한다 —
 * CSS `transform: rotate(...)` 는 박스 layout 을 회전 전 비율로 남겨
 * "안의 내용물만 세로로" footgun 을 일으킨다.
 *
 * 캐시 키는 `thumbRef@rotation`. 원본 (rotation === 0) 은 skip — 호출 측이
 * `thumbs.get(thumbRef)` 로 직접 접근.
 *
 * dep 은 `(page,rotation,thumbRef)` triple 의 문자열 signature — zustand 가
 * OCR 갱신마다 새 pages 배열을 emit 하므로 pages 를 직접 dep 으로 쓰면
 * 한 OCR 런 동안 effect 가 수십 번 재발화 → 매번 setState(new Map()) →
 * re-render → 재발화 의 silent cascade (이전 버그). string 키는 thumbnail
 * 이 실제로 새 ref id 나 다른 rotation 을 가질 때만 바뀐다.
 */
export const useRotatedThumbnails = (
  pages: WizardPage[],
  thumbs: Map<string, string>,
): Map<string, string> => {
  const [rotated, setRotated] = useState<Map<string, string>>(new Map());

  const sig = pages.map((p) => `${p.id}:${p.thumbRef}:${p.rotation}`).join("|");
  const thumbKeys = Array.from(thumbs.keys()).sort().join("|");

  useEffect(() => {
    // 회전 적용된 페이지가 하나도 없으면 setState 자체를 안 한다 — 빈
    // Map → 빈 Map 으로 re-set 하면 reference 비교에서 항상 "변경됨" 으로
    // 판정돼 무한 re-render 가 생긴다 (이전 버그).
    const rotatedPages = pages.filter((p) => p.rotation !== 0);
    if (rotatedPages.length === 0) {
      if (rotated.size !== 0) setRotated(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const next = new Map<string, string>();
      for (const page of rotatedPages) {
        const orig = thumbs.get(page.thumbRef);
        if (!orig) continue;
        try {
          const r = await applyRotation(orig, page.rotation);
          if (cancelled) return;
          next.set(`${page.thumbRef}@${page.rotation}`, r);
        } catch {
          // Best-effort — fall back to non-rotated original at render time.
        }
      }
      if (cancelled) return;
      // 내용 equality 체크 — 같은 keys/values 면 setState skip 해서
      // 상위 re-render cascade 안 트리거.
      let same = next.size === rotated.size;
      if (same) {
        for (const [k, v] of next) {
          if (rotated.get(k) !== v) {
            same = false;
            break;
          }
        }
      }
      if (!same) setRotated(next);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, thumbKeys]);

  return rotated;
};
