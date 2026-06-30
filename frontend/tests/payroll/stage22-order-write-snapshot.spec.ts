import { expect, test } from "@playwright/test";

import type { CartItem } from "../../src/features/cashier/types";
import type { DemoOrder } from "../../src/features/orders/types";
import {
  STAGE22_XLSX_MATRIX_RULES,
  type Stage22MatrixRule,
} from "../../src/features/payroll/stage22-calculator";
import { toStoredPayrollFormulaSettingsJson } from "../../src/features/payroll/payroll-formula-settings";
import { prisma } from "../../src/server/db/prisma";
import { createOrderForBranch } from "../../src/server/repositories/order-write-repository";

function cartLine(salaryRuleSnapshot: unknown, overrides: Partial<CartItem> = {}): CartItem {
  return {
    key: "line-1",
    serviceId: "service-main",
    serviceName: "Шиномонтаж",
    serviceNameSnapshot: "Шиномонтаж",
    vehicleType: "passenger",
    vehicleLabel: "Легковой",
    radius: "R16",
    lowProfile: false,
    runflat: false,
    unitPrice: 10000,
    quantity: 1,
    pricingSnapshot: {
      pricingMode: "service",
      priceType: "fixed",
      basePrice: 10000,
      modifiers: [],
      manual: false,
    },
    salaryRuleSnapshot: salaryRuleSnapshot as CartItem["salaryRuleSnapshot"],
    costPrice: null,
    salaryAccrualSnapshot: null,
    ...overrides,
  };
}

function draftOrder(line: CartItem): DemoOrder {
  return {
    id: "order-draft",
    number: "1",
    createdAt: "2026-05-20T08:00:00.000Z",
    updatedAt: "2026-05-20T08:00:00.000Z",
    status: "Черновик",
    client: {
      mode: "anonymous",
      clientId: "anonymous",
      clientKind: "individual",
      label: "Анонимный клиент",
      details: "",
      name: "Анонимный клиент",
      phone: "",
      carBrand: "",
      carModel: "",
      plateNumber: "",
      preferredRadius: "",
      anonymous: true,
    },
    vehicleType: "passenger",
    radius: "R16",
    lowProfile: false,
    runflat: false,
    executorEmployeeId: null,
    executorNameSnapshot: null,
    executorEmployeeIds: [],
    shiftId: null,
    shiftLabelSnapshot: null,
    shiftOpenedAtSnapshot: null,
    lines: [line],
    salaryAccrualTotal: null,
    totals: {
      servicesCount: 1,
      subtotal: 10000,
      discount: 0,
      total: 10000,
    },
    note: "",
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
  };
}

function createOrderWriteFakePrisma(matrixRules: Stage22MatrixRule[]) {
  const orderLineBatches: Array<Array<Record<string, unknown>>> = [];
  const orderExecutorRows: Array<Record<string, unknown>> = [];

  const tx = {
    $queryRaw: async () => [],
    $executeRaw: async () => 0,
    payrollFormulaSettings: {
      findMany: async () => [
        {
          fourPlusLevelWeightsJson: toStoredPayrollFormulaSettingsJson({
            fourPlusFundPercent: 40,
            fourPlusWeights: {
              level_1: 4,
              level_2: 2,
              level_3: 1,
            },
            matrixRules,
          }),
        },
      ],
    },
    service: {
      findMany: async (args?: { where?: { id?: { in?: string[] }; name?: unknown } }) => {
        if (args?.where?.id?.in) {
          return args.where.id.in.map((id) => ({ id, name: "Шиномонтаж" }));
        }

        if (args?.where?.name) {
          return [{ id: "service-main", name: "Шиномонтаж" }];
        }

        return [{ id: "service-main" }];
      },
      createMany: async () => ({ count: 0 }),
    },
    servicePricingMetadata: {
      findMany: async () => [],
      createMany: async () => ({ count: 0 }),
    },
    salaryRule: {
      findMany: async () => [],
      createMany: async () => ({ count: 0 }),
    },
    order: {
      findFirst: async () => null,
      findFirstOrThrow: async () => {
        throw new Error("Existing-order path is outside this snapshot test.");
      },
      create: async ({ data }: { data: Record<string, unknown> }) => data,
      update: async ({ data }: { data: Record<string, unknown> }) => data,
    },
    employee: {
      findFirst: async ({ where }: { where: { id?: string } }) => {
        if (where.id !== "employee-outside-shift") {
          return null;
        }

        return {
          id: "employee-outside-shift",
          firstName: "Алексей",
          lastName: "Разовый",
          phone: "79990000000",
          skillLevel: "level_1",
          workPercent: { toString: () => "100" },
        };
      },
      findMany: async ({ where }: { where: { id?: { in?: string[] } } }) => {
        const ids = where.id?.in ?? [];

        return ids
          .filter((id) => id === "employee-outside-shift")
          .map((id) => ({
            id,
            firstName: "Алексей",
            lastName: "Разовый",
            phone: "79990000000",
            skillLevel: "level_1",
            workPercent: { toString: () => "100" },
          }));
      },
    },
    shift: {
      findFirst: async ({ where }: { where: { id?: string; branchId?: string } }) => {
        if (where.id !== "shift-1" || where.branchId !== "branch-1") {
          return null;
        }

        return {
          id: "shift-1",
          staff: [
            {
              employeeId: "employee-shift",
              employeeNameSnapshot: "Иван И.",
              workPercentSnapshot: { toString: () => "100" },
              shiftMinimumSnapshot: { toString: () => "0" },
              skillLevelSnapshot: "level_1",
              arrivedAt: null,
              leftAt: null,
            },
          ],
        };
      },
    },
    orderLine: {
      createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
        orderLineBatches.push(data);
        return { count: data.length };
      },
      deleteMany: async () => ({ count: 0 }),
      findMany: async () => [],
    },
    orderExecutor: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        orderExecutorRows.push(data);
        return data;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => data,
    },
    payment: {
      create: async ({ data }: { data: Record<string, unknown> }) => data,
      deleteMany: async () => ({ count: 0 }),
    },
    orderPayrollPayout: {
      count: async () => 0,
      createMany: async () => ({ count: 0 }),
    },
    orderPayrollAccrual: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: data.id }),
    },
    paymentAccount: {
      findFirst: async () => null,
    },
  };

  return {
    tx,
    orderLineBatches,
    orderExecutorRows,
  };
}

