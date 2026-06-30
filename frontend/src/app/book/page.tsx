import Link from "next/link";
import { listPublicBookingBranches } from "@/server/repositories/public-booking-repository";

export const dynamic = "force-dynamic";

export default async function PublicBookingIndexPage() {
  const branches = await listPublicBookingBranches();

  return (
    <main className="min-h-screen bg-[#f7f5f2] px-3 py-4 text-[color:var(--foreground)] sm:px-4 sm:py-5">
      <div className="mx-auto max-w-[520px] space-y-4">
        <section className="border border-[color:var(--border)] bg-white px-4 py-4">
          <div className="space-y-1">
            <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[color:var(--muted)]">
              Онлайн-запись
            </div>
            <h1 className="text-[22px] font-semibold leading-7">Выберите филиал</h1>
            <div className="text-[14px] leading-6 text-[color:var(--muted)]">
              Запись оформляется на один пост и один выбранный интервал времени.
            </div>
          </div>
        </section>

        <section className="space-y-2">
          {branches.map((branch) => (
            <Link
              key={branch.branchId}
              href={`/book/${branch.slug}`}
              className="block border border-[color:var(--border)] bg-white px-4 py-4 transition-colors hover:border-[color:var(--primary)]/35"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-[17px] font-semibold">{branch.branchName}</div>
                  <div className="text-[13px] leading-5 text-[color:var(--muted)]">
                    {branch.address}
                  </div>
                  {branch.phone ? (
                    <div className="text-[13px] text-[color:var(--muted)]">{branch.phone}</div>
                  ) : null}
                </div>
                <div
                  className={`shrink-0 border px-2 py-0.5 text-[11px] font-medium ${
                    branch.onlineEnabled
                      ? "border-[color:var(--primary)]/18 bg-[color:var(--primary)]/8 text-[color:var(--primary)]"
                      : "border-[color:var(--border)] bg-[#f7f5f2] text-[color:var(--muted)]"
                  }`}
                >
                  {branch.onlineEnabled ? "Доступно" : "Недоступно"}
                </div>
              </div>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
