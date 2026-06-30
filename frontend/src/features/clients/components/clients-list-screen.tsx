"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { formatPlateForDisplay, normalizePlate } from "@/features/clients/client-contract";
import type { DemoClient } from "@/features/clients/types";

type ClientsListScreenProps = {
  initialClients: DemoClient[];
};

function matchesQuery(client: DemoClient, query: string) {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();
  const normalizedPlateQuery = normalizePlate(query);
  const haystack = [
    client.name,
    client.firstName,
    client.lastName,
    client.middleName,
    client.phone,
    client.registrationDate,
    client.lastVisitDate,
    client.source,
    ...client.vehicles.flatMap((vehicle) => [
      vehicle.label,
      vehicle.brand,
      vehicle.model,
      vehicle.plateNumber,
      formatPlateForDisplay(vehicle.plateNumber),
    ]),
  ]
    .join(" ")
    .toLowerCase();

  return (
    haystack.includes(normalizedQuery) ||
    Boolean(
      normalizedPlateQuery &&
        client.vehicles.some((vehicle) => normalizePlate(vehicle.plateNumber).includes(normalizedPlateQuery)),
    )
  );
}

function getClientNameLabel(client: DemoClient) {
  return client.name || "Клиент без имени";
}

function getClientVehicleSummary(client: DemoClient) {
  if (client.vehicles.length === 0) {
    return "Авто не указано";
  }

  const firstVehicle = client.vehicles[0];
  const brandModel = [firstVehicle.brand, firstVehicle.model].filter(Boolean).join(" ").trim();
  const plate = formatPlateForDisplay(firstVehicle.plateNumber);
  const firstLabel = [brandModel || "Не указан", plate || null].filter(Boolean).join(" · ");
  const extraCount = client.vehicles.length > 1 ? ` +${client.vehicles.length - 1}` : "";

  return `${firstLabel}${extraCount}`;
}

function getClientVehicleName(client: DemoClient) {
  const vehicle = client.vehicles[0] ?? null;
  const brandModel = [vehicle?.brand, vehicle?.model].filter(Boolean).join(" ").trim();
  const extraCount = client.vehicles.length > 1 ? ` +${client.vehicles.length - 1}` : "";

  return `${brandModel || "Не указан"}${extraCount}`;
}

function getClientVehiclePlate(client: DemoClient) {
  const plate = formatPlateForDisplay(client.vehicles[0]?.plateNumber);

  return plate || "Не указан";
}

export function ClientsListScreen({ initialClients }: ClientsListScreenProps) {
  const [query, setQuery] = useState("");
  const filteredClients = useMemo(
    () => initialClients.filter((client) => matchesQuery(client, query)),
    [initialClients, query],
  );

  return (
    <section className="w-full min-w-0 space-y-2">
      <div className="flex items-center justify-between px-1 py-1">
        <h1 className="text-[19px] font-semibold text-[color:var(--primary)]">Клиенты</h1>
      </div>

      <div className="bg-white">
        <div className="flex flex-col gap-2.5 border-b border-[color:var(--border)] px-3 py-3 lg:flex-row lg:items-center lg:gap-4">
          <p className="text-[16px] font-medium text-[color:var(--foreground)]">
            {filteredClients.length} клиентов найдено
          </p>
          <label className="w-full lg:w-[258px]">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по гос. номеру, ФИО и телефону"
              className="h-9 w-full border border-[color:var(--border)] bg-white px-3 text-[13px] text-[color:var(--foreground)] outline-none placeholder:text-[color:var(--muted)] focus:border-[color:var(--primary)]"
            />
          </label>
        </div>

        <div className="divide-y divide-[color:var(--border)] sm:hidden">
          {filteredClients.length > 0 ? (
            filteredClients.map((client) => {
              return (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="block bg-white px-3 py-3 transition-colors hover:bg-[color:var(--background)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[16px] font-medium leading-6 text-[color:var(--foreground)]">
                        {getClientNameLabel(client)}
                      </div>
                      <div className="mt-0.5 text-[14px] leading-5 text-[color:var(--muted)]">
                        {client.phone || "Не указан"}
                      </div>
                    </div>
                    <div className={clsx(
                      "shrink-0 text-right text-[13px] font-medium leading-5",
                      client.ordersCount ? "text-[color:var(--primary)]" : "text-[color:var(--muted)]"
                    )}>
                      {client.ordersCount ? `${client.ordersCount} зак.` : "—"}
                    </div>
                  </div>

                  <div className="mt-1.5 text-[13px] leading-5 text-[color:var(--muted)]">
                    {getClientVehicleSummary(client)}
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="px-3 py-12 text-center">
              <div className="text-[15px] text-[color:var(--muted)]">Нет данных</div>
              <div className="mt-1 text-[13px] text-[color:var(--muted)]">
                {query.trim()
                  ? "Попробуйте изменить строку поиска."
                  : "Список клиентов пока пуст."}
              </div>
            </div>
          )}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <div className="min-w-[940px]">
            <div className="grid grid-cols-[minmax(180px,1.3fr)_minmax(150px,1fr)_minmax(190px,1.25fr)_minmax(138px,0.85fr)_84px_minmax(150px,1fr)] border-b border-[color:var(--border)] px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-[color:var(--muted)]">
              <span>ФИО</span>
              <span>Телефон</span>
              <span>Автомобили</span>
              <span>Дата регистрации</span>
              <span>Записей</span>
              <span>Последняя запись</span>
            </div>

            <div className="divide-y divide-[color:var(--border)]">
              {filteredClients.length > 0 ? (
                filteredClients.map((client) => (
                  <Link
                    key={client.id}
                    href={`/clients/${client.id}`}
                    className="grid grid-cols-[minmax(180px,1.3fr)_minmax(150px,1fr)_minmax(190px,1.25fr)_minmax(138px,0.85fr)_84px_minmax(150px,1fr)] items-center px-3 py-2.5 text-[14px] leading-5 text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--background)]">
                    <span className="truncate font-medium">{getClientNameLabel(client)}</span>
                    <span className="truncate">{client.phone || "Не указан"}</span>
                    <span className="min-w-0 pr-3">
                      <span className="block truncate">{getClientVehicleName(client)}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-[color:var(--muted)]">
                        Госномер: {getClientVehiclePlate(client)}
                      </span>
                    </span>
                    <span className="truncate">{client.registrationDate}</span>
                    {/* Записей — синее если > 0 */}
                    <span className={client.ordersCount ? "font-medium text-[color:var(--primary)]" : "text-[color:var(--muted)]"}>
                      {client.ordersCount || "—"}
                    </span>
                    <span className="truncate pr-3">{client.lastVisitDate || "—"}</span>
                  </Link>
                ))

              ) : (
                <div className="px-3 py-12 text-center">
                  <div className="text-[15px] text-[color:var(--muted)]">Нет данных</div>
                  <div className="mt-1 text-[13px] text-[color:var(--muted)]">
                    {query.trim()
                      ? "Попробуйте изменить строку поиска."
                      : "Список клиентов пока пуст."}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
