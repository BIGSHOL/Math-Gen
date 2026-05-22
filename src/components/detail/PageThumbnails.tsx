import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
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

// ── 패널 너비 — 우측 핸들 드래그로 조절, localStorage 유지 ──────────────────────
const MIN_W = 120; // 1 열
const MAX_W = 420; // 4 열
const DEFAULT_W = 192; // 기존 w-48 (= 2 열)
const STORAGE_KEY = "mathgen-pagethumb-width";

const clampW = (n: number): number => Math.min(MAX_W, Math.max(MIN_W, n));

/**
 * 패널 너비 → 썸네일 열 수 (1~4).
 * px-3.5 양쪽 패딩(28px)을 빼고 열당 약 88px 기준. 너비를 넓힐수록 1→2→3→4 열.
 * 경계: <160 → 1열, <248 → 2열, <336 → 3열, 그 이상 → 4열.
 */
const colsForWidth = (w: number): number =>
  Math.min(4, Math.max(1, Math.round((w - 28) / 88)));

const readStoredWidth = (): number => {
  if (typeof window === "undefined") return DEFAULT_W;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_W;
  return Number.isFinite(n) ? clampW(n) : DEFAULT_W;
};

const persistWidth = (w: number): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(w));
  } catch {
    /* localStorage 비활성 / 할당 초과 — 무시 */
  }
};

/**
 * Left sidebar — vertical scroll of mini page thumbnails.
 *
 * 너비는 우측 경계선(드래그 핸들)을 잡아당겨 조절 — 너비에 따라 썸네일 그리드
 * 가 1~4 열로 자동 반영된다. 더블클릭 시 기본 너비로 복귀, 키보드 ←/→ 도 지원.
 * 너비는 localStorage 에 저장돼 새로고침 후에도 유지.
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
  const [width, setWidth] = useState<number>(readStoredWidth);
  const asideRef = useRef<HTMLElement>(null);
  // 드래그 상태 — 리렌더 불필요해서 ref. grabOffset 으로 핸들 잡은 지점 보정.
  const drag = useRef<{ active: boolean; grabOffset: number }>({
    active: false,
    grabOffset: 0,
  });

  // 드래그 도중 unmount 시 body 스타일 복구 (안전망).
  useEffect(
    () => () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    },
    [],
  );

  const asideLeft = (): number =>
    asideRef.current?.getBoundingClientRect().left ?? 0;

  const onPointerDown = (e: PointerEvent<HTMLDivElement>): void => {
    drag.current = {
      active: true,
      grabOffset: e.clientX - (asideLeft() + width),
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* active pointer 없는 엣지 케이스(일부 브라우저/합성 이벤트)에서 throw —
         캡처 없이도 drag ref 로 동작하므로 무시. */
    }
    e.preventDefault();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>): void => {
    if (!drag.current.active) return;
    setWidth(clampW(e.clientX - asideLeft() - drag.current.grabOffset));
  };

  const endDrag = (e: PointerEvent<HTMLDivElement>): void => {
    if (!drag.current.active) return;
    drag.current.active = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    setWidth((w) => {
      persistWidth(w);
      return w;
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setWidth((w) => {
      const next = clampW(w + (e.key === "ArrowRight" ? 24 : -24));
      persistWidth(next);
      return next;
    });
  };

  const resetWidth = (): void => {
    setWidth(DEFAULT_W);
    persistWidth(DEFAULT_W);
  };

  const cols = colsForWidth(width);

  const urlByPage = new Map<number, string>();
  if (thumbs) {
    for (const t of thumbs) {
      if (t.url) urlByPage.set(t.pageNum, t.url);
    }
  }

  return (
    <aside
      ref={asideRef}
      className="relative flex flex-col flex-shrink-0 border-r border-line bg-surface"
      style={{ width }}
    >
      <div className="flex-1 min-h-0 overflow-auto px-3.5 py-5">
        <Eyebrow className="mb-2.5 whitespace-nowrap">페이지 {pageCount}개</Eyebrow>
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
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
      </div>

      {/* 우측 경계선 = 드래그 핸들. 잡아당겨 너비 조절 → 그리드 1~4 열 자동 반영.
          더블클릭 시 기본 너비로 복귀. 키보드 ←/→ 지원. */}
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="페이지 목록 너비 조절 (드래그 또는 ←/→, 더블클릭 시 기본값)"
        aria-valuenow={width}
        aria-valuemin={MIN_W}
        aria-valuemax={MAX_W}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
        onDoubleClick={resetWidth}
        title="드래그해서 페이지 목록 너비 조절 (더블클릭: 기본값)"
        className="group absolute inset-y-0 right-0 z-10 w-2.5 translate-x-1/2 cursor-col-resize select-none touch-none focus-visible:outline-none"
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-[2px] bg-transparent transition-colors group-hover:bg-accent group-focus-visible:bg-accent" />
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
