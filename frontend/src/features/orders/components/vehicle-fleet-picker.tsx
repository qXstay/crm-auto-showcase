"use client";

import { useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { formatPlateForDisplay } from "@/features/clients/client-contract";
import type { ClientVehicle } from "@/features/clients/types";

const COLLAPSED_VEHICLES_LIMIT = 5;

export function getVehicleFleetLabel(vehicle: ClientVehicle) {
  const brandModel = [vehicle.brand, vehicle.model].filter(Boolean).join(" ").trim();
  const plate = formatPlateForDisplay(vehicle.plateNumber);
  const bits = [brandModel || null, plate || null].filter(Boolean);

  return bits.length > 0 ? bits.join(" · ") : "Не указан";
}

type VehicleFleetPickerProps = {
  vehicles: ClientVehicle[];
  selectedVehicleId: string | null;
  onSelectVehicle: (vehicle: ClientVehicle) => void;
  onAddVehicle: () => void;
  addLabel: string;
  addIcon?: ReactNode;
  className?: string;
};

export function VehicleFleetPicker({
  vehicles,
  selectedVehicleId,
  onSelectVehicle,
  onAddVehicle,
  addLabel,
  addIcon,
  className,
}: VehicleFleetPickerProps) {
  const [expanded, setExpanded] = useState(false);
  const shouldCollapse = vehicles.length > COLLAPSED_VEHICLES_LIMIT;
  const visibleVehicles = useMemo(() => {
    if (!shouldCollapse || expanded) {
      return vehicles;
    }

    const selectedVehicle = selectedVehicleId
      ? vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null
      : null;
    const nextVehicles: ClientVehicle[] = [];

    if (selectedVehicle) {
      nextVehicles.push(selectedVehicle);
    }

    for (const vehicle of vehicles) {
      if (nextVehicles.length >= COLLAPSED_VEHICLES_LIMIT) {
        break;
      }

      if (vehicle.id === selectedVehicle?.id) {
        continue;
      }

      nextVehicles.push(vehicle);
    }

    return nextVehicles;
  }, [expanded, selectedVehicleId, shouldCollapse, vehicles]);
  const hiddenCount = Math.max(vehicles.length - visibleVehicles.length, 0);

  return (
    <div className={clsx("flex flex-wrap items-center gap-1.5", className)}>
      {visibleVehicles.map((vehicle) => {
        const active = selectedVehicleId === vehicle.id;
        const label = getVehicleFleetLabel(vehicle);

        return (
          <button
            key={vehicle.id}
            type="button"
            onClick={() => onSelectVehicle(vehicle)}
            title={label}
            className={clsx(
              "inline-flex h-8 max-w-full items-center border px-2.5 text-[12px] font-medium leading-4 transition-colors sm:max-w-[220px]",
              active
                ? "border-[color:var(--primary)] bg-[color:var(--primary)]/5 text-[color:var(--primary)]"
                : "border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:border-[color:var(--primary)]/50",
            )}
          >
            <span className="truncate">{label}</span>
          </button>
        );
      })}

      {shouldCollapse ? (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="inline-flex h-8 items-center border border-[color:var(--border)] bg-white px-2.5 text-[12px] font-medium text-[color:var(--muted)] transition-colors hover:border-[color:var(--primary)]/50 hover:text-[color:var(--primary)]"
          aria-expanded={expanded}
        >
          {expanded ? "Скрыть" : `+ ещё ${hiddenCount}`}
        </button>
      ) : null}

      <button
        type="button"
        onClick={onAddVehicle}
        className={clsx(
          "inline-flex h-8 items-center gap-1.5 border border-dashed px-2.5 text-[12px] font-medium transition-colors",
          selectedVehicleId === null
            ? "border-[color:var(--primary)] bg-[color:var(--primary)]/5 text-[color:var(--primary)]"
            : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]",
        )}
      >
        {addIcon}
        {addLabel}
      </button>
    </div>
  );
}
