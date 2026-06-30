import { Skeleton } from "@/components/ui/skeleton";

export default function BookingDayLoading() {
  return (
    <div className="w-full">
      {/* Mobile Skeleton */}
      <div className="border border-[color:var(--border)] bg-white p-3 sm:hidden">
        <section className="space-y-3 rounded border border-[color:var(--border)] bg-[#fcfcfe] p-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-10 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-9 flex-1" />
              <Skeleton className="h-9 flex-1" />
            </div>
          </div>

          <div className="space-y-2 border-t border-[color:var(--border)] pt-3">
            <Skeleton className="h-4 w-16" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-20" />
              <Skeleton className="h-9 w-28" />
            </div>
          </div>

          <div className="space-y-2 border-t border-[color:var(--border)] pt-3">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-10" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded" />
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Desktop Skeleton */}
      <div className="hidden border border-[color:var(--border)] bg-white sm:block">
        <div className="min-w-[980px] select-none">
          <div className="relative grid grid-cols-[96px_1fr_1fr_1fr_1fr] grid-rows-[44px_repeat(20,24px)]">
            {/* Header row */}
            <div className="row-start-1 border-b border-[color:var(--border)] px-4 py-3">
              <Skeleton className="h-4 w-16" />
            </div>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="row-start-1 border-b border-l border-[color:var(--border)] px-4 py-3">
                <Skeleton className="h-4 w-24" />
              </div>
            ))}

            {/* Time col */}
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={`time-${i}`} className="border-b border-[color:var(--border)]/30 pr-2 pt-1 text-right" style={{ gridRow: `${i * 2 + 2} / span 2` }}>
                <Skeleton className="ml-auto h-3 w-10" />
              </div>
            ))}

            {/* Fake slots */}
            {Array.from({ length: 4 }).map((_, col) => (
              Array.from({ length: 20 }).map((_, row) => (
                <div key={`grid-${col}-${row}`} className="border-b border-l border-[color:var(--border)]/30" style={{ gridColumn: col + 2, gridRow: row + 2 }} />
              ))
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
