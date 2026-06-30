"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import {
  cloneService,
  createEmptyPriceMatrix,
  normalizeService,
} from "@/features/services-admin/mock-data";
import { CategoryEditModal } from "@/features/services-admin/components/category-edit-modal";
import { ServiceEditModal } from "@/features/services-admin/components/service-edit-modal";
import { ServicesCategoryList } from "@/features/services-admin/components/services-category-list";
import {
  fetchServicesCatalogForSettings,
  reorderServiceCategoriesViaApi,
  reorderServicesInCategoryViaApi,
  saveServicesCatalogViaApi,
} from "@/features/services-admin/repository";
import {
  checkNewOrIncreasedDuplicates,
  formatDuplicateServiceMessage,
  getDuplicateServiceGroups,
} from "@/features/services-admin/duplicates";
import { SettingsSectionsTabs } from "@/features/services-admin/components/settings-sections-tabs";
import type {
  ServicesAdminCategory,
  ServicesAdminService,
} from "@/features/services-admin/types";

type CategoryModalState = {
  open: boolean;
  categoryId: string | null;
  name: string;
  isNew: boolean;
};

type ServiceModalState = {
  open: boolean;
  categoryId: string | null;
  service: ServicesAdminService | null;
  isNew: boolean;
};

type DropPlacement = "before" | "after";

type DeleteConfirmState =
  | {
      kind: "category";
      categoryId: string;
      label: string;
    }
  | {
      kind: "service";
      categoryId: string;
      serviceId: string;
      label: string;
    };

type PersistCategoriesResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      message: string;
    };

function getPersistErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function createNewService(): ServicesAdminService {
  return {
    id: "",
    categoryId: "",
    name: "",
    serviceType: "base",
    pricingMode: "service",
    priceType: "matrix",
    fixedPrice: 0,
    priceFrom: 0,
    matrixPrices: createEmptyPriceMatrix(),
    modifierMatrixPrices: {},
    modifierEnabled: {
      low_profile: false,
      runflat: false,
    },
    modifierExplicitlyCleared: {
      low_profile: false,
      runflat: false,
    },
    displayPriceLabel: "",
    displayPriceLabelOverride: undefined,
    priceBands: [],
    salaryRuleType: "percent_of_work",
    salaryPercent: 35,
    salaryFixedAmount: 0,
    salaryPerUnitAmount: 0,
    usesCostPrice: false,
    costPrice: 0,
    reducedEmployeePercentEnabled: false,
    reducedEmployeePercentValue: 30,
  };
}

