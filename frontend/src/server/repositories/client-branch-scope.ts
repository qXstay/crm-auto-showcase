import type { Prisma } from "@/server/db/prisma-client";

export function buildClientBranchScopeWhere(branchId: string): Prisma.ClientWhereInput {
  return {
    OR: [
      { orders: { some: { branchId } } },
      { bookings: { some: { branchId } } },
      { storageRecords: { some: { branchId } } },
      {
        orders: { none: {} },
        bookings: { none: {} },
        storageRecords: { none: {} },
      },
    ],
  };
}

export const CLIENT_BRANCH_VEHICLE_VISIBILITY_INCLUDE = {
  vehicles: true,
  orders: {
    select: {
      branchId: true,
      vehicleId: true,
    },
  },
  bookings: {
    select: {
      branchId: true,
      vehicleId: true,
    },
  },
  storageRecords: {
    select: {
      branchId: true,
      vehicleId: true,
    },
  },
} satisfies Prisma.ClientInclude;

type BranchVisibleVehicle = {
  id: string;
};

type BranchVehicleRelation = {
  branchId: string;
  vehicleId: string | null;
};

type BranchVehicleVisibilityRecord<TVehicle extends BranchVisibleVehicle> = {
  vehicles: TVehicle[];
  orders: BranchVehicleRelation[];
  bookings: BranchVehicleRelation[];
  storageRecords: BranchVehicleRelation[];
};

export function getBranchVisibleClientVehicles<TVehicle extends BranchVisibleVehicle>(
  record: BranchVehicleVisibilityRecord<TVehicle>,
  branchId?: string,
) {
  if (!branchId) {
    return record.vehicles;
  }

  const orders = record.orders.filter((order) => order.branchId === branchId);
  const bookings = record.bookings.filter((booking) => booking.branchId === branchId);
  const storageRecords = record.storageRecords.filter((item) => item.branchId === branchId);
  const hasAnyBranchRelations =
    record.orders.length > 0 ||
    record.bookings.length > 0 ||
    record.storageRecords.length > 0;
  const visibleVehicleIds = new Set(
    [...orders, ...bookings, ...storageRecords]
      .map((item) => item.vehicleId)
      .filter((vehicleId): vehicleId is string => Boolean(vehicleId)),
  );
  const linkedVehicleIds = new Set(
    [...record.orders, ...record.bookings, ...record.storageRecords]
      .map((item) => item.vehicleId)
      .filter((vehicleId): vehicleId is string => Boolean(vehicleId)),
  );

  return hasAnyBranchRelations
    ? record.vehicles.filter(
        (vehicle) => visibleVehicleIds.has(vehicle.id) || !linkedVehicleIds.has(vehicle.id),
      )
    : record.vehicles;
}
