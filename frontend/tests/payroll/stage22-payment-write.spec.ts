import { expect, test } from "@playwright/test";
import { Prisma } from "@prisma/client";

import {
  assertPaymentAppendDoesNotOverpay,
  createStage22PayrollAccrualForPayment,
  getRemainingOrderPaymentAmount,
} from "../../src/server/repositories/order-write-repository";
import { buildPersistedOrderPayrollSummary } from "../../src/server/repositories/order-read-repository";

const matrixRule = {
  stage22PayrollRule: {
    type: "matrix",
  },
};

function createFakeTransaction(options: {
  salaryRuleSnapshotJson?: unknown;
  executorCount?: number;
  executorEmployeeIds?: string[];
  lineAmount?: number;
}) {
  const accruals: Array<Record<string, unknown>> = [];
  const payoutBatches: Array<Array<Record<string, unknown>>> = [];
  const executorEmployeeIds = options.executorEmployeeIds ??
    Array.from({ length: options.executorCount ?? 1 }, (_, index) => `employee-${index + 1}`);
  const executorCount = executorEmployeeIds.length;

  const tx = {
    orderLine: {
      findMany: async () => [
        {
          id: "line-1",
          serviceNameSnapshot: "Шиномонтаж",
          unitPrice: new Prisma.Decimal(options.lineAmount ?? 10000),
          quantity: new Prisma.Decimal(1),
          costPriceSnapshot: null,
          salaryRuleSnapshotJson: options.salaryRuleSnapshotJson !== undefined
            ? options.salaryRuleSnapshotJson
            : matrixRule,
        },
      ],
    },
    orderExecutor: {
      findMany: async () =>
        Array.from({ length: executorCount }, (_, index) => ({
          id: `order-executor-${index + 1}`,
          employeeId: executorEmployeeIds[index],
          employeeNameSnapshot: `Мастер ${index + 1}`,
          skillLevelSnapshot: index === 0 ? "level_1" : "level_2",
          workPercentSnapshot: new Prisma.Decimal(100),
          sortOrder: index,
          createdAt: new Date("2026-05-11T00:00:00.000Z"),
        })),
    },
    orderPayrollAccrual: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        accruals.push(data);
        return { id: data.id as string };
      },
    },
    orderPayrollPayout: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        payoutBatches.push(data);
        return { count: data.length };
      },
    },
  };

  return {
    tx: tx as unknown as Parameters<typeof createStage22PayrollAccrualForPayment>[0],
    accruals,
    payoutBatches,
  };
}

async function createAccrual(params: {
  paymentId: string;
  paymentAmount: number;
  paidTotalAfterPayment: number;
  alreadyAccruedPaidBase?: number;
  salaryRuleSnapshotJson?: unknown;
  totals?: {
    subtotal: number;
    discount: number;
    total: number;
  };
}) {
  const fake = createFakeTransaction({
    salaryRuleSnapshotJson: params.salaryRuleSnapshotJson,
    lineAmount: params.totals?.subtotal,
  });

  await createStage22PayrollAccrualForPayment(fake.tx, {
    orderId: "order-1",
    paymentId: params.paymentId,
    shift: {
      id: "shift-1",
      staff: [{ employeeId: "employee-1", arrivedAt: null, leftAt: null }],
    },
    totals: params.totals ?? {
      subtotal: 10000,
      discount: 0,
      total: 10000,
    },
    legacyAccrualTotal: null,
    paymentAmount: params.paymentAmount,
    paidTotalAfterPayment: params.paidTotalAfterPayment,
    alreadyAccruedPaidBase: params.alreadyAccruedPaidBase ?? 0,
  });

  return fake;
}

function decimalNumber(value: unknown) {
  return value instanceof Prisma.Decimal ? value.toNumber() : Number(value);
}

test("full payment creates supported accrual and payout for the payment", async () => {
  const fake = await createAccrual({
    paymentId: "payment-full",
    paymentAmount: 10000,
    paidTotalAfterPayment: 10000,
  });

  expect(fake.accruals).toHaveLength(1);
  expect(fake.accruals[0]).toEqual(expect.objectContaining({
    paymentId: "payment-full",
    status: "supported",
  }));
  expect(decimalNumber(fake.accruals[0].payrollBaseAmount)).toBe(10000);
  expect(decimalNumber(fake.accruals[0].salaryFundAmount)).toBe(3500);
  expect(fake.payoutBatches.flat()).toHaveLength(1);
  expect(decimalNumber(fake.payoutBatches.flat()[0].amount)).toBe(3500);
});

