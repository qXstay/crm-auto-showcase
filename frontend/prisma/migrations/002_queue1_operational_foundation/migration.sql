-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "categoryKey" TEXT NOT NULL,
    "categoryLabelSnapshot" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serviceType" TEXT NOT NULL,
    "pricingMode" TEXT NOT NULL,
    "priceType" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ServicePricingMetadata" (
    "serviceId" TEXT NOT NULL,
    "fixedPrice" DECIMAL(10,2),
    "priceFrom" DECIMAL(10,2),
    "matrixPricesJson" JSONB NOT NULL,
    "modifierEnabledJson" JSONB NOT NULL,
    "modifierMatrixPricesJson" JSONB NOT NULL,
    "modifierExplicitlyClearedJson" JSONB NOT NULL,
    "priceBandsJson" JSONB NOT NULL,
    "displayPriceLabelOverride" TEXT,
    "costPrice" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServicePricingMetadata_pkey" PRIMARY KEY ("serviceId")
);

CREATE TABLE "SalaryRule" (
    "serviceId" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "salaryPercent" DECIMAL(10,2),
    "salaryFixedAmount" DECIMAL(10,2),
    "salaryPerUnitAmount" DECIMAL(10,2),
    "usesCostPrice" BOOLEAN NOT NULL DEFAULT false,
    "reducedEmployeePercentEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reducedEmployeePercentValue" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalaryRule_pkey" PRIMARY KEY ("serviceId")
);

CREATE TABLE "BranchServicePricingOverride" (
    "branchId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "fixedPrice" DECIMAL(10,2),
    "priceFrom" DECIMAL(10,2),
    "matrixPricesJson" JSONB,
    "modifierEnabledJson" JSONB,
    "modifierMatrixPricesJson" JSONB,
    "modifierExplicitlyClearedJson" JSONB,
    "priceBandsJson" JSONB,
    "displayPriceLabelOverride" TEXT,
    "costPrice" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BranchServicePricingOverride_pkey" PRIMARY KEY ("branchId","serviceId")
);

CREATE TABLE "BranchSalaryRuleOverride" (
    "branchId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "ruleType" TEXT,
    "salaryPercent" DECIMAL(10,2),
    "salaryFixedAmount" DECIMAL(10,2),
    "salaryPerUnitAmount" DECIMAL(10,2),
    "usesCostPrice" BOOLEAN,
    "reducedEmployeePercentEnabled" BOOLEAN,
    "reducedEmployeePercentValue" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BranchSalaryRuleOverride_pkey" PRIMARY KEY ("branchId","serviceId")
);

CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "middleName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "source" TEXT,
    "note" TEXT,
    "registeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "radius" TEXT NOT NULL,
    "totalSpent" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "openedByEmployeeId" TEXT,
    "staffLabelSnapshot" TEXT,
    "expensesItemsJson" JSONB NOT NULL,
    "ordersCountSnapshot" INTEGER,
    "revenueTotalSnapshot" DECIMAL(10,2),
    "cashTotalSnapshot" DECIMAL(10,2),
    "cashlessTotalSnapshot" DECIMAL(10,2),
    "expensesTotalSnapshot" DECIMAL(10,2),
    "salaryFundTotalSnapshot" DECIMAL(10,2),
    "accountBreakdownSnapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ShiftStaff" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeNameSnapshot" TEXT NOT NULL,
    "workPercentSnapshot" DECIMAL(10,2),
    "shiftMinimumSnapshot" DECIMAL(10,2),
    "skillLevelSnapshot" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ShiftStaff_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "clientId" TEXT,
    "vehicleId" TEXT,
    "shiftId" TEXT,
    "executorEmployeeId" TEXT,
    "vehicleType" TEXT NOT NULL,
    "radius" TEXT NOT NULL,
    "lowProfile" BOOLEAN NOT NULL DEFAULT false,
    "runflat" BOOLEAN NOT NULL DEFAULT false,
    "salaryAccrualTotal" DECIMAL(10,2),
    "subtotal" DECIMAL(10,2),
    "discount" DECIMAL(10,2),
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "servicesCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "clientSnapshotJson" JSONB NOT NULL,
    "vehicleSnapshotJson" JSONB,
    "executorSnapshotJson" JSONB,
    "shiftSnapshotJson" JSONB,
    "paymentSnapshotJson" JSONB,
    "totalsSnapshotJson" JSONB,
    "printSnapshotJson" JSONB,
    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "serviceId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "lineTotal" DECIMAL(10,2) NOT NULL,
    "serviceNameSnapshot" TEXT NOT NULL,
    "serviceCategorySnapshot" TEXT,
    "costPriceSnapshot" DECIMAL(10,2),
    "salaryAccrualAmount" DECIMAL(10,2),
    "pricingSnapshotJson" JSONB NOT NULL,
    "salaryRuleSnapshotJson" JSONB,
    "lineContextSnapshotJson" JSONB,
    "salaryAccrualSnapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "accountId" TEXT,
    "paymentMethod" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "paymentSnapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "clientId" TEXT,
    "vehicleId" TEXT,
    "anonymous" BOOLEAN NOT NULL DEFAULT false,
    "clientNameSnapshot" TEXT NOT NULL,
    "phoneSnapshot" TEXT NOT NULL,
    "carSnapshot" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "serviceLabel" TEXT NOT NULL,
    "comment" TEXT,
    "createdByEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientSnapshotJson" JSONB,
    "vehicleSnapshotJson" JSONB,
    "contactSnapshotJson" JSONB,
    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StorageRecord" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "storageNumber" TEXT NOT NULL,
    "clientId" TEXT,
    "vehicleId" TEXT,
    "clientNameSnapshot" TEXT NOT NULL,
    "clientPhoneSnapshot" TEXT NOT NULL,
    "carBrandSnapshot" TEXT NOT NULL,
    "carModelSnapshot" TEXT NOT NULL,
    "plateNumberSnapshot" TEXT NOT NULL,
    "itemLabelSnapshot" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "warehouseId" TEXT,
    "warehouseName" TEXT NOT NULL,
    "shelfLabel" TEXT NOT NULL,
    "cellLabel" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    "note" TEXT,
    "clientSnapshotJson" JSONB,
    "vehicleSnapshotJson" JSONB,
    "itemSnapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StorageRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Service_categoryKey_sortOrder_idx" ON "Service"("categoryKey", "sortOrder");
