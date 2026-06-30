import clsx from "clsx";

/**
 * Skeleton primitives — used while data is loading from backend.
 * Eliminates the "jump" effect when content appears.
 *
 * Usage:
 *   <Skeleton className="h-4 w-32" />          // inline
 *   <SkeletonRow columns={4} />                 // table row
 *   <SkeletonCard lines={3} />                  // card block
 */

type SkeletonProps = {
  className?: string;
};

/** Base shimmer block */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx(
        "animate-pulse rounded bg-[color:var(--border)]",
        className,
      )}
      aria-hidden="true"
    />
  );
}

/** A full table row of skeleton cells */
export function SkeletonRow({
  columns = 4,
  className,
}: {
  columns?: number;
  className?: string;
}) {
  return (
    <tr className={clsx("border-b border-[color:var(--border)]", className)} aria-hidden="true">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-3 py-2.5">
          <Skeleton className="h-3.5 w-full max-w-[140px]" />
        </td>
      ))}
    </tr>
  );
}

/** Multiple skeleton rows for a table body */
export function SkeletonRows({
  rows = 5,
  columns = 4,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} columns={columns} />
      ))}
    </>
  );
}

/** Card-style skeleton block with configurable lines */
export function SkeletonCard({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "space-y-2 rounded-md border border-[color:var(--border)] bg-white p-4",
        className,
      )}
      aria-hidden="true"
    >
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={clsx("h-3.5", i === 0 ? "w-2/3" : i === lines - 1 ? "w-1/3" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Inline text placeholder */
export function SkeletonText({
  width = "w-24",
  className,
}: {
  width?: string;
  className?: string;
}) {
  return <Skeleton className={clsx("inline-block h-3.5 align-middle", width, className)} />;
}