test("order write snapshots editable matrixRules for marked Stage 2.2 matrix services", async () => {
  const customMatrixRules = STAGE22_XLSX_MATRIX_RULES.map((rule) =>
    rule.key === "level_1+level_2"
      ? {
          ...rule,
          sharesBasisPoints: [1800, 1700],
        }
      : rule,
  );
  const fake = createOrderWriteFakePrisma(customMatrixRules);
  const originalTransaction = prisma.$transaction.bind(prisma);
  const originalOrderFindFirst = prisma.order.findFirst.bind(prisma.order);
  const writablePrisma = prisma as unknown as {
    $transaction: <T>(callback: (transaction: typeof fake.tx) => Promise<T>) => Promise<T>;
    order: {
      findFirst: () => Promise<null>;
    };
  };

  try {
    writablePrisma.$transaction = async <T>(
      callback: (transaction: typeof fake.tx) => Promise<T>,
    ) => callback(fake.tx);
    writablePrisma.order.findFirst = async () => null;

    await createOrderForBranch(
      "branch-1",
      draftOrder(
        cartLine({
          ruleType: "percent_of_work",
          percent: 50,
          fixedAmount: 0,
          perUnitAmount: 0,
          usesCostPrice: false,
          reducedEmployeePercentEnabled: false,
          reducedEmployeePercentValue: 0,
          stage22PayrollRule: { type: "matrix" },
        }),
      ),
    );
  } finally {
    writablePrisma.$transaction = originalTransaction as typeof writablePrisma.$transaction;
    writablePrisma.order.findFirst = originalOrderFindFirst as typeof writablePrisma.order.findFirst;
  }

  expect(fake.orderLineBatches).toHaveLength(1);
  expect(fake.orderLineBatches[0]).toHaveLength(1);

  const salaryRuleSnapshotJson = fake.orderLineBatches[0][0].salaryRuleSnapshotJson;

  expect(salaryRuleSnapshotJson).toEqual(
    expect.objectContaining({
      stage22PayrollRule: expect.objectContaining({
        type: "matrix",
        fourPlusFundPercent: 40,
        fourPlusWeights: {
          level_1: 4,
          level_2: 2,
          level_3: 1,
        },
        matrixRules: customMatrixRules,
      }),
    }),
  );
});

