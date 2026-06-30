import type { Radius, VehicleTypeId } from "@/features/pricing/types";

export const VEHICLE_TYPES: Array<{
  id: VehicleTypeId;
  label: string;
}> = [
  { id: "passenger", label: "Легковой" },
  { id: "suv", label: "SUV" },
  { id: "offroad", label: "Внедорожник" },
  { id: "commercial", label: "Коммерческий" },
];

export const RADII: Radius[] = [
  "R13",
  "R14",
  "R15",
  "R16",
  "R17",
  "R18",
  "R19",
  "R20",
  "R21",
  "R22",
  "R23",
];

const rubFormatter = new Intl.NumberFormat("ru-RU");

export function formatPrice(value: number): string {
  return `${rubFormatter.format(value)} ₽`;
}
