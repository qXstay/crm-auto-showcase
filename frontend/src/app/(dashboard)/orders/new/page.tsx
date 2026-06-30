"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, Search } from "lucide-react";
import {
  formatAuthPhoneDisplay,
  formatAuthPhoneInput,
  normalizeAuthPhoneInput,
} from "@/features/auth/storage";
import {
  getClientContractState,
  normalizeInn,
  normalizePlate,
  validateInn,
} from "@/features/clients/client-contract";
import {
  buildSamePlateConfirmationKey,
  coerceClientDuplicateConflict,
  findClientPhoneDuplicate,
  findClientPlateDuplicate,
  type ClientDuplicateConflict,
} from "@/features/clients/client-dedup";
import { createClientViaApi, fetchClientsStore } from "@/features/clients/repository";
import type { DemoClient, DemoClientsStore } from "@/features/clients/types";
import { OrdersTabs } from "@/features/order-draft/components/orders-tabs";
import { buildClientSearchResults } from "@/features/orders/client-search";
import { PlateInput } from "@/features/orders/components/plate-input";
import {
  getVehicleFleetLabel,
  VehicleFleetPicker,
} from "@/features/orders/components/vehicle-fleet-picker";
import { VehicleMakeModelPicker } from "@/features/orders/components/vehicle-make-model-picker";
import {
  clearCurrentDemoOrderId,
  getCurrentDemoOrderId,
  isActiveDemoOrderStatus,
} from "@/features/orders/storage";
import { fetchOrderForEditor } from "@/features/orders/repository";
import type { OrderDraftMode } from "@/features/order-draft/types";
import { isApiRequestError } from "@/lib/api/client";

type NewClientForm = {
  clientType: "individual" | "legal";
  inn: string;
  organizationName: string;
  contractNumber: string;
  fullName: string;
  phone: string;
  carBrand: string;
  carModel: string;
  plateNumber: string;
};

const EMPTY_NEW_CLIENT_FORM: NewClientForm = {
  clientType: "individual",
  inn: "",
  organizationName: "",
  contractNumber: "",
  fullName: "",
  phone: "",
  carBrand: "",
  carModel: "",
  plateNumber: "",
};

function getClientPrimaryVehicle(client: DemoClient) {
  return client.vehicles[0] ?? null;
}

function getVehicleLabel(vehicle: DemoClient["vehicles"][number]) {
  return getVehicleFleetLabel(vehicle);
}

function getExistingClientLabel(clientId: string, clients: DemoClient[]) {
  if (clientId === "anonymous") {
    return "Клиент не выбран (Анонимный)";
  }

  const client = clients.find((item) => item.id === clientId);

  return client ? [client.name, client.phone].filter(Boolean).join(" · ") : "";
}

function DuplicateClientWarning({
  conflict,
  onSelect,
  onConfirm,
  confirmed = false,
}: {
  conflict: ClientDuplicateConflict;
  onSelect: () => void;
  onConfirm?: () => void;
  confirmed?: boolean;
}) {
  const title =
    conflict.kind === "plate"
      ? conflict.requiresConfirmation
        ? "Такой госномер уже есть у другой машины."
        : `Госномер ${conflict.plateNumber} уже есть в базе.`
      : `Телефон ${conflict.phone} уже есть в базе.`;
  const detail =
    conflict.kind === "plate"
      ? conflict.requiresConfirmation
        ? "Можно выбрать существующий автомобиль или создать отдельный."
        : conflict.sameClient
        ? "Выберите существующий автомобиль в автопарке клиента, чтобы не создавать дубль."
        : `Он привязан к клиенту ${conflict.clientName}. Выберите существующего клиента/автомобиль.`
      : `Он привязан к клиенту ${conflict.clientName}. Выберите существующего клиента.`;

  return (
    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] leading-5 text-amber-900">
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5">{detail}</div>
      <button
        type="button"
        onClick={onSelect}
        className="mt-1.5 font-semibold text-[color:var(--primary)] hover:underline"
      >
        Использовать существующего
      </button>
      {conflict.requiresConfirmation && onConfirm ? (
        <button
          type="button"
          onClick={onConfirm}
          className="ml-3 mt-1.5 font-semibold text-[color:var(--primary)] hover:underline"
        >
          {confirmed ? "Отдельный автомобиль подтверждён" : "Создать отдельный"}
        </button>
      ) : null}
    </div>
  );
}