test("outside-shift executor still materializes supported payout with warning", async () => {
  const fake = createFakeTransaction({
    executorEmployeeIds: ["employee-outside-shift"],
  });

  await createStage22PayrollAccrualForPayment(fake.tx, {
    orderId: "order-outside-shift",
    paymentId: "payment-outside-shift",
    shift: {
      id: "shift-1",
      staff: [{ employeeId: "employee-1", arrivedAt: null, leftAt: null }],
    },
    totals: {
      subtotal: 10000,
      discount: 0,
      total: 10000,
    },
    legacyAccrualTotal: null,
    paymentAmount: 10000,
    paidTotalAfterPayment: 10000,
    alreadyAccruedPaidBase: 0,
  });

  expect(fake.accruals).toHaveLength(1);
  expect(fake.accruals[0]).toEqual(expect.objectContaining({
    status: "supported",
  }));
  expect(fake.payoutBatches.flat()).toHaveLength(1);
  expect(fake.payoutBatches.flat()[0]).toEqual(expect.objectContaining({
    employeeId: "employee-outside-shift",
    orderExecutorId: "order-executor-1",
  }));

  const snapshot = fake.accruals[0].calculationSnapshotJson as {
    result?: { warnings?: Array<{ code?: string; employeeId?: string }> };
  };

  expect(snapshot.result?.warnings).toContainEqual(expect.objectContaining({
    code: "executor_not_in_shift",
    employeeId: "employee-outside-shift",
  }));
});

test("partial payment creates payout only for partial paid base", async () => {
  const fake = await createAccrual({
    paymentId: "payment-partial",
    paymentAmount: 5000,
    paidTotalAfterPayment: 5000,
  });

  expect(decimalNumber(fake.accruals[0].paymentAmountSnapshot)).toBe(5000);
  expect(decimalNumber(fake.accruals[0].payrollBaseAmount)).toBe(5000);
  expect(decimalNumber(fake.accruals[0].salaryFundAmount)).toBe(1750);
  expect(decimalNumber(fake.payoutBatches.flat()[0].amount)).toBe(1750);
});

test("later dopayment accrues only remaining paid base", async () => {
  const first = await createAccrual({
    paymentId: "payment-first",
    paymentAmount: 5000,
    paidTotalAfterPayment: 5000,
  });
  const second = await createAccrual({
    paymentId: "payment-second",
    paymentAmount: 5000,
    paidTotalAfterPayment: 10000,
    alreadyAccruedPaidBase: 5000,
  });
  const payoutSum = [...first.payoutBatches.flat(), ...second.payoutBatches.flat()]
    .reduce((sum, row) => sum + decimalNumber(row.amount), 0);

  expect(decimalNumber(second.accruals[0].paymentAmountSnapshot)).toBe(5000);
  expect(decimalNumber(second.accruals[0].payrollBaseAmount)).toBe(5000);
  expect(decimalNumber(second.accruals[0].salaryFundAmount)).toBe(1750);
  expect(payoutSum).toBe(3500);
});

test("discounted 730 order paid by 694 closes payment and uses discounted payroll base", async () => {
  const totals = {
    subtotal: 730,
    discount: 36,
    total: 694,
  };
  const fake = await createAccrual({
    paymentId: "payment-discount-full",
    paymentAmount: 694,
    paidTotalAfterPayment: 694,
    totals,
  });

  expect(getRemainingOrderPaymentAmount(totals.total, 694)).toBe(0);
  expect(decimalNumber(fake.accruals[0].paymentAmountSnapshot)).toBe(694);
  expect(decimalNumber(fake.accruals[0].payrollBaseAmount)).toBe(694);
  expect(decimalNumber(fake.accruals[0].salaryFundAmount)).toBe(242.9);
  expect(decimalNumber(fake.payoutBatches.flat()[0].amount)).toBe(242.9);
});

test("discounted 730 order with 500 partial payment leaves 194 and uses paid base 500", async () => {
  const totals = {
    subtotal: 730,
    discount: 36,
    total: 694,
  };
  const fake = await createAccrual({
    paymentId: "payment-discount-partial",
    paymentAmount: 500,
    paidTotalAfterPayment: 500,
    totals,
  });

  expect(getRemainingOrderPaymentAmount(totals.total, 500)).toBe(194);
  expect(decimalNumber(fake.accruals[0].paymentAmountSnapshot)).toBe(500);
  expect(decimalNumber(fake.accruals[0].payrollBaseAmount)).toBe(500);
  expect(decimalNumber(fake.accruals[0].salaryFundAmount)).toBe(175);
  expect(decimalNumber(fake.payoutBatches.flat()[0].amount)).toBe(175);
});

