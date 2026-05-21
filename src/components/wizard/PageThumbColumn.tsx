import { useEffect, useState } from "react";
import { Chip, Eyebrow, Icon } from "@app/components/ui";
import { getThumbnail } from "@app/lib/imageStore";
import { modelShortName } from "@app/lib/modelLabel";
import { applyRotation } from "@app/lib/pdfProcessor";
import { cn } from "@app/lib/tailwind";
import { useWizardStore, type WizardPage } from "@app/stores/wizardStore";

/**
 * Step 2 — left-most 92 px column listing every page as a 64 px paper-style
 * thumbnail. Active page glows accent; skipped pages dim; in-flight pages
 * show a small spinner; failed pages get a warn dot.
 *
 * Thumbnails are loaded once via a single IndexedDB pass and cached in a
 * Map keyed by `thumbRef`. Each card looks up its blob from that map — we
 * deliberately don't fetch per-card to avoid N round-trips on every render.
 * The hi-res `imageRef` is NEVER touched here (reviewer note #1).
 */
export interface PageThumbColumnProps {
  pages: WizardPage[];
  activeIndex: number;
  onSelect: (index: number) => void;
  /**
   * 회전 버튼 클릭 시 호출 — usePageOcr 의 dispatched 마커를 비워서
   * 새 회전 방향으로 OCR 재시작이 가능하게 한다. 안 넘기면 회전은 되지만
   * dispatched.has(id)===true 가 남아 OCR 이 영원히 안 돌게 된다.
   */
  onResetDispatch?: (pageId: string) => void;
}

const usePageThumbnails = (pages: WizardPage[]): Map<string, string> => {
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());

  // Like `useRotatedThumbnails`, depend on the stable set of thumbRefs —
  // not the `pages` array itself. Zustand makes a new pages array on every
  // OCR update, which would otherwise re-fire this effect and re-read all
  // thumbnails from IndexedDB on every keystroke of OCR progress.
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
 * Pre-render rotated thumbnail dataURLs so the `<img>` can use `src` only —
 * no CSS `transform: rotate(...)` which leaves the surrounding box layout
 * unchanged (visual content rotates but the box stays landscape, the
 * exact "안의 내용물만 세로로" footgun the user reported).
 *
 * Cache key is `thumbRef@rotation`. Originals (rotation === 0) skip — the
 * caller can reach them directly via `thumbs.get(thumbRef)`.
 *
 * Memory: rotated dataURLs are kept until the page set changes. Each
 * rotated thumbnail is small (low-res JPEG ~5 KB) so 20 pages × 3
 * rotations is still under 1 MB.
 */
const useRotatedThumbnails = (
  pages: WizardPage[],
  thumbs: Map<string, string>,
): Map<string, string> => {
  const [rotated, setRotated] = useState<Map<string, string>>(new Map());

  // Stable identity-string for the (page,rotation,thumbRef) triple set —
  // becomes the effect dep instead of `pages` / `thumbs` themselves.
  // Zustand emits a NEW `pages` array reference on every store update
  // (every OCR `setPageOCR` call), so listing `pages` directly would
  // re-fire this effect dozens of times during a single OCR run. Each
  // re-fire setState(new Map()) → another render → another re-fire — a
  // silent cascade that also tied up the main thread enough to stall
  // IndexedDB callbacks in `usePageOcr`. The string key only changes when
  // a thumbnail actually gets a new ref id or a different rotation, which
  // is the real signal for re-rendering rotated bitmaps.
  const sig = pages
    .map((p) => `${p.id}:${p.thumbRef}:${p.rotation}`)
    .join("|");
  // Membership test against thumb keys — separate piece of the dep string.
  const thumbKeys = Array.from(thumbs.keys()).sort().join("|");

  useEffect(() => {
    // 회전 적용된 페이지가 하나도 없으면 setState 자체를 안 한다 — 빈
    // Map → 빈 Map 으로 re-set 하면 reference 비교에서 항상 "변경됨"으로
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

/**
 * 1 초 tick — inflight 페이지의 경과 시간 표시를 매 초 갱신하기 위한 가벼운
 * re-render trigger. 활성 inflight 가 하나라도 있을 때만 작동 — 없으면
 * setInterval 정리해서 idle CPU 비용 zero.
 */
const useInflightTick = (hasInflight: boolean): number => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!hasInflight) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasInflight]);
  return tick;
};