export default function OrdersNewPage() {
  const router = useRouter();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeOrderStatus, setActiveOrderStatus] = useState<"Черновик" | "В работе" | "Ожидает оплаты" | null>(null);
  const [mode, setMode] = useState<OrderDraftMode>("existing");
  const [selectedClientId, setSelectedClientId] = useState("anonymous");
  const [selectedExistingVehicleId, setSelectedExistingVehicleId] = useState<string | null>(null);
  const [existingVehicleDraft, setExistingVehicleDraft] = useState({
    carBrand: "",
    carModel: "",
    plateNumber: "",
  });
  const [anonymousVehicleDraft, setAnonymousVehicleDraft] = useState({
    carBrand: "",
    carModel: "",
  });
  const [searchValue, setSearchValue] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [form, setForm] = useState<NewClientForm>(EMPTY_NEW_CLIENT_FORM);
  const [clientsStore, setClientsStore] = useState<DemoClientsStore>({ clients: [] });
  const [formError, setFormError] = useState("");
  const [serverDuplicateConflict, setServerDuplicateConflict] =
    useState<ClientDuplicateConflict | null>(null);
  const [confirmedSamePlateKey, setConfirmedSamePlateKey] = useState("");

  useEffect(() => {
    router.prefetch("/orders");

    let cancelled = false;

    void Promise.allSettled([
      fetchClientsStore(),
      (async () => {
        const currentOrderId = getCurrentDemoOrderId();

        if (!currentOrderId) {
          return null;
        }

        try {
          const currentOrder = (await fetchOrderForEditor(currentOrderId)).order;

          return isActiveDemoOrderStatus(currentOrder.status)
            ? { id: currentOrder.id, status: currentOrder.status }
            : null;
        } catch {
          clearCurrentDemoOrderId();
          return null;
        }
      })(),
    ]).then(([clientsResult, orderResult]) => {
      if (cancelled) {
        return;
      }

      startTransition(() => {
        if (clientsResult.status === "fulfilled") {
          setClientsStore(clientsResult.value);
        }

        if (orderResult.status === "fulfilled" && orderResult.value) {
          setActiveOrderId(orderResult.value.id);
          setActiveOrderStatus(orderResult.value.status);
        } else {
          setActiveOrderId(null);
          setActiveOrderStatus(null);
        }
      });
    });

    function handleClickOutside(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setSearchValue("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      cancelled = true;
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [router]);

  function openAnonymousOrder() {
    const params = new URLSearchParams({ mode: "anonymous" });
    const carBrand = anonymousVehicleDraft.carBrand.trim();
    const carModel = anonymousVehicleDraft.carModel.trim();

    if (carBrand) {
      params.set("carBrand", carBrand);
    }

    if (carModel) {
      params.set("carModel", carModel);
    }

    router.push(`/orders?${params.toString()}`);
  }

  async function handleContinue() {
    setFormError("");

    if (mode === "anonymous") {
      openAnonymousOrder();
      return;
    }

    if (mode === "existing") {
      if (!selectedClient || !existingVehicleReady) {
        setFormError("Выберите автомобиль клиента или добавьте новый с маркой и госномером.");
        return;
      }

      if (existingVehicleDuplicateConflict && !existingVehicleSamePlateConfirmed) {
        setFormError("Такой госномер уже есть в базе. Выберите существующую запись.");
        return;
      }

      const params = new URLSearchParams({ clientId: selectedClientId });

      if (selectedExistingVehicleId) {
        params.set("vehicleId", selectedExistingVehicleId);
      } else {
        const draftBrand = existingVehicleDraft.carBrand.trim();
        const draftModel = existingVehicleDraft.carModel.trim();
        const draftPlate = normalizePlate(existingVehicleDraft.plateNumber);

        if (draftBrand) {
          params.set("carBrand", draftBrand);
        }

        if (draftModel) {
          params.set("carModel", draftModel);
        }

        if (draftPlate) {
          params.set("plateNumber", draftPlate);
        }

        if (existingVehicleSamePlateConfirmed) {
          params.set("allowSamePlateDifferentVehicle", "1");
        }
      }

      router.push(`/orders?${params.toString()}`);
      return;
    }

    if (newClientDuplicateConflict && !newClientSamePlateConfirmed) {
      setFormError("Такой клиент или автомобиль уже есть в базе. Выберите существующую запись.");
      return;
    }

    const normalizedPhone = normalizeAuthPhoneInput(form.phone);
    const formattedPhone =
      normalizedPhone.length === 10
        ? formatAuthPhoneDisplay(normalizedPhone)
        : "";

    try {
      const createdClient = await createClientViaApi({
        clientKind: form.clientType,
        organizationName: form.organizationName.trim(),
        inn: normalizeInn(form.inn),
        fullName: form.fullName.trim(),
        phone: formattedPhone,
        carBrand: form.carBrand.trim(),
        carModel: form.carModel.trim(),
        plateNumber: normalizePlate(form.plateNumber),
        allowSamePlateDifferentVehicle: newClientSamePlateConfirmed,
      });

      setClientsStore((current) => ({
        clients: [
          createdClient.client,
          ...current.clients.filter((client) => client.id !== createdClient.client.id),
        ],
      }));
      const params = new URLSearchParams({
        clientId: createdClient.client.id,
      });

      if (newClientSamePlateConfirmed) {
        params.set("allowSamePlateDifferentVehicle", "1");
      }

      if (form.clientType === "legal") {
        params.set("clientKind", "legal");
        params.set("organizationName", form.organizationName.trim());

        if (form.inn.trim()) {
          params.set("inn", normalizeInn(form.inn));
        }

        if (form.contractNumber.trim()) {
          params.set("contractNumber", form.contractNumber.trim());
        }
      }

      router.push(`/orders?${params.toString()}`);
    } catch (error) {
      if (isApiRequestError(error) && error.status === 409) {
        const conflict = coerceClientDuplicateConflict(error.payload?.duplicate);

        if (conflict) {
          try {
            setClientsStore(await fetchClientsStore());
          } catch {
            // The server conflict still gives enough data for readable guidance.
          }
          setServerDuplicateConflict(conflict);
        }

        setFormError(error.message);
        return;
      }

      console.error("Не удалось создать клиента перед открытием заказа.", error);
      setFormError(error instanceof Error ? error.message : "Не удалось создать клиента.");
    }
  }

  function updateForm<K extends keyof NewClientForm>(key: K, value: NewClientForm[K]) {
    setFormError("");
    setServerDuplicateConflict(null);
    if (key === "phone" || key === "carBrand" || key === "carModel" || key === "plateNumber") {
      setConfirmedSamePlateKey("");
    }
    setForm((current) => ({
      ...current,
      [key]:
        key === "phone"
          ? (normalizeAuthPhoneInput(value as string) as NewClientForm[K])
          : key === "inn"
            ? (normalizeInn(value as string) as NewClientForm[K])
            : key === "plateNumber"
              ? (normalizePlate(value as string) as NewClientForm[K])
          : value,
    }));
  }

  function handleModeChange(nextMode: OrderDraftMode) {
    if (nextMode === "anonymous") {
      setFormError("");
      setServerDuplicateConflict(null);
      openAnonymousOrder();
      return;
    }

    setFormError("");
    setServerDuplicateConflict(null);
    setMode(nextMode);
    setSelectedExistingVehicleId(null);
    setExistingVehicleDraft({
      carBrand: "",
      carModel: "",
      plateNumber: "",
    });
    setIsDropdownOpen(false);
    setSearchValue("");
  }

  function handleClientSelect(clientId: string, vehicleId?: string | null) {
    setFormError("");
    setServerDuplicateConflict(null);
    setSelectedClientId(clientId);
    const client = clientsStore.clients.find((item) => item.id === clientId);
    setSelectedExistingVehicleId(vehicleId ?? client?.vehicles[0]?.id ?? null);
    setExistingVehicleDraft({
      carBrand: "",
      carModel: "",
      plateNumber: "",
    });
    setIsDropdownOpen(false);
    setSearchValue("");
  }

  function selectDuplicateConflict(conflict: ClientDuplicateConflict) {
    setServerDuplicateConflict(null);
    handleModeChange("existing");
    handleClientSelect(conflict.clientId, conflict.vehicleId);
  }

  function handlePressureCheckQuickOrder() {
    router.push("/orders?mode=anonymous&quickService=pressure-check");
  }

  const filteredClients = buildClientSearchResults(clientsStore.clients, searchValue);
  const selectedClient =
    mode === "existing" && selectedClientId !== "anonymous"
      ? clientsStore.clients.find((client) => client.id === selectedClientId) ?? null
      : null;
  const selectedExistingVehicle =
    selectedClient && selectedExistingVehicleId
      ? selectedClient.vehicles.find((vehicle) => vehicle.id === selectedExistingVehicleId) ?? null
      : null;
  const existingVehicleDuplicateConflict =
    mode === "existing" && selectedClient && selectedExistingVehicleId === null
      ? findClientPlateDuplicate(clientsStore.clients, existingVehicleDraft.plateNumber, {
          targetClientId: selectedClient.id,
          carBrand: existingVehicleDraft.carBrand,
          carModel: existingVehicleDraft.carModel,
        })
      : null;
  const existingVehicleConfirmationKey = buildSamePlateConfirmationKey({
    scope: "orders-new-existing-vehicle",
    clientId: selectedClient?.id,
    carBrand: existingVehicleDraft.carBrand,
    carModel: existingVehicleDraft.carModel,
    plateNumber: existingVehicleDraft.plateNumber,
  });
  const existingVehicleSamePlateConfirmed = Boolean(
    existingVehicleDuplicateConflict?.requiresConfirmation &&
      confirmedSamePlateKey === existingVehicleConfirmationKey,
  );
  const hasExistingVehicleDraft = Boolean(
    existingVehicleDraft.carBrand.trim() ||
      existingVehicleDraft.carModel.trim() ||
      existingVehicleDraft.plateNumber.trim(),
  );
  const existingVehicleReady = Boolean(
    selectedExistingVehicle ||
      (existingVehicleDraft.carBrand.trim() || existingVehicleDraft.plateNumber.trim()),
  ) && (!existingVehicleDuplicateConflict || existingVehicleSamePlateConfirmed);
  const normalizedNewClientPhone =
    normalizeAuthPhoneInput(form.phone).length === 10
      ? formatAuthPhoneDisplay(normalizeAuthPhoneInput(form.phone))
      : "";
  const newClientDuplicateConflict =
    findClientPhoneDuplicate(clientsStore.clients, normalizedNewClientPhone) ??
    findClientPlateDuplicate(clientsStore.clients, form.plateNumber, {
      carBrand: form.carBrand,
      carModel: form.carModel,
    }) ??
    serverDuplicateConflict;
  const newClientConfirmationKey = buildSamePlateConfirmationKey({
    scope: "orders-new-new-client",
    carBrand: form.carBrand,
    carModel: form.carModel,
    plateNumber: form.plateNumber,
  });
  const newClientSamePlateConfirmed = Boolean(
    newClientDuplicateConflict?.kind === "plate" &&
      newClientDuplicateConflict.requiresConfirmation &&
      confirmedSamePlateKey === newClientConfirmationKey,
  );
  const newClientContract = getClientContractState({
    clientKind: form.clientType,
    fullName: form.fullName,
    phone:
      normalizeAuthPhoneInput(form.phone).length === 10
        ? formatAuthPhoneDisplay(normalizeAuthPhoneInput(form.phone))
        : "",
    carBrand: form.carBrand,
    carModel: form.carModel,
    plateNumber: form.plateNumber,
    organizationName: form.organizationName,
  });
  const newClientInnValid = form.clientType !== "legal" || validateInn(form.inn);

  const canContinue =
    mode === "existing"
      ? Boolean(selectedClient && existingVehicleReady)
      : mode === "anonymous"
        ? true
        : newClientContract.hasOrderMinimumRequiredFields &&
          newClientInnValid &&
          (!newClientDuplicateConflict || newClientSamePlateConfirmed);

  const inputValue =
    isDropdownOpen || searchValue
      ? searchValue
      : selectedClientId === "anonymous"
        ? ""
        : getExistingClientLabel(selectedClientId, clientsStore.clients);

  const inputPlaceholder = "Найти по ФИО, телефону или госномеру";
  const selectedExistingVehicleLabel = selectedExistingVehicle
    ? getVehicleLabel(selectedExistingVehicle)
    : hasExistingVehicleDraft
      ? getVehicleLabel({
          id: "draft",
          label: "",
          brand: existingVehicleDraft.carBrand,
          model: existingVehicleDraft.carModel,
          plateNumber: existingVehicleDraft.plateNumber,
          radius: "",
        })
      : "Не выбран";

  return (
    <section className="max-w-[1120px] space-y-2.5">
      {/* Tabs */}
      <div className="border border-[color:var(--border)] bg-white">
        <OrdersTabs activeTab="new" />
      </div>

      {/* Draft banner */}
      {activeOrderId ? (
        <div className="border border-[color:var(--border)] bg-white px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-[14px] leading-5">
            <div className="text-[color:var(--foreground)]">
              {activeOrderStatus === "Черновик"
                ? "Есть незавершённый черновик заказа."
                : activeOrderStatus === "Ожидает оплаты"
                  ? "Есть заказ, ожидающий оплаты."
                  : "Есть незавершённый заказ."}
            </div>
            <button
              type="button"
              onClick={() => router.push(`/orders?id=${activeOrderId}`)}
              className="inline-flex h-9 items-center border border-[color:var(--border)] bg-white px-3.5 text-[14px] font-medium text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--background)]"
            >
              {activeOrderStatus === "Ожидает оплаты"
                ? "Продолжить оплату"
                : activeOrderStatus === "Черновик"
                  ? "Продолжить черновик"
                  : "Продолжить заказ"}
            </button>
          </div>
        </div>
      ) : null}

      {/* Main card — flat, single border */}
      <div className="border border-[color:var(--border)] bg-white">

        {/* ── Mode bar + Pressure check button ── */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border)] px-4 py-3 sm:px-5">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "existing" as const, label: "Найти в базе" },
                { id: "new" as const, label: "Новый клиент" },
                { id: "anonymous" as const, label: "Анонимно" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleModeChange(tab.id)}
                className={clsx(
                  "h-9 border px-4 text-[13px] font-medium leading-5 transition-colors",
                  mode === tab.id
                    ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white"
                    : "border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:border-[color:var(--primary)]/40",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handlePressureCheckQuickOrder}
            className="h-9 border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
          >
            Проверка давления
          </button>
        </div>

        {/* ── Content area ── */}
        <div className="px-4 py-4 sm:px-5">

          {/* ── Existing client mode ── */}
          {mode === "existing" ? (
            <div className="space-y-3">
              {/* Search input */}
              <div ref={dropdownRef} className="relative max-w-[560px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
                  <input
                    value={inputValue}
                    onFocus={() => setIsDropdownOpen(true)}
                    onChange={(event) => {
                      setSearchValue(event.target.value);
                      setIsDropdownOpen(true);
                    }}
                    placeholder={inputPlaceholder}
                    className="h-10 w-full border border-[color:var(--border)] bg-white pl-10 pr-10 text-[14px] text-[color:var(--foreground)] outline-none placeholder:text-[#9ca3af] focus:border-[color:var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen((current) => {
                        const nextValue = !current;

                        if (!nextValue) {
                          setSearchValue("");
                        }

                        return nextValue;
                      });
                    }}
                    className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[color:var(--muted)]"
                    aria-label="Открыть результаты поиска клиентов"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>

                {isDropdownOpen ? (
                  <div className="absolute left-0 right-0 top-full z-10 -mt-px overflow-hidden border border-[color:var(--border)] bg-white shadow-[0_10px_30px_rgba(15,23,42,0.08)]">
                    <div className="max-h-72 overflow-y-auto">
                      {filteredClients.map(({ client, selectedVehicle }) => {
                        const vehicle = selectedVehicle ?? getClientPrimaryVehicle(client);

                        return (
                          <button
                            key={client.id}
                            type="button"
                            onClick={() => handleClientSelect(client.id, vehicle?.id ?? null)}
                            className={clsx(
                              "grid w-full gap-2 border-b border-[color:var(--border)] px-3 py-3 text-left last:border-b-0 sm:grid-cols-[minmax(0,1fr)_180px_170px] sm:items-start",
                              selectedClientId === client.id
                                ? "bg-[color:var(--primary)]/5"
                                : "bg-white hover:bg-[color:var(--background)]",
                            )}
                          >
                            <span className="text-[14px] font-medium text-[color:var(--foreground)]">
                              {client.name}
                            </span>
                            <span className="text-[14px] text-[#7b8090]">
                              {vehicle ? getVehicleLabel(vehicle) : "Не указан"}
                            </span>
                            <span className="text-[14px] text-[#7b8090]">
                              {[client.vehicles.length ? `${client.vehicles.length} авто` : "", client.phone]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </button>
                        );
                      })}

                      {filteredClients.length === 0 ? (
                        <div className="px-3 py-4 text-[14px] text-[color:var(--muted)]">
                          Клиенты не найдены. Можно открыть нового клиента или продолжить анонимно.
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              {selectedClient ? (
                <div className="space-y-3 border-l-2 border-[color:var(--primary)] py-0.5 pl-3">
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-1.5">
                    <div>
                      <div className="text-[14px] font-semibold text-[color:var(--foreground)]">
                        {selectedClient.name}
                      </div>
                      <div className="text-[13px] text-[color:var(--muted)]">
                        {selectedClient.phone || "Не указан"}
                      </div>
                    </div>
                    <div className="inline-flex items-center border border-[color:var(--primary)]/40 bg-[color:var(--primary)]/5 px-2.5 py-1 text-[12px] font-medium text-[color:var(--primary)]">
                      Текущий авто: {selectedExistingVehicleLabel}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-[13px] font-semibold text-[color:var(--foreground)]">
                      Автопарк клиента
                    </div>
                    <VehicleFleetPicker
                      vehicles={selectedClient.vehicles}
                      selectedVehicleId={selectedExistingVehicleId}
                      onSelectVehicle={(vehicle) => {
                        setConfirmedSamePlateKey("");
                        setSelectedExistingVehicleId(vehicle.id);
                        setExistingVehicleDraft({
                          carBrand: "",
                          carModel: "",
                          plateNumber: "",
                        });
                      }}
                      onAddVehicle={() => {
                        setConfirmedSamePlateKey("");
                        setSelectedExistingVehicleId(null);
                        setExistingVehicleDraft({
                          carBrand: "",
                          carModel: "",
                          plateNumber: "",
                        });
                      }}
                      addLabel="+ Добавить авто"
                    />
                  </div>

                  {selectedExistingVehicleId === null ? (
                    <div className="max-w-[640px] space-y-3 border-t border-[color:var(--border)] pt-3">
                      <VehicleMakeModelPicker
                        brandValue={existingVehicleDraft.carBrand}
                        modelValue={existingVehicleDraft.carModel}
                        onBrandChange={(value) => {
                          setConfirmedSamePlateKey("");
                          setExistingVehicleDraft((current) => ({ ...current, carBrand: value }));
                        }}
                        onModelChange={(value) => {
                          setConfirmedSamePlateKey("");
                          setExistingVehicleDraft((current) => ({ ...current, carModel: value }));
                        }}
                        compact
                      />
                      <PlateInput
                        value={existingVehicleDraft.plateNumber}
                        onChange={(value) => {
                          setConfirmedSamePlateKey("");
                          setExistingVehicleDraft((current) => ({ ...current, plateNumber: value }));
                        }}
                        compact
                      />
                    </div>
                  ) : null}

                  {existingVehicleDuplicateConflict ? (
                    <DuplicateClientWarning
                      conflict={existingVehicleDuplicateConflict}
                      onSelect={() => selectDuplicateConflict(existingVehicleDuplicateConflict)}
                      onConfirm={() => {
                        setFormError("");
                        setConfirmedSamePlateKey(existingVehicleConfirmationKey);
                      }}
                      confirmed={existingVehicleSamePlateConfirmed}
                    />
                  ) : null}

                  {!existingVehicleReady && !existingVehicleDuplicateConflict ? (
                    <div className="text-[13px] leading-5 text-[#c45b5b]">
                      Выберите автомобиль клиента или добавьте новый с маркой и госномером.
                    </div>
                  ) : null}

                  {formError ? (
                    <div className="text-[13px] leading-5 text-[#c45b5b]">{formError}</div>
                  ) : null}
                  </div>
              ) : (
                <div className="text-[13px] leading-5 text-[color:var(--muted)]">
                  Введите ФИО, телефон или госномер для поиска. Для заказа без карточки — режим «Анонимно».
                </div>
              )}

              <div className="flex pt-1 sm:justify-end">
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={!canContinue}
                  className="h-10 w-full border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 sm:min-w-[112px] sm:w-auto"
                >
                  Далее
                </button>
              </div>
            </div>

          ) : mode === "anonymous" ? (

            /* ── Anonymous mode ── */
            <div className="space-y-3">
              <div className="max-w-[560px] text-[14px] leading-5 text-[color:var(--muted)]">
                Заказ откроется без клиентской карты. Если нужен клиент из базы — вернитесь к режиму «Найти в базе».
              </div>
              <div className="max-w-[640px]">
                <VehicleMakeModelPicker
                  brandValue={anonymousVehicleDraft.carBrand}
                  modelValue={anonymousVehicleDraft.carModel}
                  onBrandChange={(value) =>
                    setAnonymousVehicleDraft((current) => ({ ...current, carBrand: value }))
                  }
                  onModelChange={(value) =>
                    setAnonymousVehicleDraft((current) => ({ ...current, carModel: value }))
                  }
                  brandLabel="Марка автомобиля (необязательно)"
                  modelLabel="Модель автомобиля (необязательно)"
                />
              </div>
              <div className="flex sm:justify-end">
                <button
                  type="button"
                  onClick={handleContinue}
                  className="h-10 w-full border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[14px] font-medium text-white sm:min-w-[200px] sm:w-auto"
                >
                  Продолжить без клиента
                </button>
              </div>
            </div>

          ) : (

            /* ── New client mode ── */
            <div className="max-w-[640px] space-y-3">
              <div className="text-[13px] leading-5 text-[color:var(--muted)]">
                Если клиента нет в базе, заполните новую карточку ниже. При необходимости можно вернуться к поиску или открыть анонимный заказ.
              </div>

              <div className="space-y-3">
                <VehicleMakeModelPicker
                  brandValue={form.carBrand}
                  modelValue={form.carModel}
                  onBrandChange={(value) => updateForm("carBrand", value)}
                  onModelChange={(value) => updateForm("carModel", value)}
                />

                <div className="flex gap-4 border-b border-[color:var(--border)] pb-3">
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="clientType"
                      value="individual"
                      checked={form.clientType === "individual"}
                      onChange={() => updateForm("clientType", "individual")}
                      className="text-[color:var(--primary)] focus:ring-[color:var(--primary)]"
                    />
                    <span className="text-[14px] text-[color:var(--foreground)]">Физлицо</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="clientType"
                      value="legal"
                      checked={form.clientType === "legal"}
                      onChange={() => updateForm("clientType", "legal")}
                      className="text-[color:var(--primary)] focus:ring-[color:var(--primary)]"
                    />
                    <span className="text-[14px] text-[color:var(--foreground)]">Юрлицо</span>
                  </label>
                </div>

                {form.clientType === "legal" ? (
                  <div className="space-y-3 border border-[color:var(--border)] bg-slate-50 p-3">
                    <label className="block space-y-1.5">
                      <span className="text-[14px] text-[color:var(--foreground)]">ИНН</span>
                      <input
                        value={form.inn}
                        onChange={(event) => updateForm("inn", event.target.value)}
                        placeholder="Введите ИНН организации"
                        inputMode="numeric"
                        className="h-10 w-full border border-[color:var(--border)] bg-white px-3 text-[14px] text-[color:var(--foreground)] outline-none focus:border-[color:var(--primary)]"
                      />
                      {form.inn && !validateInn(form.inn) ? (
                        <div className="text-[13px] leading-5 text-[#c45b5b]">
                          ИНН должен содержать 10 или 12 цифр.
                        </div>
                      ) : null}
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-[14px] text-[color:var(--foreground)]">Название организации *</span>
                      <input
                        value={form.organizationName}
                        onChange={(event) => updateForm("organizationName", event.target.value)}
                        placeholder="Например, ООО Ромашка"
                        className="h-10 w-full border border-[color:var(--border)] bg-white px-3 text-[14px] text-[color:var(--foreground)] outline-none focus:border-[color:var(--primary)]"
                      />
                    </label>
                    <label className="block space-y-1.5">
                      <span className="text-[14px] text-[color:var(--foreground)]">Номер договора</span>
                      <input
                        value={form.contractNumber}
                        onChange={(event) => updateForm("contractNumber", event.target.value)}
                        placeholder="Например, 12/04-26, A-17, 77-ШМ/2026"
                        className="h-10 w-full border border-[color:var(--border)] bg-white px-3 text-[14px] text-[color:var(--foreground)] outline-none focus:border-[color:var(--primary)]"
                      />
                    </label>
                  </div>
                ) : null}

                <label className="block space-y-1.5">
                  <span className="text-[14px] text-[color:var(--foreground)]">ФИО</span>
                  <input
                    value={form.fullName}
                    onChange={(event) => updateForm("fullName", event.target.value)}
                    placeholder={
                      form.clientType === "legal"
                        ? "ФИО контактного лица"
                        : "Антон, Антон Иванов или Иванов Антон Петрович"
                    }
                    className="h-10 w-full border border-[color:var(--border)] bg-white px-3 text-[14px] text-[color:var(--foreground)] outline-none focus:border-[color:var(--primary)]"
                  />
                </label>

                <label className="block space-y-1.5 sm:max-w-[360px]">
                  <span className="text-[14px] text-[color:var(--foreground)]">Телефон</span>
                  <div className="flex h-10 w-full items-center border border-[color:var(--border)] bg-white px-3 text-[14px] text-[color:var(--foreground)] focus-within:border-[color:var(--primary)]">
                    <span className="mr-2 shrink-0 text-[color:var(--muted)]">+7</span>
                    <input
                      value={formatAuthPhoneInput(form.phone)}
                      onChange={(event) => updateForm("phone", event.target.value)}
                      placeholder="999 999-99-99"
                      className="w-full bg-transparent outline-none"
                      inputMode="numeric"
                    />
                  </div>
                </label>

                <PlateInput
                  label="Госномер"
                  value={form.plateNumber}
                  onChange={(value) => updateForm("plateNumber", value)}
                />

                {newClientDuplicateConflict ? (
                  <DuplicateClientWarning
                    conflict={newClientDuplicateConflict}
                    onSelect={() => selectDuplicateConflict(newClientDuplicateConflict)}
                    onConfirm={() => {
                      setFormError("");
                      setConfirmedSamePlateKey(newClientConfirmationKey);
                    }}
                    confirmed={newClientSamePlateConfirmed}
                  />
                ) : null}

                {formError ? (
                  <div className="text-[13px] leading-5 text-[#c45b5b]">{formError}</div>
                ) : null}

              </div>

              <div className="flex pt-1 sm:justify-end">
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={!canContinue}
                  className="h-10 w-full border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:bg-slate-300 sm:min-w-[112px] sm:w-auto"
                >
                  Далее
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
