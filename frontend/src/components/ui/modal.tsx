"use client";

import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import clsx from "clsx";

/**
 * Unified Modal / Sheet component.
 *
 * - Desktop: centered dialog with overlay
 * - Mobile (< 640px): bottom sheet that slides up
 *
 * This replaces the inline `DemoModal` defined in /orders/page.tsx
 * and any other ad-hoc modal patterns.
 *
 * Usage:
 *   <Modal title="Оплата" onClose={close} actions={<Button>Оплатить</Button>}>
 *     ...content...
 *   </Modal>
 */

type ModalProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  /** Max width class for the dialog (desktop only) — default sm:max-w-[440px] */
  maxWidthClass?: string;
  /** Extra classes for the root sheet element */
  sheetClassName?: string;
  /** Extra classes for the header row */
  headerClassName?: string;
  /** Extra classes for the body scroll zone */
  bodyClassName?: string;
  /** Extra classes for the footer actions zone */
  actionsClassName?: string;
  /** If true, clicking the backdrop does not close the modal */
  disableBackdropClose?: boolean;
};

export function Modal({
  title,
  children,
  onClose,
  actions,
  maxWidthClass = "sm:max-w-[440px]",
  sheetClassName,
  headerClassName,
  bodyClassName,
  actionsClassName,
  disableBackdropClose = false,
}: ModalProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const content = (
    <div
      className="fixed inset-0 z-50 overflow-x-hidden bg-slate-900/30"
      onClick={(e) => {
        if (!disableBackdropClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex min-h-full items-end justify-center px-2 pb-[max(12px,env(safe-area-inset-bottom))] pt-4 sm:items-center sm:px-4 sm:py-6">
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          className={clsx(
            // Layout
            "flex flex-col min-w-0 w-full max-w-none",
            // Height limits
            "max-h-[92dvh] sm:max-h-[calc(100vh-3rem)]",
            // Border & background
            "border border-[color:var(--border)] bg-white",
            // Corners: rounded top on mobile (sheet), standard on desktop
            "rounded-t-[14px] border-b-0 sm:rounded-lg sm:border-b",
            // Overflow
            "overflow-hidden",
            // Desktop max-width
            maxWidthClass,
            sheetClassName,
          )}
        >
          {/* Header */}
          <div
            className={clsx(
              "flex shrink-0 items-center justify-between",
              "border-b border-[color:var(--border)] px-4 py-3",
              headerClassName,
            )}
          >
            <h2
              id="modal-title"
              className="text-[15px] font-semibold text-[color:var(--foreground)] truncate pr-2"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[color:var(--muted)] transition-colors hover:bg-[#f1f3f8] hover:text-[color:var(--foreground)]"
              aria-label="Закрыть"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body — scrollable */}
          <div
            className={clsx(
              "min-h-0 flex-1 overflow-y-auto overflow-x-hidden",
              "px-4 py-4 text-[14px] text-[color:var(--foreground)]",
              bodyClassName,
            )}
          >
            {children}
          </div>

          {/* Footer actions */}
          {actions ? (
            <div
              className={clsx(
                "shrink-0 flex flex-col-reverse gap-2",
                "border-t border-[color:var(--border)] px-4 py-3",
                "sm:flex-row sm:items-center sm:justify-end",
                actionsClassName,
              )}
            >
              {actions}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  // Render into a portal to avoid stacking context issues
  if (typeof window === "undefined") return null;
  return createPortal(content, document.body);
}
