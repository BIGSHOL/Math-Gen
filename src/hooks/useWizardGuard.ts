import { useEffect } from "react";

/**
 * Block accidental tab-close while the user has wizard state in flight.
 *
 * The Phase 4 plan calls this out explicitly — 30-문항 변환은 비용이 크기 때문에
 * 새로고침 한 번으로 결과가 날아가면 안 된다.
 *
 * Call from `WizardScreen` with `enabled = step > 0 && step < 4`. We pass
 * `enabled=false` on entry (Step 1) and on completion (Step 5 export) so
 * the user can navigate away cleanly.
 *
 * Note: modern browsers ignore the custom message string entirely and show
 * their own dialog. We still set `returnValue` because some older browsers
 * gate the dialog on that being non-empty.
 */
export const useWizardGuard = (enabled: boolean): void => {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "진행 중인 변환 결과가 손실될 수 있습니다.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [enabled]);
};