CREATE INDEX "Service_isActive_idx" ON "Service"("isActive");
CREATE INDEX "Client_phone_idx" ON "Client"("phone");
CREATE INDEX "Vehicle_clientId_idx" ON "Vehicle"("clientId");
CREATE UNIQUE INDEX "Shift_branchId_number_key" ON "Shift"("branchId", "number");
CREATE INDEX "Shift_branchId_status_openedAt_idx" ON "Shift"("branchId", "status", "openedAt");
CREATE INDEX "ShiftStaff_shiftId_idx" ON "ShiftStaff"("shiftId");
CREATE UNIQUE INDEX "Order_branchId_number_key" ON "Order"("branchId", "number");
CREATE INDEX "Order_branchId_status_createdAt_idx" ON "Order"("branchId", "status", "createdAt");
CREATE INDEX "Order_shiftId_createdAt_idx" ON "Order"("shiftId", "createdAt");
CREATE INDEX "OrderLine_orderId_sortOrder_idx" ON "OrderLine"("orderId", "sortOrder");
CREATE INDEX "Payment_orderId_paidAt_idx" ON "Payment"("orderId", "paidAt");
CREATE INDEX "Booking_branchId_dateKey_startTime_idx" ON "Booking"("branchId", "dateKey", "startTime");
CREATE INDEX "Booking_groupId_idx" ON "Booking"("groupId");
CREATE UNIQUE INDEX "StorageRecord_branchId_storageNumber_key" ON "StorageRecord"("branchId", "storageNumber");
CREATE INDEX "StorageRecord_branchId_status_acceptedAt_idx" ON "StorageRecord"("branchId", "status", "acceptedAt");

ALTER TABLE "ServicePricingMetadata" ADD CONSTRAINT "ServicePricingMetadata_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalaryRule" ADD CONSTRAINT "SalaryRule_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchServicePricingOverride" ADD CONSTRAINT "BranchServicePricingOverride_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchServicePricingOverride" ADD CONSTRAINT "BranchServicePricingOverride_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchSalaryRuleOverride" ADD CONSTRAINT "BranchSalaryRuleOverride_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BranchSalaryRuleOverride" ADD CONSTRAINT "BranchSalaryRuleOverride_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_openedByEmployeeId_fkey" FOREIGN KEY ("openedByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ShiftStaff" ADD CONSTRAINT "ShiftStaff_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftStaff" ADD CONSTRAINT "ShiftStaff_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_executorEmployeeId_fkey" FOREIGN KEY ("executorEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_createdByEmployeeId_fkey" FOREIGN KEY ("createdByEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StorageRecord" ADD CONSTRAINT "StorageRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StorageRecord" ADD CONSTRAINT "StorageRecord_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StorageRecord" ADD CONSTRAINT "StorageRecord_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
