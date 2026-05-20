import { useEffect, useState } from "react";
import { Chip, Eyebrow, Icon } from "@app/components/ui";
import { getThumbnail } from "@app/lib/imageStore";
import { cn } from "@app/lib/tailwind";
import { useWizardStore, type WizardPage } from "@app/stores/wizardStore";

/**
 * DEV-only short label for a model id — keeps the thumbnail badge to ~6 px
 * of width. Returns just the model name's distinctive token. Maintained as
 * a switch so unknown models fall back to their full id (truncated).
 */
const modelShortName = (model: string): string => {
  switch (model) {
    case "gemini-3-flash-preview":
      return "G3F";
    case "gemini-3.5-flash":
      return "G3.5F";
    case "gemini-3.1-pro-preview":
      return "G3.1P";
    case "gemini-3.1-flash-lite":
      return "G3.1FL";
    case "gemini-2.5-flash":
      return "G2.5F";
    case "gemini-2.5-pro":
      return "G2.5P";
    case "gpt-5.5":
      return "GPT5.5";
    case "gpt-5.5-pro":
      return "GPT5.5P";
    case "gpt-5":
      return "GPT5";
    case "claude-sonnet-4-6":
      return "Sonnet";
    case "claude-opus-4-7":
      return "Opus";
    case "claude-haiku-4-5":
      return "Haiku";
    default:
      return model.length > 8 ? `${model.slice(0, 7)}…` : model;
  }
};

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
  }, [pages]);

  return thumbs;
};

export const PageThumbColumn = ({
  pages,
  activeIndex,
  onSelect,
  onResetDispatch,
}: PageThumbColumnProps) => {
  const thumbs = usePageThumbnails(pages);
  const setPageRotation = useWizardStore((s) => s.setPageRotation);

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
          const thumb = thumbs.get(page.thumbRef);
          const inflight = page.ocrInflightModel;

          return (
            <button
              key={page.id}
              type="button"
              onClick={() => onSelect(idx)}
              aria-current={isActive}
              aria-label={`페이지 ${idx + 1}`}
              className={cn(
                "relative h-16 rounded-r1 bg-white text-left p-1.5 transition-all duration-[140ms]",
                "border-[1.5px] focus:outline-none focus-visible:shadow-accent-glow",
                isActive
                  ? "border-accent shadow-accent-glow"
                  : hasError
                  ? "border-warn"
                  : "border-line hover:border-line-strong shadow-s1",
                isSkipped && "opacity-55",
              )}
            >
              {thumb ? (
                <img
                  src={thumb}
                  alt=""
                  className="w-full h-full object-cover rounded-[2px] pointer-events-none"
                  // 썸네일은 IndexedDB 의 원본을 그대로 두고 CSS transform 으로만
                  // 정방향 미리보기. 실제 OCR 호출 시점에 usePageOcr 가
                  // applyRotation 으로 정방향 dataURL 만들어서 모델에 보냄.
                  style={
                    page.rotation === 0
                      ? undefined
                      : { transform: `rotate(${page.rotation}deg)` }
                  }
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

              {/* DEV: 진행 중 모델 짧은 배지 — bottom-left */}
              {import.meta.env.DEV && inflight && (
                <span
                  className="absolute bottom-1 left-1 px-1 rounded-sm bg-accent text-white font-mono leading-none py-[1px]"
                  style={{ fontSize: 8 }}
                  title={`${inflight} 처리 중`}
                >
                  {modelShortName(inflight)}
                </span>
              )}

              {/* status overlays */}
              {isPending && (
                <span className="absolute top-1 right-1 grid place-items-center text-accent">
                  <Icon name="circle-notch" size={10} weight="bold" className="animate-spin" />
                </span>
              )}
              {isUpgrading && !isPending && (
                <span
                  className="absolute top-1 right-1 grid place-items-center text-accent"
                  title="정밀 분석 중"
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
