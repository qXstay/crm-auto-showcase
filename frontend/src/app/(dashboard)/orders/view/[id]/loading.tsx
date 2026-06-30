import { Skeleton } from "@/components/ui/skeleton";

export default function OrderViewLoading() {
  return (
    <div className="w-full">
      <div className="border-b border-[color:var(--border)] bg-white px-4 py-3 sm:px-6">
        <Skeleton className="mb-2 h-4 w-32" />
        <Skeleton className="h-6 w-48" />
      </div>

      <div className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-[800px] space-y-6">
          <div className="space-y-4 rounded-xl border border-[color:var(--border)] bg-slate-50/50 p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-48" />
              </div>
              <Skeleton className="h-8 w-32" />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-[color:var(--border)] bg-white p-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="mt-2 h-5 w-32" />
              </div>
              <div className="rounded border border-[color:var(--border)] bg-white p-3">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="mt-2 h-5 w-32" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <Skeleton className="h-6 w-32" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex justify-between rounded border border-[color:var(--border)] bg-white p-3">
                  <div className="space-y-1">
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-5 w-20" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
