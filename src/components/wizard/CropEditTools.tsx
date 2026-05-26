// CropEditTools.tsx (Phase I-5)
//
// Step 1.5 검수 화면의 *도구 선택 UI*. 사용자가 박스를 어떻게 편집할지 모드
// 전환. select 모드에선 박스 클릭/드래그 (이동) + 8-handle (resize), create
// 모드에선 빈 영역 drag 로 새 박스, delete 모드에선 클릭 삭제.

import { Segmented } from "@app/components/ui";

/**
 * 박스 편집 도구 mode.
 *
 * - **select** (기본): 박스 클릭으로 선택 → 드래그 이동 + handle resize.
 * - **create**: 빈 영역 drag 로 새 박스 그림. 마우스 떼면 박스 추가.
 * - **delete**: 박스 클릭으로 즉시 삭제 (confirm 없음 — 실수 시 create 로 재추가).
 */
export type CropTool = "select" | "create" | "delete";

export interface CropEditToolsProps {
  currentTool: CropTool;
  onChangeTool: (next: CropTool) => void;
  /** 현재 페이지의 박스 수 — UI 의 *N 박스* 표시용 (optional). */
  boxCount?: number;
  className?: string;
}

const TOOL_OPTIONS = [
  { value: "select" as const, label: "선택", icon: "cursor" },
  { value: "create" as const, label: "추가", icon: "plus-square" },
  { value: "delete" as const, label: "삭제", icon: "trash" },
];

/**
 * Step 1.5 검수의 우측 도구 패널 (또는 상단 toolbar) 에 박힌 mode selector.
 *
 * 사용 예 — Step1_5CropInspect 안에서:
 * ```tsx
 * const [tool, setTool] = useState<CropTool>("select");
 * <CropEditTools currentTool={tool} onChangeTool={setTool} boxCount={N} />
 * ```
 */
export const CropEditTools = ({
  currentTool,
  onChangeTool,
  boxCount,
  className,
}: CropEditToolsProps) => {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <Segmented<CropTool>
        value={currentTool}
        onChange={onChangeTool}
        options={TOOL_OPTIONS}
        size="sm"
        full
      />
      {boxCount !== undefined && (
        <div className="text-caption text-muted">
          현재 페이지: <span className="font-mono font-semibold text-text">{boxCount}</span>개 박스
        </div>
      )}
      {/* 도구별 짧은 안내 */}
      <p className="text-caption text-muted leading-relaxed">
        {currentTool === "select" && "박스 클릭 → 드래그 이동 / 모서리로 크기 조절"}
        {currentTool === "create" && "빈 영역 드래그 → 새 박스 추가"}
        {currentTool === "delete" && "박스 클릭 → 즉시 삭제"}
      </p>
    </div>
  );
};

export default CropEditTools;
