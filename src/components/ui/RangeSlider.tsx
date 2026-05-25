import { useEffect, useRef } from "react";

/**
 * 마우스 따라가는 native range slider — **uncontrolled** + commit-on-release.
 *
 * **함정 진화사 (3 단계)**:
 *
 * 1차 (controlled state): `value={localValue}` + `setLocalValue` 패턴. 매
 * mousemove 마다 React re-render → 부모 onChange 가 무거우면 thumb 가 늦게
 * 적용. → 마우스보다 느림 보고.
 *
 * 2차 (uncontrolled + rAF onChange): `defaultValue` + ref + rAF throttle 로
 * 부모 onChange 호출을 frame 당 1회로 제한. React 는 thumb 그리기 loop 에서
 * 빠짐. *그런데 부모 onChange 자체가 ~500ms reflow* 면 main thread 가 그
 * 동안 통째 점유 → rAF 도 pointermove 도 안 firing → thumb 결국 멈춤.
 * → 0.5초 늦음 보고.
 *
 * 3차 (commit-on-release + onPreview): drag 중엔 부모 onChange *전혀 호출
 * 안 함*. 무거운 미리보기 reflow 가 안 일어나므로 main thread 가 free →
 * thumb 가 마우스 100% 추적. release (pointerUp) 시에만 onChange 1회 호출
 * → store update + 미리보기 reflow 1회. 숫자 라벨 같은 *가벼운 visual update*
 * 는 `onPreview` 콜백으로 frame 당 1회 전달 (옵션).
 *
 * **외부 value 변경 추적**: useEffect 가 inputRef.current.value 를 직접 sync.
 * 드래그 중엔 skip — 사용자 드래그 위치를 외부 변경이 덮어쓰지 않도록.
 *
 * 사용 위치: PrintOptionsPanel (세로 여백) 등.
 */

export interface RangeSliderProps {
  value: number;
  /** **drag 종료 시 (pointerUp) 1회 호출**. 무거운 store update / reflow 권장. */
  onChange: (v: number) => void;
  /**
   * drag 중 rAF throttle 로 호출 (옵션). 가벼운 local state update 만 — 숫자
   * 라벨, fill bar 등. 무거운 작업 넣으면 thumb 가 다시 느려짐.
   *
   * 미제공 시 drag 중 부모 시각 update 없음 (thumb 만 native 로 움직임).
   */
  onPreview?: (v: number) => void;
  min: number;
  max: number;
  /** 픽셀당 jump 크기. 부드러움 위해 *1 권장*. 큰 step 일수록 끊김. */
  step?: number;
  className?: string;
  /** Accessibility. */
  "aria-label"?: string;
}

export const RangeSlider = ({
  value,
  onChange,
  onPreview,
  min,
  max,
  step = 1,
  className,
  "aria-label": ariaLabel,
}: RangeSliderProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const draggingRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  // 외부 value 변경 동기화 — 드래그 중이 아닐 때만 DOM 값 직접 set.
  // (controlled 가 아니라 uncontrolled — React 가 thumb 위치를 강제하지 않음)
  useEffect(() => {
    if (draggingRef.current) return;
    const el = inputRef.current;
    if (el && Number(el.value) !== value) {
      el.value = String(value);
    }
  }, [value]);

  // cleanup — unmount 시 pending rAF 취소.
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // drag 중 *가벼운* preview update 만 (rAF throttle). 무거운 onChange 는
  // pointerUp 시 final commit.
  const previewThrottled = (v: number) => {
    if (!onPreview) return;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      onPreview(v);
      rafRef.current = null;
    });
  };

  return (
    <input
      ref={inputRef}
      type="range"
      min={min}
      max={max}
      step={step}
      defaultValue={value}
      onPointerDown={() => {
        draggingRef.current = true;
      }}
      onPointerUp={() => {
        draggingRef.current = false;
        // pending preview rAF 취소 + 최종 값 commit.
        if (rafRef.current !== null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        const el = inputRef.current;
        if (el) onChange(Number(el.value));
      }}
      onChange={(e) => {
        // drag 중엔 onChange (부모 store) 안 부름 — preview 만.
        // 키보드 화살표 등 *non-drag* 입력은 onPointerUp 안 거치니 즉시 commit.
        const v = Number((e.target as HTMLInputElement).value);
        if (draggingRef.current) {
          previewThrottled(v);
        } else {
          onChange(v);
        }
      }}
      className={className}
      aria-label={ariaLabel}
    />
  );
};