test("discounted order final dopayment closes remaining 194 only once", async () => {
  const totals = {
    subtotal: 730,
    discount: 36,
    total: 694,
  };
  const first = await createAccrual({
    paymentId: "payment-discount-first",
    paymentAmount: 500,
    paidTotalAfterPayment: 500,
    totals,
  });
  const second = await createAccrual({
    paymentId: "payment-discount-second",
    paymentAmount: 194,
    paidTotalAfterPayment: 694,
    alreadyAccruedPaidBase: 500,
    totals,
  });
  const payoutSum = [...first.payoutBatches.flat(), ...second.payoutBatches.flat()]
    .reduce((sum, row) => sum + decimalNumber(row.amount), 0);

  expect(getRemainingOrderPaymentAmount(totals.total, 694)).toBe(0);
  expect(decimalNumber(second.accruals[0].paymentAmountSnapshot)).toBe(194);
  expect(decimalNumber(second.accruals[0].payrollBaseAmount)).toBe(194);
  expect(decimalNumber(second.accruals[0].salaryFundAmount)).toBe(67.9);
  expect(payoutSum).toBe(242.9);
});

test("order without discount 1000 by 1000 remains fully paid with original payroll base", async () => {
  const totals = {
    subtotal: 1000,
    discount: 0,
    total: 1000,
  };
  const fake = await createAccrual({
    paymentId: "payment-no-discount",
    paymentAmount: 1000,
    paidTotalAfterPayment: 1000,
    totals,
  });

  expect(getRemainingOrderPaymentAmount(totals.total, 1000)).toBe(0);
  expect(decimalNumber(fake.accruals[0].payrollBaseAmount)).toBe(1000);
  expect(decimalNumber(fake.accruals[0].salaryFundAmount)).toBe(350);
  expect(decimalNumber(fake.payoutBatches.flat()[0].amount)).toBe(350);
});

test("order detail persisted payroll summary aggregates partial and final payouts", () => {
  const summary = buildPersistedOrderPayrollSummary([
    {
      status: "supported",
      payrollBaseAmount: new Prisma.Decimal(4000),
      salaryFundAmount: new Prisma.Decimal(1400),
      payouts: [
        {
          employeeId: "employee-razin",
          employeeNameSnapshot: "И. Р.",
          skillLevelSnapshot: "level_1",
          amount: new Prisma.Decimal(1400),
        },
      ],
    },
    {
      status: "supported",
      payrollBaseAmount: new Prisma.Decimal(6720),
      salaryFundAmount: new Prisma.Decimal(2352),
      payouts: [
        {
          employeeId: "employee-razin",
          employeeNameSnapshot: "И. Р.",
          skillLevelSnapshot: "level_1",
          amount: new Prisma.Decimal(2352),
        },
      ],
    },
  ]);

  expect(summary).toEqual({
    accrualCount: 2,
    payoutCount: 2,
    status: "supported",
    statusReason: null,
    paidBaseAmount: 10720,
    salaryFundAmount: 3752,
    payoutAmount: 3752,
    payouts: [
      {
        employeeId: "employee-razin",
        employeeNameSnapshot: "И. Р.",
        skillLevelSnapshot: "level_1",
        amount: 3752,
      },
    ],
  });
});

test("order detail persisted payroll summary exposes unsupported status without payouts", () => {
  const summary = buildPersistedOrderPayrollSummary([
    {
      status: "unsupported",
      statusReason: "missing_executor_input",
      payrollBaseAmount: new Prisma.Decimal(4000),
      salaryFundAmount: null,
      payouts: [],
    },
  ]);

  expect(summary).toEqual({
    accrualCount: 1,
    payoutCount: 0,
    status: "unsupported",
    statusReason: "missing_executor_input",
    paidBaseAmount: 4000,
    salaryFundAmount: 0,
    payoutAmount: 0,
    payouts: [],
  });
});

test("unsupported partial payment creates unsupported accrual and no payout", async () => {
  const fake = await createAccrual({
    paymentId: "payment-unsupported",
    paymentAmount: 5000,
    paidTotalAfterPayment: 5000,
    salaryRuleSnapshotJson: null,
  });

  expect(fake.accruals[0]).toEqual(expect.objectContaining({
    paymentId: "payment-unsupported",
    status: "unsupported",
    statusReason: "missing_salary_rule",
  }));
  expect(decimalNumber(fake.accruals[0].payrollBaseAmount)).toBe(5000);
  expect(fake.payoutBatches.flat()).toHaveLength(0);
});

test("append payment guard rejects overpayment beyond remaining order amount", () => {
  expect(() =>
    assertPaymentAppendDoesNotOverpay({
      totalAmount: 10000,
      alreadyPaidAmount: 7000,
      paymentAmount: 3000.01,
    }),
  ).toThrow("Сумма оплаты больше остатка по заказу.");
});