test("order write snapshots order-line cost override for profit payroll", async () => {
  const fake = createOrderWriteFakePrisma(STAGE22_XLSX_MATRIX_RULES);
  const originalTransaction = prisma.$transaction.bind(prisma);
  const originalOrderFindFirst = prisma.order.findFirst.bind(prisma.order);
  const writablePrisma = prisma as unknown as {
    $transaction: <T>(callback: (transaction: typeof fake.tx) => Promise<T>) => Promise<T>;
    order: {
      findFirst: () => Promise<null>;
    };
  };

  try {
    writablePrisma.$transaction = async <T>(
      callback: (transaction: typeof fake.tx) => Promise<T>,
    ) => callback(fake.tx);
    writablePrisma.order.findFirst = async () => null;

    await createOrderForBranch(
      "branch-1",
      draftOrder(
        cartLine(
          {
            ruleType: "percent_of_profit",
            percent: 40,
            fixedAmount: 0,
            perUnitAmount: 0,
            usesCostPrice: true,
            reducedEmployeePercentEnabled: false,
            reducedEmployeePercentValue: 0,
          },
          {
            serviceId: "service-profit",
            serviceName: "Шины/диски с витрины",
            serviceNameSnapshot: "Шины/диски с витрины",
            unitPrice: 12000,
            costPrice: 8000,
          },
        ),
      ),
    );
  } finally {
    writablePrisma.$transaction = originalTransaction as typeof writablePrisma.$transaction;
    writablePrisma.order.findFirst = originalOrderFindFirst as typeof writablePrisma.order.findFirst;
  }

  expect(fake.orderLineBatches).toHaveLength(1);
  expect(fake.orderLineBatches[0][0].costPriceSnapshot?.toString()).toBe("8000");
});

test("order write allows one-off executor outside shift staff without adding shift staff", async () => {
  const fake = createOrderWriteFakePrisma(STAGE22_XLSX_MATRIX_RULES);
  const originalTransaction = prisma.$transaction.bind(prisma);
  const originalOrderFindFirst = prisma.order.findFirst.bind(prisma.order);
  const writablePrisma = prisma as unknown as {
    $transaction: <T>(callback: (transaction: typeof fake.tx) => Promise<T>) => Promise<T>;
    order: {
      findFirst: () => Promise<null>;
    };
  };
  const order = draftOrder(
    cartLine({
      ruleType: "percent_of_work",
      percent: 50,
      fixedAmount: 0,
      perUnitAmount: 0,
      usesCostPrice: false,
      reducedEmployeePercentEnabled: false,
      reducedEmployeePercentValue: 0,
    }),
  );

  try {
    writablePrisma.$transaction = async <T>(
      callback: (transaction: typeof fake.tx) => Promise<T>,
    ) => callback(fake.tx);
    writablePrisma.order.findFirst = async () => null;

    await createOrderForBranch("branch-1", {
      ...order,
      status: "Выполнен",
      executorEmployeeId: "employee-outside-shift",
      executorNameSnapshot: "Алексей Р.",
      executorEmployeeIds: ["employee-outside-shift"],
      shiftId: "shift-1",
      shiftLabelSnapshot: "Смена №1",
      shiftOpenedAtSnapshot: "2026-05-20T08:00:00.000Z",
    });
  } finally {
    writablePrisma.$transaction = originalTransaction as typeof writablePrisma.$transaction;
    writablePrisma.order.findFirst = originalOrderFindFirst as typeof writablePrisma.order.findFirst;
  }

  expect(fake.orderExecutorRows).toHaveLength(1);
  expect(fake.orderExecutorRows[0]).toEqual(expect.objectContaining({
    employeeId: "employee-outside-shift",
    employeeNameSnapshot: "Алексей Р.",
    skillLevelSnapshot: "level_1",
  }));
});

test("order write rejects Russian plate body without region", async () => {
  const fake = createOrderWriteFakePrisma(STAGE22_XLSX_MATRIX_RULES);
  const originalTransaction = prisma.$transaction.bind(prisma);
  const originalOrderFindFirst = prisma.order.findFirst.bind(prisma.order);
  const writablePrisma = prisma as unknown as {
    $transaction: <T>(callback: (transaction: typeof fake.tx) => Promise<T>) => Promise<T>;
    order: {
      findFirst: () => Promise<null>;
    };
  };
  const order = draftOrder(
    cartLine({
      ruleType: "percent_of_work",
      percent: 50,
      fixedAmount: 0,
      perUnitAmount: 0,
      usesCostPrice: false,
      reducedEmployeePercentEnabled: false,
      reducedEmployeePercentValue: 0,
    }),
  );

  try {
    writablePrisma.$transaction = async <T>(
      callback: (transaction: typeof fake.tx) => Promise<T>,
    ) => callback(fake.tx);
    writablePrisma.order.findFirst = async () => null;

    await expect(
      createOrderForBranch("branch-1", {
        ...order,
        client: {
          ...order.client,
          carBrand: "Lada",
          carModel: "Vesta",
          plateNumber: "А021КХ",
        },
      }),
    ).rejects.toThrow("Укажите регион номера.");
  } finally {
    writablePrisma.$transaction = originalTransaction as typeof writablePrisma.$transaction;
    writablePrisma.order.findFirst = originalOrderFindFirst as typeof writablePrisma.order.findFirst;
  }
});
