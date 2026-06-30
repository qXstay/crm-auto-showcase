-- AlterTable
ALTER TABLE "ShiftStaff"
ADD COLUMN "arrivedAt" TIMESTAMP(3),
ADD COLUMN "leftAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "OrderExecutor" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeNameSnapshot" TEXT NOT NULL,
    "skillLevelSnapshot" TEXT,
    "workPercentSnapshot" DECIMAL(10,2),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderExecutor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollFormulaSettings" (
    "id" TEXT NOT NULL,
    "fourPlusLevelWeightsJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollFormulaSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPayrollAccrual" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "shiftId" TEXT,
    "status" TEXT NOT NULL,
    "statusReason" TEXT,
    "paymentAmountSnapshot" DECIMAL(10,2) NOT NULL,
    "payrollBaseAmount" DECIMAL(10,2) NOT NULL,
    "salaryFundAmount" DECIMAL(10,2),
    "calculationSnapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderPayrollAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPayrollPayout" (
    "id" TEXT NOT NULL,
    "accrualId" TEXT NOT NULL,
    "orderExecutorId" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeNameSnapshot" TEXT NOT NULL,
    "skillLevelSnapshot" TEXT,
    "sharePercent" DECIMAL(10,2),
    "weight" DECIMAL(10,2),
    "basisLabel" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderPayrollPayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderExecutor_orderId_idx" ON "OrderExecutor"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPayrollAccrual_paymentId_key" ON "OrderPayrollAccrual"("paymentId");

-- CreateIndex
CREATE INDEX "OrderPayrollAccrual_orderId_idx" ON "OrderPayrollAccrual"("orderId");

-- CreateIndex
CREATE INDEX "OrderPayrollAccrual_shiftId_idx" ON "OrderPayrollAccrual"("shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderPayrollPayout_accrualId_orderExecutorId_key" ON "OrderPayrollPayout"("accrualId", "orderExecutorId");

-- CreateIndex
CREATE INDEX "OrderPayrollPayout_employeeId_idx" ON "OrderPayrollPayout"("employeeId");

-- AddForeignKey
ALTER TABLE "OrderExecutor"
ADD CONSTRAINT "OrderExecutor_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderExecutor"
ADD CONSTRAINT "OrderExecutor_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayrollAccrual"
ADD CONSTRAINT "OrderPayrollAccrual_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayrollAccrual"
ADD CONSTRAINT "OrderPayrollAccrual_paymentId_fkey"
FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayrollAccrual"
ADD CONSTRAINT "OrderPayrollAccrual_shiftId_fkey"
FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayrollPayout"
ADD CONSTRAINT "OrderPayrollPayout_accrualId_fkey"
FOREIGN KEY ("accrualId") REFERENCES "OrderPayrollAccrual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayrollPayout"
ADD CONSTRAINT "OrderPayrollPayout_orderExecutorId_fkey"
FOREIGN KEY ("orderExecutorId") REFERENCES "OrderExecutor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayrollPayout"
ADD CONSTRAINT "OrderPayrollPayout_employeeId_fkey"
FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
