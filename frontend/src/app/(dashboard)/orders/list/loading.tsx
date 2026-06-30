import { OrdersTabs } from "@/features/order-draft/components/orders-tabs";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrdersListLoading() {
  return (
    <section className="w-full">
      <div className="bg-white">
        <OrdersTabs activeTab="list" />

        {/* Mobile skeleton */}
        <div className="sm:hidden">
          <div className="border-b border-t border-[color:var(--border)] bg-[color:var(--background)] px-4 py-1.5">
            <Skeleton className="h-4 w-24" />
          </div>
          <div className="divide-y divide-[color:var(--border)]">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <div className="mt-3">
                  <Skeleton className="h-4 w-32" />
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <div className="space-y-1.5">
                      <Skeleton className="h-3 w-28" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Desktop skeleton */}
        <div className="hidden overflow-x-auto sm:block">
          <div className="min-w-[900px]">
            <div className="grid grid-cols-[80px_180px_130px_220px_minmax(0,1fr)_130px] border-b border-[color:var(--border)] px-4 py-3">
              <Skeleton className="h-3 w-6" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>

            <div className="border-b border-[color:var(--border)] bg-[color:var(--background)] px-4 py-2">
              <Skeleton className="h-4 w-24" />
            </div>

            <div className="divide-y divide-[color:var(--border)]">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[80px_180px_130px_220px_minmax(0,1fr)_130px] px-4 py-3"
                >
                  <Skeleton className="h-4 w-10" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-3 w-12" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