export default function ServicesSettingsPage() {
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [categories, setCategories] = useState<ServicesAdminCategory[] | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [categoryModal, setCategoryModal] = useState<CategoryModalState>({
    open: false,
    categoryId: null,
    name: "",
    isNew: false,
  });
  const [serviceModal, setServiceModal] = useState<ServiceModalState>({
    open: false,
    categoryId: null,
    service: null,
    isNew: false,
  });
  const [serviceSaveError, setServiceSaveError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchServicesCatalogForSettings()
      .then((store) => {
        if (cancelled) {
          return;
        }

        setCategories(store.categories);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        console.error("Не удалось загрузить каталог услуг.", error);
        setToastMessage(
          error instanceof Error ? error.message : "Не удалось загрузить каталог услуг.",
        );
        setCategories([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage(null);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [toastMessage]);

  const duplicateServiceGroups = useMemo(
    () => (categories ? getDuplicateServiceGroups(categories) : []),
    [categories],
  );
  const duplicateServiceMessage = useMemo(
    () => formatDuplicateServiceMessage(duplicateServiceGroups),
    [duplicateServiceGroups],
  );

  async function persistCategories(
    nextCategories: ServicesAdminCategory[],
    successMessage?: string,
  ): Promise<PersistCategoriesResult> {
    const nextDuplicateGroups = getDuplicateServiceGroups(nextCategories);
    const hasNewOrIncreased = checkNewOrIncreasedDuplicates(nextCategories, categories ?? []);

    if (hasNewOrIncreased) {
      const duplicateMessage = formatDuplicateServiceMessage(nextDuplicateGroups);
      setToastMessage(duplicateMessage);
      return {
        ok: false,
        message: duplicateMessage,
      };
    }

    const previousCategories = categories;
    setCategories(nextCategories);
    setIsSaving(true);
    let result: PersistCategoriesResult = { ok: true };

    const persistTask = persistQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const nextStore = await saveServicesCatalogViaApi({
            categories: nextCategories,
          });
          setCategories(nextStore.categories);
          if (successMessage) {
            setToastMessage(successMessage);
          }
          result = { ok: true };
        } catch (error) {
          console.error("Не удалось сохранить каталог услуг.", error);
          const message = getPersistErrorMessage(
            error,
            "Не удалось сохранить каталог услуг.",
          );
          setCategories(previousCategories);
          setToastMessage(message);
          result = {
            ok: false,
            message,
          };
        } finally {
          setIsSaving(false);
        }
      });

    persistQueueRef.current = persistTask;
    await persistTask;
    return result;
  }

  async function persistCatalogOrder(
    nextCategories: ServicesAdminCategory[],
    request: () => Promise<{ categories: ServicesAdminCategory[] }>,
    successMessage: string,
  ) {
    const previousCategories = categories;
    setCategories(nextCategories);
    setIsSaving(true);

    const persistTask = persistQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const nextStore = await request();
          setCategories(nextStore.categories);
          setToastMessage(successMessage);
        } catch (error) {
          console.error("Не удалось сохранить порядок каталога услуг.", error);
          setCategories(previousCategories);
          setToastMessage(
            error instanceof Error
              ? error.message
              : "Не удалось сохранить порядок каталога услуг.",
          );
        } finally {
          setIsSaving(false);
        }
      });

    persistQueueRef.current = persistTask;
    await persistTask;
  }

  function openNewCategoryModal() {
    setCategoryModal({
      open: true,
      categoryId: null,
      name: "",
      isNew: true,
    });
  }

  function openEditCategoryModal(category: ServicesAdminCategory) {
    setCategoryModal({
      open: true,
      categoryId: category.id,
      name: category.name,
      isNew: false,
    });
  }

  async function saveCategory(name: string) {
    if (!categories) {
      return;
    }

    if (categoryModal.isNew) {
      await persistCategories([
        ...categories,
        {
          id: `category-${Date.now()}`,
          name: name || "Новая категория",
          services: [],
        },
      ]);
    } else if (categoryModal.categoryId) {
      await persistCategories(
        categories.map((category) =>
          category.id === categoryModal.categoryId
            ? { ...category, name: name || category.name }
            : category,
        ),
      );
    }

    setCategoryModal({
      open: false,
      categoryId: null,
      name: "",
      isNew: false,
    });
  }

  async function deleteCategory(categoryId: string) {
    if (!categories) {
      return;
    }

    await persistCategories(
      categories.filter((category) => category.id !== categoryId),
    );
  }

  function requestDeleteCategory(categoryId: string) {
    const category = categories?.find((item) => item.id === categoryId);

    if (!category) {
      return;
    }

    setDeleteConfirm({
      kind: "category",
      categoryId,
      label: category.name,
    });
  }

  async function reorderCategory(
    categoryId: string,
    targetCategoryId: string,
    placement: DropPlacement,
  ) {
    if (categoryId === targetCategoryId || !categories) {
      return;
    }

    const nextCategories = [...categories];
    const sourceIndex = nextCategories.findIndex((category) => category.id === categoryId);

    if (sourceIndex === -1) {
      return;
    }

    const [movedCategory] = nextCategories.splice(sourceIndex, 1);
    const targetIndex = nextCategories.findIndex(
      (category) => category.id === targetCategoryId,
    );

    if (targetIndex === -1) {
      return;
    }

    nextCategories.splice(
      placement === "after" ? targetIndex + 1 : targetIndex,
      0,
      movedCategory,
    );

    await persistCatalogOrder(
      nextCategories,
      () => reorderServiceCategoriesViaApi(nextCategories.map((category) => category.id)),
      "Порядок категорий обновлён",
    );
  }

  function openNewServiceModal(categoryId: string) {
    setServiceSaveError(null);
    setServiceModal({
      open: true,
      categoryId,
      service: createNewService(),
      isNew: true,
    });
  }

  function openEditServiceModal(
    categoryId: string,
    service: ServicesAdminService,
  ) {
    setServiceSaveError(null);
    setServiceModal({
      open: true,
      categoryId,
      service: cloneService(service),
      isNew: false,
    });
  }

  async function saveService(service: ServicesAdminService) {
    if (!serviceModal.categoryId || !categories) {
      return;
    }

    setServiceSaveError(null);
    const persistResult = await persistCategories(
      categories.map((category) => {
        if (category.id !== serviceModal.categoryId) {
          return category;
        }

        if (serviceModal.isNew) {
          const nextService = normalizeService(category.id, {
            ...service,
            id: `service-${Date.now()}`,
            name: service.name || "Новая услуга",
          });

          return {
            ...category,
            services: [...category.services, nextService],
          };
        }

        const nextService = normalizeService(category.id, service);

        return {
          ...category,
          services: category.services.map((item) =>
            item.id === service.id ? nextService : item,
          ),
        };
      }),
    );

    if (!persistResult.ok) {
      setServiceSaveError(persistResult.message);
      return;
    }

    setServiceSaveError(null);
    setServiceModal({
      open: false,
      categoryId: null,
      service: null,
      isNew: false,
    });
  }

  async function deleteService(categoryId: string, serviceId: string) {
    if (!categories) {
      return;
    }

    await persistCategories(
      categories.map((category) =>
        category.id === categoryId
          ? {
              ...category,
              services: category.services.filter((service) => service.id !== serviceId),
            }
          : category,
      ),
    );
  }

  function requestDeleteService(categoryId: string, serviceId: string) {
    const category = categories?.find((item) => item.id === categoryId);
    const service = category?.services.find((item) => item.id === serviceId);

    if (!service) {
      return;
    }

    setDeleteConfirm({
      kind: "service",
      categoryId,
      serviceId,
      label: service.name,
    });
  }

  async function confirmDelete() {
    if (!deleteConfirm) {
      return;
    }

    if (deleteConfirm.kind === "category") {
      await deleteCategory(deleteConfirm.categoryId);
    } else {
      await deleteService(deleteConfirm.categoryId, deleteConfirm.serviceId);
    }

    setDeleteConfirm(null);
  }

  async function reorderService(
    categoryId: string,
    serviceId: string,
    targetServiceId: string,
  ) {
    if (serviceId === targetServiceId || !categories) {
      return;
    }

    const category = categories.find((item) => item.id === categoryId);

    if (!category) {
      return;
    }

    const services = [...category.services];
    const sourceIndex = services.findIndex((service) => service.id === serviceId);
    const targetIndex = services.findIndex((service) => service.id === targetServiceId);

    if (sourceIndex === -1 || targetIndex === -1) {
      return;
    }

    const [movedService] = services.splice(sourceIndex, 1);
    services.splice(targetIndex, 0, movedService);

    const nextCategories = categories.map((item) =>
      item.id === categoryId
        ? {
            ...item,
            services,
          }
        : item,
    );

    await persistCatalogOrder(
      nextCategories,
      () => reorderServicesInCategoryViaApi(categoryId, services.map((service) => service.id)),
      "Порядок услуг обновлён",
    );
  }

  return (
    <section className="max-w-[1120px] space-y-4">
      <div className="max-w-[1060px] border border-[color:var(--border)] bg-white">
        <SettingsSectionsTabs activeSection="Услуги" />
        <div className="px-4 py-4">
          <button
            type="button"
            onClick={openNewCategoryModal}
            disabled={!categories || isSaving}
            className="h-9 border border-[color:var(--primary)]/35 bg-white px-4 text-[13px] font-medium text-[color:var(--foreground)]"
          >
            Новая категория
          </button>
          <p className="mt-3 max-w-[760px] text-[13px] leading-6 text-slate-600">
            Правила зарплаты: % от работ, % от прибыли, фикс, за штуку.
          </p>
          {duplicateServiceGroups.length > 0 ? (
            <div className="mt-3 border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-900">
              {duplicateServiceMessage}
            </div>
          ) : null}
        </div>
      </div>

      <div className="max-w-[1060px] border border-[color:var(--border)] bg-white px-4 py-4">
        {categories ? (
          <ServicesCategoryList
            categories={categories}
            onEditCategory={openEditCategoryModal}
            onDeleteCategory={requestDeleteCategory}
            onReorderCategory={reorderCategory}
            onAddService={openNewServiceModal}
            onEditService={openEditServiceModal}
            onDeleteService={requestDeleteService}
            onReorderService={reorderService}
          />
        ) : (
          <div className="space-y-4 pt-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="h-6 w-48" />
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CategoryEditModal
        open={categoryModal.open}
        initialName={categoryModal.name}
        title="Редактирование категории"
        onClose={() =>
          setCategoryModal({
            open: false,
            categoryId: null,
            name: "",
            isNew: false,
          })
        }
        onSave={saveCategory}
      />

      <ServiceEditModal
        open={serviceModal.open}
        initialService={serviceModal.service}
        isSaving={isSaving}
        onClose={() => {
          setServiceSaveError(null);
          setServiceModal({
            open: false,
            categoryId: null,
            service: null,
            isNew: false,
          });
        }}
        saveError={serviceSaveError}
        onSave={saveService}
      />

      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-50 border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] text-[color:var(--foreground)] shadow-sm">
          {toastMessage}
        </div>
      ) : null}

      {deleteConfirm ? (
        <Modal
          title={deleteConfirm.kind === "service" ? "Удалить услугу" : "Удалить категорию"}
          onClose={() => setDeleteConfirm(null)}
          maxWidthClass="sm:max-w-[460px]"
          actions={
            <>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={isSaving}
                className="h-9 rounded-md border border-[color:var(--border)] bg-white px-4 text-[14px] text-[color:var(--foreground)] disabled:cursor-not-allowed disabled:text-[color:var(--muted)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  void confirmDelete();
                }}
                disabled={isSaving}
                className="h-9 rounded-md border border-rose-600 bg-rose-600 px-4 text-[14px] font-medium text-white disabled:cursor-wait disabled:opacity-70"
              >
                Удалить
              </button>
            </>
          }
        >
          <div className="space-y-2">
            <div className="text-[14px] font-medium leading-5 text-[color:var(--foreground)]">
              {deleteConfirm.label}
            </div>
            <div className="text-[13px] leading-5 text-[color:var(--muted)]">
              Действие изменит каталог для новых заказов. Исторические заказы сохраняют
              snapshot услуг, цен и начислений и не должны измениться.
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
