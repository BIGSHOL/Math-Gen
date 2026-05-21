import { Eyebrow } from "@app/components/ui";
import { cn } from "@app/lib/tailwind";

export interface ThumbInfo {
  pageNum: number;
  /** Storage signed URL (Phase C). 없으면 placeholder. */
  url?: string;
}

export interface PageThumbnailsProps {
  pageCount: number;
  activePage: number;
  onSelect: (page: number) => void;
  /** Phase C: page 별 thumbnail signed URL. 길이 < pageCount 면 missing 페이지는 placeholder. */
  thumbs?: ThumbInfo[];
}

/**
 * Left sidebar — vertical scroll of mini page thumbnails (2-col grid).
 *
 * Phase C 이전: faux paper preview.
 * Phase C 이후: thumbs prop 이 있으면 Storage signed URL 의 실제 이미지. URL
 * 미발급/만료 페이지는 fallback 으로 faux preview 유지.
 */
export const PageThumbnails = ({
  pageCount,
  activePage,
  onSelect,
  thumbs,
}: PageThumbnailsProps) => {
  const urlByPage = new Map<number, string>();
  if (thumbs) {
    for (const t of thumbs) {
      if (t.url) urlByPage.set(t.pageNum, t.url);
    }
  }
  return (
    <aside className="w-48 flex-shrink-0 px-3.5 py-5 border-r border-line bg-surface overflow-auto">
      <Eyebrow className="mb-2.5 whitespace-nowrap">페이지 {pageCount}개</Eyebrow>
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => {
          const on = p === activePage;
          const url = urlByPage.get(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => onSelect(p)}
              className={cn(
                "aspect-[3/4] bg-white border-[1.5px] rounded-r1 cursor-pointer relative transition-all duration-[140ms] ease-out overflow-hidden",
                "focus-visible:outline-none",
                on
                  ? "border-accent shadow-accent-glow"
                  : "border-line shadow-s1 hover:border-line-strong",
              )}
              aria-current={on ? "page" : undefined}
            >
              {url ? (
                <img
                  src={url}
                  alt={`Page ${p}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                  loading="lazy"
                  onError={(e) => {
                    // signed URL 만료 등 — placeholder 표시. img 자체는 hide.
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              ) : (
                <FauxPreview pageNum={p} />
              )}
              <span
                className="absolute bottom-1 right-1 px-1 py-0.5 rounded-r1 bg-ink/70 text-white font-mono"
                style={{ fontSize: 9 }}
              >
                {p}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
};

const FauxPreview = ({ pageNum }: { pageNum: number }) => (
  <div className="w-full h-full p-2">
    <div
      className="flex justify-between font-bold text-text"
      style={{
        fontSize: 5.5,
        paddingBottom: 2,
        marginBottom: 4,
        borderBottom: "0.6px solid #1A1D24",
      }}
    >
      <span>수학영역</span>
      <span>{pageNum}</span>
    </div>
    {[1, 2, 3].map((n) => (
      <div key={n} style={{ marginTop: 3 }}>
        <div className="flex items-baseline gap-[1.5px]">
          <span style={{ fontSize: 5, fontWeight: 700 }}>{n}</span>
          <div className="flex-1 bg-surface3 rounded-[1px]" style={{ height: 1.2 }} />
        </div>
        <div
          className="ml-[5px] mt-[1.5px] bg-surface3 rounded-[1px]"
          style={{ height: 1, width: "70%" }}
        />
        {n === 2 && (
          <div
            className="ml-[5px] mt-[1.5px] bg-surface2 rounded-[1px]"
            style={{ height: 8, width: "60%" }}
          />
        )}
      </div>
    ))}
  </div>
);

export default PageThumbnails;
