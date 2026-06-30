"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import clsx from "clsx";
import { Modal } from "@/components/ui/modal";
import { isOrderMarkedForDeletion } from "@/features/orders/lifecycle";
import { deleteOrderLifecycleViaApi } from "@/features/orders/repository";
import { removeStoredDemoOrder } from "@/features/orders/storage";
import type { DemoOrderStatus } from "@/features/orders/types";

type OrderDeleteActionProps = {
  orderId: string;
  orderNumber: string;
  status: DemoOrderStatus;
  display?: "icon" | "button";
  deletedRedirectHref?: string;
  className?: string;
};

export function OrderDeleteAction({
  orderId,
  orderNumber,
  status,
  display = "icon",
  deletedRedirectHref,
  className,
}: OrderDeleteActionProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isDraft = status === "Черновик";
  const isMarked = isOrderMarkedForDeletion(status);
  const title = isDraft ? "Удалить черновик" : "Удалить заказ";
  const actionLabel = "Удалить";
  const ariaLabel = isDraft ? "Удалить черновик" : "Удалить заказ";

  function closeConfirm() {
    if (isSubmitting) {
      return;
    }

    setConfirmOpen(false);
    setError(null);
  }

  function handleConfirm() {
    setError(null);
    setIsSubmitting(true);

    void deleteOrderLifecycleViaApi(orderId)
      .then((result) => {
        setConfirmOpen(false);

        if ("deleted" in result) {
          removeStoredDemoOrder(orderId);

          if (deletedRedirectHref) {
            router.push(deletedRedirectHref);
          }
        }

        router.refresh();
      })
      .catch((requestError) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Не удалось выполнить действие.",
        );
      })
      .finally(() => setIsSubmitting(false));
  }

  const button = (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!isMarked) {
          setConfirmOpen(true);
        }
      }}
      disabled={isMarked || isSubmitting}
      className={clsx(
        display === "icon"
          ? "inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-100 bg-white text-rose-600 transition-colors hover:border-rose-300 hover:bg-[color:var(--danger-bg)] disabled:cursor-not-allowed disabled:border-[color:var(--border)] disabled:text-[color:var(--muted)]"
          : "inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-rose-200 bg-white px-4 text-[14px] font-semibold text-rose-600 transition-colors hover:bg-[color:var(--danger-bg)] disabled:cursor-not-allowed disabled:border-[color:var(--border)] disabled:text-[color:var(--muted)] sm:h-9",
        className,
      )}
      aria-label={isMarked ? "Заказ удалён из списка" : ariaLabel}
      title={isMarked ? "Заказ удалён из списка" : ariaLabel}
    >
      <Trash2 className="h-3.5 w-3.5" />
      {display === "button" ? <span>{title}</span> : null}
    </button>
  );

  return (
    <>
      {button}

      {confirmOpen ? (
        <Modal
          title={title}
          onClose={closeConfirm}
          actions={
            <>
              <button
                type="button"
                onClick={closeConfirm}
                disabled={isSubmitting}
                className="h-9 rounded-md border border-[color:var(--border)] bg-white px-4 text-[14px] text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:text-[color:var(--muted)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={isSubmitting}
                className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-[14px] font-medium text-white disabled:cursor-wait disabled:opacity-70"
              >
                {isSubmitting ? "Сохраняем..." : actionLabel}
              </button>
            </>
          }
        >
          <div className="space-y-2">
            <div className="text-[14px] leading-5 text-[color:var(--foreground)]">
              {isDraft
                ? `Черновик заказа №${orderNumber || "—"} будет физически удалён.`
                : `Заказ №${orderNumber || "—"} будет удалён из списка.`}
            </div>
            <div className="text-[13px] leading-5 text-[color:var(--muted)]">
              {isDraft
                ? "Этот путь доступен только для черновиков."
                : "История, оплаты, смена и печатные данные сохранятся."}
            </div>
            {error ? (
              <div className="rounded-md border border-rose-200 bg-[color:var(--danger-bg)] px-3 py-2 text-[13px] leading-5 text-rose-700">
                {error}
              </div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}