const formatElapsed = (startedAt: number | undefined): string => {
  if (!startedAt) return "";
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m${s.toString().padStart(2, "0")}s`;
};

export const PageThumbColumn = ({
  pages,
  activeIndex,
  onSelect,
  onResetDispatch,
}: PageThumbColumnProps) => {
  const thumbs = usePageThumbnails(pages);
  const rotatedThumbs = useRotatedThumbnails(pages, thumbs);
  const setPageRotation = useWizardStore((s) => s.setPageRotation);

  // 활성 inflight 가 하나라도 있으면 1 초 tick 활성 — 경과 시간 라이브 업데이트.
  const hasInflight = pages.some(
    (p) => Boolean(p.ocrInflightModel) || Boolean(p.upgrading),
  );
  useInflightTick(hasInflight);

  const rotateClockwise = (page: WizardPage) => {
    const next = ((page.rotation + 90) % 360) as WizardPage["rotation"];
    // ⚠ 순서 중요: dispatched 마커 먼저 비우고, 그 다음 store reset.
    //   reset 직후 effect 가 곧 돌 텐데 dispatched 가 남아있으면 skip 됨.
    onResetDispatch?.(page.id);
    setPageRotation(page.id, next);
  };

  return (
    <div className="w-[92px] flex-shrink-0 flex flex-col gap-2">
      <Eyebrow className="mb-1">페이지</Eyebrow>
      <div className="flex flex-col gap-2 overflow-auto pr-1">
        {pages.map((page, idx) => {
          const isActive = idx === activeIndex;
          const isSkipped = !page.isProblemPage && !page.forceOcr;
          const isPending = !page.ocrComplete && (page.isProblemPage || page.forceOcr);
          const isUpgrading = Boolean(page.upgrading);
          const hasError = Boolean(page.ocrError);
          const originalThumb = thumbs.get(page.thumbRef);
          // Display thumbnail: rotated dataURL if available, else the
          // original (which is in flight of being rotated, or rotation=0).
          const thumb =
            page.rotation === 0
              ? originalThumb
              : rotatedThumbs.get(`${page.thumbRef}@${page.rotation}`) ?? originalThumb;
          const inflight = page.ocrInflightModel;

          return (
            <button
              key={page.id}
              type="button"
              onClick={() => onSelect(idx)}
              aria-current={isActive}
              aria-label={`페이지 ${idx + 1}`}
              className={cn(
                "relative w-full rounded-r1 bg-white text-left p-1.5 transition-all duration-[140ms] overflow-hidden",
                "border-[1.5px] focus:outline-none focus-visible:shadow-accent-glow",
                isActive
                  ? "border-accent shadow-accent-glow"
                  : hasError
                  ? "border-warn"
                  : "border-line hover:border-line-strong shadow-s1",
                isSkipped && "opacity-55",
              )}
              style={{
                // PDF 자연 페이지 비율은 A4 세로 (≈ 0.71). 사용자가 90/270°
                // 회전을 적용한 페이지는 카드도 같이 가로형으로 swap 해서
                // 콘텐츠 / 박스 사이에 비대칭이 생기지 않게 한다.
                // (rotation 0 인데 가로 카드, 또는 회전 90 인데 세로 카드
                //  같은 footgun 을 막음.)
                aspectRatio:
                  page.rotation === 90 || page.rotation === 270 ? "7 / 5" : "5 / 7",
              }}
            >
              {thumb ? (
                // 회전 적용된 dataURL 을 통째로 src 에 박는다 — `transform: rotate`
                // 만 쓰면 박스 layout 이 안 변해서 콘텐츠만 회전되고 외곽이 가로
                // 그대로 남는 footgun 이 생긴다 (사용자 보고). useRotatedThumbnails
                // 가 회전된 dataURL 을 미리 만들어두므로 여기서는 단순 src 교체로
                // 충분.
                <img
                  src={thumb}
                  alt=""
                  className="w-full h-full object-cover rounded-[2px] pointer-events-none"
                />
              ) : (
                <div className="w-full h-full bg-surface2 rounded-[2px] animate-pulse" />
              )}

              {/* 회전 버튼 — top-left, 클릭 시 90° 시계 방향 순환. */}
              <span
                role="button"
                tabIndex={0}
                aria-label="페이지 90도 시계방향 회전"
                title="페이지 90도 회전"
                onClick={(e) => {
                  e.stopPropagation();
                  rotateClockwise(page);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    rotateClockwise(page);
                  }
                }}
                className="absolute top-1 left-1 w-4 h-4 rounded-full bg-white/85 hover:bg-accent-soft grid place-items-center text-muted hover:text-accent cursor-pointer"
              >
                <Icon name="arrow-clockwise" size={9} weight="bold" />
              </span>

              {/* page number — bottom-right monospace */}
              <span className="absolute bottom-1 right-1.5 text-[8px] font-mono font-semibold text-muted bg-white/85 rounded-sm px-1 leading-none py-[1px]">
                p.{idx + 1}
              </span>

              {/* 진행 중 모델 + 경과 시간 — bottom-left (production 포함). 사용자가
                  어떤 모델이 얼마나 오래 처리 중인지 직관적으로 확인 가능. */}
              {inflight && (
                <span
                  className="absolute bottom-1 left-1 px-1 rounded-sm bg-accent text-white font-mono leading-none py-[1px] flex items-center gap-1"
                  style={{ fontSize: 8 }}
                  title={`${inflight} 처리 중 (${formatElapsed(page.ocrStartedAt)})`}
                >
                  <span>{modelShortName(inflight)}</span>
                  {page.ocrStartedAt && (
                    <span className="opacity-80">·{formatElapsed(page.ocrStartedAt)}</span>
                  )}
                </span>
              )}

              {/* status overlays */}
              {isPending && inflight && (
                <span className="absolute top-1 right-1 grid place-items-center text-accent">
                  <Icon name="circle-notch" size={10} weight="bold" className="animate-spin" />
                </span>
              )}
              {/* 대기 중 — 큐 슬롯 차서 시작 못 함. inflight 없는 pending. */}
              {isPending && !inflight && (
                <span
                  className="absolute top-1 right-1 grid place-items-center text-muted"
                  title="대기 중 (다른 페이지 처리 후 시작)"
                >
                  <Icon name="hourglass-medium" size={10} weight="duotone" />
                </span>
              )}
              {isUpgrading && !isPending && (
                <span
                  className="absolute top-1 right-1 grid place-items-center text-accent"
                  title="정밀 분석 중 (도형 페이지)"
                >
                  <Icon name="sparkle" size={10} weight="fill" className="animate-pulse" />
                </span>
              )}
              {hasError && (
                <span className="absolute top-1 right-1 grid place-items-center text-warn">
                  <Icon name="warning" size={10} weight="fill" />
                </span>
              )}
              {isSkipped && (
                <Chip
                  tone="neutral"
                  size="sm"
                  className="!absolute top-1 right-5 !px-1 !py-0 !text-[9px] !leading-tight"
                >
                  스킵
                </Chip>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default PageThumbColumn;
