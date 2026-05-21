import { useEffect, useRef, useState } from "react";
import type { OCRProblem, ProblemReview } from "@app/stores/wizardStore";
import { loadPagesByTest } from "@app/services/api/pages";
import { loadProblemsByTest } from "@app/services/api/problems";
import { loadReviewsByTest } from "@app/services/api/reviews";
import { loadVariantHistory } from "@app/services/api/variantHistory";
import { getSignedUrl } from "@app/services/api/storage";
import {
  ocrProblemRowToWizard,
  reviewRowToWizard,
  type PageRow,
  type VariantHistoryRow,
} from "@app/services/api/mappers";

/**
 * Phase C — Detail view 의 hydration hook.
 *
 * testId 변경 시 4개 query 병렬 실행 + 각 페이지의 hi-res/thumb signed URL 발급.
 * SUPABASE_ENABLED=false 면 모든 service 가 null 반환 → loading=false, data 빈
 * 배열. fallback 없음 (Phase C 는 *Supabase only*).
 *
 * Signed URL TTL = 1시간. 사용자가 그 이상 view 열어두면 image 깨짐 — 후속
 * phase 에서 자동 refresh.
 */

export interface PageWithUrls extends PageRow {
  /** Storage signed URL — hi-res image (페이지 전체 보기 용). */
  imageUrl?: string;
  /** Storage signed URL — thumbnail (PageThumbnails 좌측 사이드바 용). */
  thumbUrl?: string;
}

export interface DetailData {
  pages: PageWithUrls[];
  problems: OCRProblem[];
  /** problems 를 page_id 별로 그룹핑한 map — tabs 가 page-grouped 렌더에 사용. */
  problemsByPage: Map<string, OCRProblem[]>;
  reviews: ProblemReview[];
  history: VariantHistoryRow[];
  loading: boolean;
  error: string | null;
}

const EMPTY: DetailData = {
  pages: [],
  problems: [],
  problemsByPage: new Map(),
  reviews: [],
  history: [],
  loading: false,
  error: null,
};

export const useDetailData = (testId: string | null): DetailData => {
  const [data, setData] = useState<DetailData>(EMPTY);
  // Phase D: latest pages 를 timer 안에서 stale-free 로 읽기 위한 ref.
  const pagesRef = useRef<PageWithUrls[]>([]);
  useEffect(() => {
    pagesRef.current = data.pages;
  }, [data.pages]);

  // Signed URL auto-refresh — 55분 주기 (TTL 60분 보다 5분 앞당김).
  useEffect(() => {
    if (!testId) return;
    const id = setInterval(
      async () => {
        const current = pagesRef.current;
        if (current.length === 0) return;
        try {
          const updated = await Promise.all(
            current.map(async (p) => {
              const [imageUrl, thumbUrl] = await Promise.all([
                p.image_storage_path
                  ? getSignedUrl("page-images", p.image_storage_path, 3600)
                  : Promise.resolve(null),
                p.thumb_storage_path
                  ? getSignedUrl("page-thumbnails", p.thumb_storage_path, 3600)
                  : Promise.resolve(null),
              ]);
              return {
                ...p,
                imageUrl: imageUrl ?? undefined,
                thumbUrl: thumbUrl ?? undefined,
              };
            }),
          );
          setData((d) => ({ ...d, pages: updated }));
        } catch (err) {
          console.warn("[useDetailData] URL refresh failed:", (err as Error).message);
        }
      },
      55 * 60 * 1000,
    );
    return () => clearInterval(id);
  }, [testId]);

  useEffect(() => {
    if (!testId) {
      setData(EMPTY);
      return;
    }
    let cancelled = false;
    setData((d) => ({ ...d, loading: true, error: null }));

    (async () => {
      try {
        const [pageRows, problemRows, reviewRows, historyRows] = await Promise.all([
          loadPagesByTest(testId),
          loadProblemsByTest(testId),
          loadReviewsByTest(testId),
          loadVariantHistory(testId),
        ]);
        if (cancelled) return;
        // Signed URL 발급 — pages 의 image/thumb path 가 있는 경우만.
        const pages: PageWithUrls[] = await Promise.all(
          (pageRows ?? []).map(async (p) => {
            const [imageUrl, thumbUrl] = await Promise.all([
              p.image_storage_path
                ? getSignedUrl("page-images", p.image_storage_path, 3600)
                : Promise.resolve(null),
              p.thumb_storage_path
                ? getSignedUrl("page-thumbnails", p.thumb_storage_path, 3600)
                : Promise.resolve(null),
            ]);
            return {
              ...p,
              imageUrl: imageUrl ?? undefined,
              thumbUrl: thumbUrl ?? undefined,
            };
          }),
        );
        if (cancelled) return;
        const problems = (problemRows ?? []).map(ocrProblemRowToWizard);
        // page_id 별 그룹
        const problemsByPage = new Map<string, OCRProblem[]>();
        const problemPageMap = new Map<string, string>(); // problem id → page id
        (problemRows ?? []).forEach((row, idx) => {
          problemPageMap.set(row.id, row.page_id);
          const arr = problemsByPage.get(row.page_id) ?? [];
          arr.push(problems[idx]);
          problemsByPage.set(row.page_id, arr);
        });
        const reviews = (reviewRows ?? []).map(reviewRowToWizard);

        setData({
          pages,
          problems,
          problemsByPage,
          reviews,
          history: historyRows ?? [],
          loading: false,
          error: null,
        });
      } catch (err) {
        if (cancelled) return;
        console.warn("[useDetailData]", err);
        setData({
          ...EMPTY,
          loading: false,
          error: (err as Error).message ?? "데이터 로드 실패",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [testId]);

  return data;
};
