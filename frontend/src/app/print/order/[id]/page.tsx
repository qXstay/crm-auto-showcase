import { getBranchPrintSettings, getBranchProfile } from "@/server/repositories/branch-repository";
import { getOrderByIdForBranch } from "@/server/repositories/order-read-repository";
import { hasServerPermission, requireServerAuthContext } from "@/server/auth/context";
import { buildPrintableOrderDocument } from "@/features/orders/print";

export const dynamic = "force-dynamic";

export default async function PrintOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireServerAuthContext();

  if (!hasServerPermission(auth, "order.view")) {
    return (
      <main className="min-h-screen bg-[#eef1f5] px-4 py-8 text-black print:min-h-0 print:bg-white print:px-0 print:py-0">
        <div className="mx-auto w-[320px] max-w-full rounded-[12px] border border-[#d9dbe1] bg-white px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] print:w-[57mm] print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
          <div className="px-1 py-2">Нет доступа.</div>
        </div>
      </main>
    );
  }

  const { id } = await params;
  const orderRecord = await getOrderByIdForBranch(auth.currentBranch.id, id);

  if (!orderRecord) {
    return (
      <main className="min-h-screen bg-[#eef1f5] px-4 py-8 text-black print:min-h-0 print:bg-white print:px-0 print:py-0">
        <div className="mx-auto w-[320px] max-w-full rounded-[12px] border border-[#d9dbe1] bg-white px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] print:w-[57mm] print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
          <div className="px-1 py-2">Заказ не найден.</div>
        </div>
      </main>
    );
  }

  const [profile, printSettings] = await Promise.all([
    getBranchProfile(auth.currentBranch.id),
    getBranchPrintSettings(auth.currentBranch.id),
  ]);
  const printableOrder = buildPrintableOrderDocument({
    order: orderRecord.order,
    detail: orderRecord.detail,
    branch: auth.currentBranch,
    profile,
    printSettings,
  });

  return (
    <main className="min-h-screen bg-[#eef1f5] px-4 py-8 text-black print:min-h-0 print:bg-white print:px-0 print:py-0">
      <style>{`
        @page {
          size: 57mm auto;
          margin: 2mm;
        }

        @media print {
          html,
          body {
            background: #fff !important;
          }

          body {
            margin: 0;
          }
        }
      `}</style>

      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.setTimeout(() => {
              window.print();
            }, 120);
          `,
        }}
      />

      <div className="mx-auto w-[320px] max-w-full rounded-[12px] border border-[#d9dbe1] bg-white px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.08)] print:w-[57mm] print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
        <div className="px-1 py-1.5 text-[11px] leading-4 print:text-[10.5px] print:leading-4">
          <header className="border-b border-dashed border-[#9ca3af] pb-2 text-center">
            <div className="text-[15px] font-semibold leading-5 print:text-[13px]">
              {printableOrder.receiptTitle}
            </div>
            {printableOrder.locationLabel ? (
              <div className="mt-0.5 text-[10px] leading-4 text-[#4b5563]">
                {printableOrder.locationLabel}
              </div>
            ) : null}
            {printableOrder.branchPhone ? (
              <div className="text-[10px] leading-4 text-[#4b5563]">
                {printableOrder.branchPhone}
              </div>
            ) : null}
            <div className="mt-1 text-[11px] leading-4">Заказ №{printableOrder.number}</div>
            <div className="text-[10px] leading-4 text-[#4b5563]">
              {printableOrder.dateLabel}
            </div>
          </header>

          <section className="space-y-1 border-b border-dashed border-[#9ca3af] py-2">
            <div>
              <div className="text-[10px] uppercase tracking-[0.04em] text-[#6b7280]">
                Клиент
              </div>
              <div>{printableOrder.clientName}</div>
              {printableOrder.clientPhone !== "Не указан" ? (
                <div className="text-[#4b5563]">{printableOrder.clientPhone}</div>
              ) : null}
              {printableOrder.clientInn ? (
                <div className="text-[#4b5563]">ИНН: {printableOrder.clientInn}</div>
              ) : null}
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-[0.04em] text-[#6b7280]">
                Автомобиль
              </div>
              <div>{printableOrder.carLabel}</div>
              {printableOrder.plateNumber !== "Не указан" ? (
                <div className="text-[#4b5563]">Госномер: {printableOrder.plateNumber}</div>
              ) : null}
            </div>

            <div className="grid grid-cols-[1fr_auto] gap-x-2">
              <div className="text-[#6b7280]">Смена</div>
              <div className="text-right">{printableOrder.shiftLabel}</div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-x-2">
              <div className="text-[#6b7280]">Исполнитель</div>
              <div className="text-right">{printableOrder.executorLabel}</div>
            </div>
          </section>

          <section className="border-b border-dashed border-[#9ca3af] py-2">
            <div className="mb-1 text-[10px] uppercase tracking-[0.04em] text-[#6b7280]">
              Услуги
            </div>

            <div className="space-y-1.5">
              {printableOrder.lines.map((line) => (
                <div key={line.key} className="break-inside-avoid">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div>{line.serviceName}</div>
                      {line.contextLabel ? (
                        <div className="mt-0.5 text-[10px] leading-4 text-[#6b7280]">
                          {line.contextLabel}
                        </div>
                      ) : null}
                      {line.detailsLabel ? (
                        <div className="mt-0.5 text-[9.5px] leading-4 text-[#6b7280]">
                          {line.detailsLabel}
                        </div>
                      ) : null}
                      <div className="mt-0.5 text-[10px] leading-4 text-[#4b5563]">
                        {line.quantityLabel} × {line.unitPriceLabel}
                      </div>
                    </div>
                    <div className="shrink-0 text-right font-medium">{line.totalPriceLabel}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-1 border-b border-dashed border-[#9ca3af] py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#6b7280]">Оплата</span>
              <span className="text-right">{printableOrder.paymentLabel}</span>
            </div>
            {printableOrder.accountLabel ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[#6b7280]">Счёт</span>
                <span className="text-right">{printableOrder.accountLabel}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between gap-2 pt-0.5 text-[15px] font-semibold leading-6 print:text-[14px]">
              <span>Итого</span>
              <span>{printableOrder.totalLabel}</span>
            </div>
          </section>

          {printableOrder.recommendationText ? (
            <section className="border-b border-dashed border-[#9ca3af] py-2.5">
              <div className="mb-1 text-[10px] uppercase tracking-[0.04em] text-[#6b7280]">
                Рекомендации клиенту
              </div>
              <div className="whitespace-pre-line leading-4 text-[#4b5563]">
                {printableOrder.recommendationText}
              </div>
            </section>
          ) : null}

          <footer className="pt-2 text-center text-[10px] leading-4 text-[#6b7280]">
            {printableOrder.footerNote ? (
              <div className="whitespace-pre-line text-[#4b5563]">
                {printableOrder.footerNote}
              </div>
            ) : null}
            <div
              className={printableOrder.footerNote ? "mt-1.5 border-t border-dashed border-[#d1d5db] pt-1.5" : ""}
            >
              <div>Чек из программы</div>
              <div>Без фискализации</div>
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
