import { useEffect, type ReactNode } from "react";
import { Backdrop } from "@app/components/ui";
import { cn } from "@app/lib/tailwind";

export interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Optional class merged into the inner card surface. */
  className?: string;
  /** ARIA label for the dialog when there's no visible header. */
  "aria-label"?: string;
  /** ID of an element labeling the dialog (use for visible headers). */
  "aria-labelledby"?: string;
}

/**
 * Reusable modal container. Mirrors the modal layer in hifi/app.jsx +
 * modal.jsx — Backdrop + animated card surface (scale 0.96 → 1 + opacity)
 * + ESC-to-close + body scroll lock while open.
 *
 * Real focus-trap and `inert` siblings are deferred to Phase 5 a11y. For
 * now we hand off `role="dialog"` + `aria-modal` and lean on the backdrop
 * to block pointer events from below.
 */
export const ModalShell = ({
  open,
  onClose,
  children,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: ModalShellProps) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);

    // Lock background scroll while open. Restore previous overflow on close.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Backdrop onClick={onClose} className="p-5">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "bg-surface rounded-r5 shadow-s4 overflow-hidden flex flex-col",
          "animate-modal-enter",
          className,
        )}
      >
        {children}
      </div>
    </Backdrop>
  );
};

export default ModalShell;
