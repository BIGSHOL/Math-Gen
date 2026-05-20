import { Eyebrow } from "@app/components/ui";
import { cn } from "@app/lib/tailwind";

export interface PageThumbnailsProps {
  pageCount: number;
  activePage: number;
  onSelect: (page: number) => void;
}

/**
 * Left sidebar — vertical scroll of mini page thumbnails (2-col grid).
 * The thumbnail content is faux paper preview (no real rendering yet);
 * Phase 4 swaps in actual PDF page renders via `pdfjs-dist`.
 */
export const PageThumbnails = ({ pageCount, activePage, onSelect }: PageThumbnailsProps) => (
  <aside className="w-48 flex-shrink-0 px-3.5 py-5 border-r border-line bg-surface overflow-auto">
    <Eyebrow className="mb-2.5 whitespace-nowrap">페이지 {pageCount}개</Eyebrow>
    <div className="grid grid-cols-2 gap-2">
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((p) => {
        const on = p === activePage;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onSelect(p)}
            className={cn(
              "aspect-[3/4] p-2 bg-white border-[1.5px] rounded-r1 cursor-pointer relative transition-all duration-[140ms] ease-out",
              "focus-visible:outline-none",
              on
                ? "border-accent shadow-accent-glow"
                : "border-line shadow-s1 hover:border-line-strong",
            )}
            aria-current={on ? "page" : undefined}
          >
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
              <span>{p}</span>
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
          </button>
        );
      })}
    </div>
  </aside>
);

export default PageThumbnails;
