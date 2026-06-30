export function Topbar() {
  return (
    <header className="border-b border-[color:var(--border)] bg-white px-5 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[color:var(--foreground)]">
            Мой шиномонтаж
          </h2>
          <p className="mt-0.5 text-sm text-[color:var(--muted)]">
            Филиал: Северный · Смена открыта
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2">
            <p className="text-sm font-medium text-[color:var(--foreground)]">
              В кассе: 12 540 ₽
            </p>
          </div>
          <div className="rounded-lg border border-[color:var(--border)] bg-[color:var(--card)] px-3 py-2">
            <p className="text-sm font-medium text-[color:var(--foreground)]">
              Открыта смена №12
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
