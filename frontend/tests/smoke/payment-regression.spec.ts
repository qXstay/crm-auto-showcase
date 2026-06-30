import { expect, test, type Page } from "@playwright/test";
import { loginAsSmokeUser } from "./support";

type CreatedOrder = {
  id: string;
  number: string;
  totals: {
    total: number;
  };
};

async function createAnonymousOrder(
  page: Page,
  options: {
    status: "Черновик" | "Выполнен";
    shiftId?: string | null;
    shiftLabelSnapshot?: string | null;
    shiftOpenedAtSnapshot?: string | null;
    carBrand: string;
    carModel: string;
  },
) {
  const catalogResponse = await page.request.get("/api/service-catalog");
  expect(catalogResponse.ok()).toBeTruthy();
  const catalog = await catalogResponse.json();
  const service = catalog.categories
    .flatMap((category: { services: Array<{ id: string; name: string }> }) => category.services)
    .find((item: { id: string; name: string }) => item.id && item.name);

  expect(service).toBeTruthy();

  const now = new Date().toISOString();
  const response = await page.request.post("/api/orders", {
    data: {
      order: {
        id: `smoke-seed-${crypto.randomUUID()}`,
        number: "",
        createdAt: now,
        updatedAt: now,
        status: options.status,
        client: {
          mode: "anonymous",
          clientId: "anonymous",
          clientKind: "individual",
          label: "Анонимный клиент",
          details: `${options.carBrand} ${options.carModel}`,
          name: "Анонимный клиент",
          phone: "",
          carBrand: options.carBrand,
          carModel: options.carModel,
          plateNumber: "",
          preferredRadius: "",
          anonymous: true,
        },
        vehicleType: "passenger",
        radius: "R16",
        lowProfile: false,
        runflat: false,
        executorId: null,
        executorEmployeeId: null,
        executorNameSnapshot: null,
        executorEmployeeIds: [],
        shiftId: options.shiftId ?? null,
        shiftLabelSnapshot: options.shiftLabelSnapshot ?? null,
        shiftOpenedAtSnapshot: options.shiftOpenedAtSnapshot ?? null,
        lines: [
          {
            key: `smoke-line-${crypto.randomUUID()}`,
            serviceId: service.id,
            serviceName: service.name,
            serviceNameSnapshot: service.name,
            vehicleType: "passenger",
            vehicleLabel: "Легковой",
            radius: "R16",
            lowProfile: false,
            runflat: false,
            unitPrice: 1000,
            quantity: 1,
            pricingSnapshot: {
              source: "services_admin",
              priceType: "fixed",
              pricingMode: "service",
              inputKind: "none",
              selectionMode: "automatic",
              vehicleType: null,
              radius: null,
              lowProfile: false,
              runflat: false,
              appliedModifiers: [],
              baseUnitPrice: 1000,
              resolvedUnitPrice: 1000,
              displayLabel: "1 000 ₽",
              selectedOptionLabel: null,
              operatorNote: null,
              priceOptions: [],
            },
            salaryRuleSnapshot: null,
            costPrice: null,
            salaryAccrualSnapshot: null,
          },
        ],
        salaryAccrualTotal: null,
        totals: {
          servicesCount: 1,
          subtotal: 1000,
          discount: 0,
          total: 1000,
        },
        note: "Smoke payment regression",
        payment: {
          paymentStatus: "Не оплачено",
          paymentMethod: null,
          paymentLabel: null,
          accountId: null,
          accountNameSnapshot: null,
          paidAt: null,
          paidAmount: null,
          note: null,
        },
      },
    },
  });

  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = await response.json();

  return payload.order as CreatedOrder;
}

async function payOrderThroughEditor(
  page: Page,
  order: CreatedOrder,
  methodLabel: "Безнал (эквайринг)" | "Перевод на карту",
  action = "",
  internalComment = "",
) {
  await page.goto(`/orders?id=${order.id}${action}`);
  await expect(page.getByText(`Заказ №${order.number}`, { exact: false }).first()).toBeVisible();

  async function isPaymentDialogVisible() {
    return page
      .locator("div.fixed:visible", { hasText: "Остаток к оплате:" })
      .last()
      .isVisible()
      .catch(() => false);
  }

  if (!(await isPaymentDialogVisible())) {
    await page.getByRole("button", { name: "Принять оплату" }).click();
  }

  const paymentScope = page.locator("div.fixed:visible", { hasText: "Остаток к оплате:" }).last();
  await expect(paymentScope).toBeVisible();
  await expect(paymentScope.locator("span:visible", { hasText: "Остаток к оплате:" })).toContainText("1");
  await expect(paymentScope.getByRole("spinbutton")).toHaveValue("1000");
  await paymentScope.getByRole("radio", { name: `Способ оплаты: ${methodLabel}` }).click();
  if (internalComment) {
    await paymentScope.getByLabel("Комментарий для нас").fill(internalComment);
  }

  const paymentResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes(`/api/orders/${order.id}`) &&
      response.request().method() === (action ? "POST" : "PATCH"),
  );
  await paymentScope.getByRole("button", { name: "Принять", exact: true }).click();
  const paymentResponse = await paymentResponsePromise;

  expect(paymentResponse.ok(), await paymentResponse.text()).toBeTruthy();
  await expect(paymentScope).toBeHidden();
}

