import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@app/lib/tailwind";
import type { WizardStepIndex } from "@app/stores/wizardStore";

export interface StepFrameProps {
  step: WizardStepIndex;
  children: ReactNode;
  className?: string;
}

/**
 * Wraps a single wizard step's content and applies a slide-in animation
 * matching the direction of travel:
 *   - forward (step ↑)  → slide-in from the right (`wiz-slide-in-right`)
 *   - backward (step ↓) → slide-in from the left (`wiz-slide-in-left`)
 *
 * The active class is reset between transitions so the keyframe re-fires.
 */
export const StepFrame = ({ step, children, className }: StepFrameProps) => {
  const prev = useRef<WizardStepIndex>(step);
  const [direction, setDirection] = useState<"forward" | "backward" | "initial">("initial");

  useEffect(() => {
    if (prev.current === step) return;
    setDirection(step > prev.current ? "forward" : "backward");
    prev.current = step;
  }, [step]);

  return (
    <div
      key={step}
      className={cn(
        "w-full h-full",
        direction === "forward" && "animate-wiz-slide-in-right",
        direction === "backward" && "animate-wiz-slide-in-left",
        className,
      )}
    >
      {children}
    </div>
  );
};

export default StepFrame;
