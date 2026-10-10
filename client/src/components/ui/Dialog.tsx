"use client";

// Dialog: a modal (centred; a bottom sheet on phones) or a side sheet (full-screen on
// phones). Focus, Tab trapping, Escape and scroll locking come from useModalBehavior.
// NOTE: onClose may be a guard (e.g. "discard unsaved changes?") — the dialog never
// closes itself; the parent decides by flipping `open`.
import { useId, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "@/lib/cx";
import { useModalBehavior } from "@/hooks/useModalBehavior";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  variant?: "center" | "sheet";
  size?: "sm" | "md" | "lg";
  initialFocusRef?: RefObject<HTMLElement | null>;
  // Extra controls rendered next to the close button.
  headerActions?: ReactNode;
  // "alertdialog" for confirmations that interrupt.
  role?: "dialog" | "alertdialog";
}

const SIZES = { sm: "sm:max-w-md", md: "sm:max-w-xl", lg: "sm:max-w-2xl" };

export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "center",
  size = "md",
  initialFocusRef,
  headerActions,
  role = "dialog",
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const onCloseRef = useModalBehavior(open, panelRef, onClose, initialFocusRef);

  if (!open || typeof document === "undefined") return null;

  const isSheet = variant === "sheet";

  return createPortal(
    <div className={cx("fixed inset-0 z-50 flex", isSheet ? "justify-end" : "items-end justify-center sm:items-center sm:p-4")}>
      <div aria-hidden="true" className="absolute inset-0 animate-fade-in bg-forest-deep/45" onClick={() => onCloseRef.current()} />
      <div
        ref={panelRef}
        data-modal-panel
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx(
          "relative flex flex-col bg-surface shadow-lg outline-none",
          isSheet
            ? "h-full w-full animate-fade-in sm:max-w-[640px] sm:border-l sm:border-line"
            : cx("max-h-[92dvh] w-full animate-rise-in rounded-t-[14px] sm:rounded-[14px]", SIZES[size])
        )}
      >
        <header className="flex items-start gap-3 border-b border-line-soft px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1 pt-1">
            <h2 id={titleId} className="text-lg font-semibold leading-snug text-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-[14px] leading-relaxed text-muted">
                {description}
              </p>
            )}
          </div>
          {headerActions}
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="Close"
            className="-mr-2 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-[10px] text-muted hover:bg-surface-muted hover:text-ink"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
        {footer && (
          <footer className="flex flex-col-reverse gap-2 border-t border-line-soft px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</footer>
        )}
      </div>
    </div>,
    document.body
  );
}
