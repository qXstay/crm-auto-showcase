import type {
  PriceMatrix,
  PricingSnapshot,
  Radius,
  SalaryRuleSnapshot,
  VehicleTypeId,
} from "@/features/pricing/types";
import type { DemoOrderLineAccrualSnapshot } from "@/features/orders/salary";

export type BranchId = "severny" | "schorsa-7" | "pobedy-14";

export type ClientId =
  | "anonymous"
  | "denis-pavlov"
  | "natalya-orlova"
  | "boris-zelen"
  | "anna-sokolova"
  | "sergey-volkov";

export type { Radius, VehicleTypeId };

export type ServiceCategoryId = "main" | "repair" | "disks" | "extra";

export type SegmentOption<T extends string> = {
  id: T;
  label: string;
  hint?: string;
};

export type Branch = SegmentOption<BranchId>;

export type Client = SegmentOption<ClientId>;

export type VehicleType = SegmentOption<VehicleTypeId>;

export type ServiceCategory = {
  id: ServiceCategoryId;
  label: string;
  description: string;
};

export type { PriceMatrix };

export type ServicePricing =
  | {
      kind: "matrix";
      matrix: PriceMatrix;
    }
  | {
      kind: "fixed";
      price: number;
    };

export type Service = {
  id: string;
  categoryId: ServiceCategoryId;
  name: string;
  description: string;
  pricing: ServicePricing;
};

export type CartItem = {
  key: string;
  serviceId: string;
  serviceName: string;
  serviceNameSnapshot: string;
  vehicleType: VehicleTypeId;
  vehicleLabel: string;
  radius: Radius;
  lowProfile: boolean;
  runflat: boolean;
  unitPrice: number;
  quantity: number;
  pricingSnapshot: PricingSnapshot;
  salaryRuleSnapshot: SalaryRuleSnapshot | null;
  costPrice: number | null;
  salaryAccrualSnapshot: DemoOrderLineAccrualSnapshot | null;
};
