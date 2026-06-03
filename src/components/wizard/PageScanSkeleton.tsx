/**
 * 원본 스캔 로딩 스켈레톤 — 페이지 전환 시 이미지가 디코드/복원되는 동안
 * (IndexedDB 빠름, Storage fallback 느림) stale 이미지 대신 표시. 실제 시험지
 * 처럼 2 단 텍스트 블록을 shimmer 로 흉내내 "곧 페이지가 뜬다" 를 인지시킴.
 *
 * Step2OCRReview (원본 스캔) · Step1_5CropInspect (검수) 가 공유 — 페이지 로딩
 * 시점에 일관된 스켈레톤 (사용자 보고 2026-06-04).
 */
const PAGE_SKELETON_WIDTHS = [92, 78, 85, 60, 0, 88, 70, 82, 55, 0, 90, 66, 74];

export const PageScanSkeleton = ({ className = "" }: { className?: string }) => (
  <div
    className={`w-full animate-pulse ${className}`}
    aria-label="페이지 불러오는 중"
    role="status"
  >
    <div className="h-2.5 rounded bg-surface3 w-1/4 mb-6" />
    <div className="grid grid-cols-2 gap-6">
      {[0, 1].map((col) => (
        <div key={col} className="space-y-3">
          {PAGE_SKELETON_WIDTHS.map((w, i) =>
            w === 0 ? (
              <div key={i} className="h-5" />
            ) : (
              <div key={i} className="h-3 rounded bg-surface3" style={{ width: `${w}%` }} />
            ),
          )}
        </div>
      ))}
    </div>
  </div>
);

export default PageScanSkeleton;
