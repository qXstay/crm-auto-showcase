import type { ReactNode } from "react";
import clsx from "clsx";

/**
 * PageHeader — consistent title + actions bar used on every screen.
 * Eliminates the visual misalignment between /shift, /clients, /orders/list, etc.
 *
 * Usage:
 *   <PageHeader
 *     title="Смена"
 *     subtitle="Текущая смена — 16 апреля"
 *     actions={<Button>Закрыть смену</Button>}
 *   />
 *
 *   // With back button:
 *   <PageHeader title="Заказ #123" backHref="/orders/list" />
 */

type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  backHref?: string;
  className?: string;
  compact?: boolean;
};

export function PageHeader({
  title,
  subtitle,
  actions,
  meta,
  className,
  compact = false,
}: PageHeaderProps) {
  return (
    <div
      className={clsx(
        "flex min-w-0 items-start justify-between gap-3",
        compact ? "mb-3" : "mb-4",
        className,
      )}
    >
      {/* Left: title + subtitle / meta */}
      <div className="min-w-0 flex-1">
        <h1
          className={clsx(
            "font-semibold text-[color:var(--foreground)] leading-tight",
            compact ? "text-[15px]" : "text-[17px]",
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-[13px] text-[color:var(--muted)] leading-4">{subtitle}</p>
        ) : null}
        {meta ? <div className="mt-1">{meta}</div> : null}
      </div>

      {/* Right: action buttons */}
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

// ── Section header (lower-level subheader inside a page) ──────────────────

type SectionHeaderProps = {
  title: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function SectionHeader({ title, actions, className }: SectionHeaderProps) {
  return (
    <div
      className={clsx(
        "flex items-center justify-between gap-2 mb-2",
        className,
      )}
    >
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.05em] text-[color:var(--muted)]">
        {title}
      </h2>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
