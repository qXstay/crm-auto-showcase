import Link from "next/link";
import clsx from "clsx";

type OrdersTabsProps = {
  activeTab: "new" | "list" | "edit" | "view";
  editLabel?: string;
};

export function OrdersTabs({ activeTab, editLabel = "Текущий черновик" }: OrdersTabsProps) {
  return (
    <div className="overflow-x-auto border-b border-[color:var(--border)] bg-white px-4">
      <div className="flex min-w-max items-center gap-6">
        <Link
          href="/orders/new"
          prefetch={true}
          className={clsx(
            "whitespace-nowrap border-b-2 px-0.5 py-3 text-[14px] font-medium leading-5",
            activeTab === "new"
              ? "border-[color:var(--primary)] text-[color:var(--primary)]"
              : "border-transparent text-[color:var(--muted)]",
          )}
        >
          Новый заказ
        </Link>
        <Link
          href="/orders/list"
          prefetch={true}
          className={clsx(
            "whitespace-nowrap border-b-2 px-0.5 py-3 text-[14px] font-medium leading-5",
            activeTab === "list"
              ? "border-[color:var(--primary)] text-[color:var(--primary)]"
              : "border-transparent text-[color:var(--muted)]",
          )}
        >
          Заказы
        </Link>
        {activeTab === "edit" ? (
          <span className="whitespace-nowrap border-b-2 border-[color:var(--primary)] px-0.5 py-3 text-[14px] font-medium leading-5 text-[color:var(--primary)]">
            {editLabel}
          </span>
        ) : null}
        {activeTab === "view" ? (
          <span className="whitespace-nowrap border-b-2 border-[color:var(--primary)] px-0.5 py-3 text-[14px] font-medium leading-5 text-[color:var(--primary)]">
            Просмотр заказа
          </span>
        ) : null}
      </div>
    </div>
  );
}
