import { Icon } from "@app/components/ui";

/**
 * Step 5 미리보기 갤러리 상단의 줌 슬라이더. mathlab `ZoomToolbar.tsx` 의
 * 패턴을 mathg-gen 디자인 토큰으로 재작성.
 *
 * 75% / 100% 자석 효과는 `usePreviewScale` 의 `setScale` 안에서 처리되므로
 * 이 컴포넌트는 단순 input range + 100% 토글 + 핏-투-컨테이너 버튼만 노출.
 */
export interface ZoomToolbarProps {
  scale: number;
  scalePercent: number;
  onScaleFromSlider: (value: number) => void;
  onSetScale: (scale: number) => void;
  onFitToContainer: () => void;
  /** "5 페이지 (2단)" 같은 좌측 정보 표시. */
  leftContent?: React.ReactNode;
  className?: string;
}

export const ZoomToolbar = ({
  scale,
  scalePercent,
  onScaleFromSlider,
  onSetScale,
  onFitToContainer,
  leftContent,
  className,
}: ZoomToolbarProps) => {
  const minSlider = 30;
  const maxSlider = 120;
  const range = maxSlider - minSlider;
  const fillPercent = ((scale * 100 - minSlider) / range) * 100;

  return (
    <div
      className={`shrink-0 px-4 py-2 border-b border-line bg-surface flex items-center gap-3 ${className ?? ""}`}
    >
      {leftContent && (
        <div className="text-small text-muted whitespace-nowrap">{leftContent}</div>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Icon name="magnifying-glass-minus" size={14} color="#9CA3AF" />
        <input
          type="range"
          min={minSlider}
          max={maxSlider}
          step={5}
          value={scalePercent}
          onChange={(e) => onScaleFromSlider(Number(e.target.value))}
          className="w-32 h-1 cursor-pointer accent-accent"
          style={{
            background: `linear-gradient(to right, var(--color-accent, #0EA5E9) 0%, var(--color-accent, #0EA5E9) ${fillPercent}%, #e2e8f0 ${fillPercent}%, #e2e8f0 100%)`,
          }}
          aria-label="미리보기 줌"
        />
        <Icon name="magnifying-glass-plus" size={14} color="#9CA3AF" />
        <button
          type="button"
          onClick={() => onSetScale(1.0)}
          className={`px-2 py-0.5 rounded-r1 text-caption font-bold transition-colors min-w-[44px] text-center ${
            scalePercent === 100
              ? "bg-accent text-white"
              : "bg-surface2 text-text2 hover:bg-surface3"
          }`}
        >
          {scalePercent}%
        </button>
        <button
          type="button"
          onClick={onFitToContainer}
          className="p-1.5 rounded-r1 hover:bg-surface2 text-muted"
          title="화면에 맞춤"
          aria-label="화면에 맞춤"
        >
          <Icon name="arrow-clockwise" size={14} />
        </button>
      </div>
    </div>
  );
};

export default ZoomToolbar;
