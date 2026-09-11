import { useEffect, useRef, useState } from "react";
import { isTestchangeId } from '../types/testchange';
import { loadTestchangeExam } from '../services/api/testchange';
import { testchangeToDetail } from '../lib/testchangeAdapter';
import { TESTCHANGE_ENABLED } from '../services/api/testchange';
import { loadLocalWork } from '../services/api/localWork';
import { getPageImage, getThumbnail } from '../lib/imageStore';
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

/**
 * testId 의 pages / problems / reviews / variantHistory 를 Supabase 에서 4-병렬
 * fetch + (옵션) Storage signed URL 발급. `useDetailData` 훅과 "이어서 작업"
 * hydrate (`wizardHydrate.ts`) 가 공유하는 순수 async 함수.
 *
 * withSignedUrls=false 면 signed URL 발급 생략 — 위자드 hydrate 는 이미지가
 * 불필요(재OCR 시점에 lazy 복원)하므로 네트워크를 아낀다.
 */
export const loadDetailData = async (
  testId: string,
  opts: { withSignedUrls?: boolean } = {},
): Promise<DetailData> => {
  if (isTestchangeId(testId)) return testchangeToDetail(await loadTestchangeExam(testId));
  if (TESTCHANGE_ENABLED) {
    const work = await loadLocalWork(testId);
    if (!work?.snapshot) return EMPTY;
    const snapshot = work.snapshot;
    const pages = await Promise.all(snapshot.pages.map(async (p, i): Promise<PageWithUrls> => {
      const [image, thumb] = await Promise.all([
        p.imageRef ? getPageImage(p.imageRef) : null,
        p.thumbRef ? getThumbnail(p.thumbRef) : null,
      ]);
      return { id: p.id, test_id: testId, page_num: i + 1, rotation: p.rotation,
        text_layer: p.textLayer, is_problem_page: p.isProblemPage, force_ocr: false,
        image_storage_path: null, thumb_storage_path: null, ocr_complete: p.ocrComplete,
        ocr_model: p.ocrModel ?? null, ocr_error: p.ocrError ?? null,
        crop_boxes: p.cropBoxes ?? [], crop_inspected: p.cropInspected ?? true,
        created_at: work.test.createdAt ?? '', imageUrl: image?.dataUrl, thumbUrl: thumb?.dataUrl };
    }));
    return { pages, problems: snapshot.pages.flatMap(p => p.ocrResult),
      problemsByPage: new Map(snapshot.pages.map(p => [p.id, p.ocrResult])),
      reviews: snapshot.problems, history: [], loading: false, error: null };
  }
  const withSignedUrls = opts.withSignedUrls ?? true;
  const [pageRows, problemRows, reviewRows, historyRows] = await Promise.all([
    loadPagesByTest(testId),
    loadProblemsByTest(testId),
    loadReviewsByTest(testId),
    loadVariantHistory(testId),
  ]);
  const pages: PageWithUrls[] = withSignedUrls
    ? await Promise.all(
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
      )
    : (pageRows ?? []);
  const problems = (problemRows ?? []).map(ocrProblemRowToWizard);
  // page_id 별 그룹 — tabs 가 page-grouped 렌더에 사용.
  const problemsByPage = new Map<string, OCRProblem[]>();
  (problemRows ?? []).forEach((row, idx) => {
    const arr = problemsByPage.get(row.page_id) ?? [];
    arr.push(problems[idx]);
    problemsByPage.set(row.page_id, arr);
  });
  const reviews = (reviewRows ?? []).map(reviewRowToWizard);
  return {
    pages,
    problems,
    problemsByPage,
    reviews,
    history: historyRows ?? [],
    loading: false,
    error: null,
  };
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
        const result = await loadDetailData(testId, { withSignedUrls: true });
        if (cancelled) return;
        setData(result);
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
