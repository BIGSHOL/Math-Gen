import { useEffect, useState } from "react";
import { Chip, Eyebrow, Icon } from "@app/components/ui";
import {
  usePageThumbnails,
  useRotatedThumbnails,
} from "@app/hooks/usePageThumbnails";
import { modelShortName } from "@app/lib/modelLabel";
import { cn } from "@app/lib/tailwind";
import type { WizardPage } from "@app/stores/wizardStore";

/**
 * Step 2 — left-most 92 px column listing every page as a 64 px paper-style
 * thumbnail. Active page glows accent; skipped pages dim; in-flight pages
 * show a small spinner; failed pages get a warn dot.
 *
 * 썸네일 로드 + 회전 적용은 공유 훅 `usePageThumbnails` / `useRotatedThumbnails`
 * 가 담당. 페이지 회전은 *업로드 단계 미리보기 그리드* 에서만 한다 — 이
 * 컬럼은 회전된 썸네일을 *표시만* (회전 버튼 없음). OCR·해설·변형 이후
 * 회전하면 OCR item id 가 새로 발급돼 problems 가 stale 되기 때문.
 * hi-res `imageRef` 는 NEVER touched here (reviewer note #1).
 */
export interface PageThumbColumnProps {
  pages: WizardPage[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

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
}: PageThumbColumnProps) => {
  const thumbs = usePageThumbnails(pages);
  const rotatedThumbs = useRotatedThumbnails(pages, thumbs);

  // 활성 inflight 가 하나라도 있으면 1 초 tick 활성 — 경과 시간 라이브 업데이트.
  const hasInflight = pages.some(
    (p) => Boolean(p.ocrInflightModel) || Boolean(p.upgrading),
  );
  useInflightTick(hasInflight);

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
                // PDF 자연 페이지 비율은 A4 세로 (≈ 0.71). 업로드 단계에서
                // 90/270° 회전을 적용한 페이지는 카드도 같이 가로형으로 swap
                // 해서 콘텐츠 / 박스 사이에 비대칭이 생기지 않게 한다.
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
