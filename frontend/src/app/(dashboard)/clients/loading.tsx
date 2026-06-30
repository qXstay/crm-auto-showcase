import { Skeleton } from "@/components/ui/skeleton";

export default function ClientsLoading() {
  return (
    <section className="w-full min-w-0 space-y-2">
      <div className="px-1 py-1">
        <h1 className="text-[19px] font-semibold text-[color:var(--primary)]">Клиенты</h1>
      </div>

      <div className="bg-white">
        <div className="flex flex-col gap-2.5 border-b border-[color:var(--border)] px-3 py-3 lg:flex-row lg:items-center lg:gap-4">
          <Skeleton className="h-5 w-32" />
          <div className="w-full lg:w-[258px]">
            <Skeleton className="h-9 w-full" />
          </div>
        </div>

        {/* Mobile Skeleton */}
        <div className="divide-y divide-[color:var(--border)] sm:hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="h-4 w-12" />
              </div>
              <div className="mt-2.5">
                <Skeleton className="h-4 w-48" />
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Skeleton */}
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full min-w-[700px] text-left text-[14px] text-[color:var(--foreground)]">
            <thead>
              <tr className="border-b border-[color:var(--border)] text-[12px] text-[color:var(--muted)]">
                <th className="px-3 py-2.5 font-medium">ФИО</th>
                <th className="w-[180px] px-3 py-2.5 font-medium">Телефон</th>
                <th className="w-[220px] px-3 py-2.5 font-medium">Автомобили</th>
                <th className="w-[120px] px-3 py-2.5 font-medium text-right">Заказы</th>
                <th className="w-[120px] px-3 py-2.5 font-medium">Визит</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--border)]">
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="hover:bg-[color:var(--background)]">
                  <td className="px-3 py-2.5">
                    <Skeleton className="h-5 w-40" />
                  </td>
                  <td className="px-3 py-2.5">
                    <Skeleton className="h-4 w-28" />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      <Skeleton className="h-4 w-32" />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Skeleton className="ml-auto h-4 w-8" />
                  </td>
                  <td className="px-3 py-2.5 font-medium">
                    <Skeleton className="h-4 w-20" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