test("payment regression: full payment, late payment, overpayment guard and read views", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await loginAsSmokeUser(page);

  const shiftResponse = await page.request.get("/api/shifts/current");
  expect(shiftResponse.ok()).toBeTruthy();
  const shiftPayload = await shiftResponse.json();
  const currentShift = shiftPayload.currentShift;

  expect(currentShift, "Для payment smoke нужна открытая локальная смена.").toBeTruthy();

  const unpaidOrder = await createAnonymousOrder(page, {
    status: "Черновик",
    carBrand: "Geely",
    carModel: "Monjaro",
  });

  let releaseOrderLoad: (() => void) | null = null;
  const orderLoadGate = new Promise<void>((resolve) => {
    releaseOrderLoad = resolve;
  });
  await page.route(`**/api/orders/${unpaidOrder.id}`, async (route) => {
    await orderLoadGate;
    await route.continue();
  });
  const directOpen = page.goto(`/orders?id=${unpaidOrder.id}`);
  await expect(page.getByRole("region", { name: "Загрузка заказа" })).toBeVisible();
  await expect(page.getByText("Заказ №—", { exact: false })).toHaveCount(0);
  releaseOrderLoad?.();
  await directOpen;
  await page.unroute(`**/api/orders/${unpaidOrder.id}`);
  await expect(page.getByText(`Заказ №${unpaidOrder.number}`, { exact: false }).first()).toBeVisible();

  await payOrderThroughEditor(page, unpaidOrder, "Безнал (эквайринг)");

  const lateOrder = await createAnonymousOrder(page, {
    status: "Выполнен",
    shiftId: currentShift.id,
    shiftLabelSnapshot: `Смена №${currentShift.number}`,
    shiftOpenedAtSnapshot: currentShift.openedAt,
    carBrand: "Toyota",
    carModel: "Vitz",
  });
  const internalPaymentComment = `Внутренний smoke ${crypto.randomUUID()}`;
  await payOrderThroughEditor(
    page,
    lateOrder,
    "Перевод на карту",
    "&action=payment",
    internalPaymentComment,
  );

  const overpaymentResponse = await page.request.post(`/api/orders/${lateOrder.id}/payments`, {
    data: {
      payment: {
        paymentStatus: "Оплачен",
        paymentMethod: "cash",
        paymentLabel: "Наличные",
        accountId: null,
        accountNameSnapshot: null,
        paidAt: new Date().toISOString(),
        paidAmount: 1,
        note: null,
      },
      shiftId: currentShift.id,
      shiftLabelSnapshot: `Смена №${currentShift.number}`,
      shiftOpenedAtSnapshot: currentShift.openedAt,
    },
  });
  expect(overpaymentResponse.status()).toBe(400);
  expect(await overpaymentResponse.text()).toContain(
    "Доплату можно добавить только к выполненному заказу, который ещё не оплачен полностью",
  );

  await page.goto(`/orders/view/${lateOrder.id}`);
  await expect(page.getByText("Оплачен", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Перевод на карту", { exact: false }).last()).toBeVisible();
  await expect(
    page.locator("div:visible", { hasText: internalPaymentComment }).first(),
  ).toBeVisible();

  await page.goto(`/print/order/${lateOrder.id}`);
  await expect(page.getByText("Smoke payment regression")).toBeVisible();
  await expect(page.getByText(internalPaymentComment)).toHaveCount(0);

  await page.goto("/shift");
  await expect(page.getByText(lateOrder.number, { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Подробнее" }).first().click();
  const cashDialog = page.getByRole("dialog", { name: "В кассе" });
  await expect(cashDialog).toContainText("Безнал");
  await expect(cashDialog).toContainText("Перевод");
  await expect(cashDialog.getByText("Карта/перевод", { exact: true })).toHaveCount(0);
});
