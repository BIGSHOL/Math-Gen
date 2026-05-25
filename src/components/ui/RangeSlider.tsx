import { useEffect, useRef } from "react";

/**
 * 마우스 따라가는 native range slider — **uncontrolled** + rAF throttle.
 *
 * **함정 (1차 시도 — controlled state)**: `value={localValue}` + `setLocalValue`
 * 패턴은 매 mousemove 마다 React re-render 를 트리거. 부모 컴포넌트의
 * onChange 가 *무거운 미리보기 reflow* 를 일으키면 그 cycle 이 main thread 를
 * 막아서 React 가 thumb 을 *원래 위치로 늦게 적용* → 사용자 손가락보다 thumb 가
 * 명백히 뒤처짐. 사용자 보고: "마우스보다 늦게 움직임. 전혀 일치하지 않음."
 *
 * **해결 (2차 — uncontrolled)**:
 *   - `defaultValue` + `inputRef` — React 가 thumb 위치 *전혀 강제 안 함*.
 *     브라우저가 native 속도로 thumb 를 그림 (마우스 100% 추적).
 *   - `useEffect` 가 외부 value 변경 시에만 *직접 DOM 값 set* — 드래그 중엔 skip.
 *   - rAF throttle 은 *부모 onChange* 만 — store update / 미리보기 reflow 가
 *     frame 당 최대 1회. 부모 re-render 가 무거워도 thumb 는 영향 안 받음.
 *
 * **외부 value 변경 추적**: localValue state 없으니 inputRef.current.value 를
 * useEffect 에서 직접 sync. 드래그 중이 아닐 때만 (드래그 중 외부 set 충돌 방지).
 *
 * 사용 위치: PrintOptionsPanel (세로 여백) 등.
 */

export interface RangeSliderProps {
  value: number;
  onChange: (v: number) => void;
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

  const commitThrottled = (v: number) => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      onChange(v);
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
        // 마지막 값 final commit — rAF 중 pending 일 수 있으니 즉시 처리.
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        const el = inputRef.current;
        if (el) onChange(Number(el.value));
      }}
      onChange={(e) => {
        commitThrottled(Number((e.target as HTMLInputElement).value));
      }}
      className={className}
      aria-label={ariaLabel}
    />
  );
};
