"use client";

import { type DragEvent, useState } from "react";
import clsx from "clsx";
import { GripVertical, Pencil, Plus, Trash2 } from "lucide-react";
import type {
  ServicesAdminCategory,
  ServicesAdminService,
} from "@/features/services-admin/types";

type DropPlacement = "before" | "after";

type ServicesCategoryListProps = {
  categories: ServicesAdminCategory[];
  onEditCategory: (category: ServicesAdminCategory) => void;
  onDeleteCategory: (categoryId: string) => void;
  onReorderCategory: (
    categoryId: string,
    targetCategoryId: string,
    placement: DropPlacement,
  ) => void;
  onAddService: (categoryId: string) => void;
  onEditService: (categoryId: string, service: ServicesAdminService) => void;
  onDeleteService: (categoryId: string, serviceId: string) => void;
  onReorderService: (
    categoryId: string,
    serviceId: string,
    targetServiceId: string,
  ) => void;
};

function getCategoryDropPlacement(event: DragEvent<HTMLElement>): DropPlacement {
  const rect = event.currentTarget.getBoundingClientRect();
  const offsetY = event.clientY - rect.top;

  return offsetY > rect.height / 2 ? "after" : "before";
}

const categoryDragHandleClassName =
  "flex h-7 w-7 shrink-0 cursor-grab items-center justify-center rounded-md border border-transparent text-slate-400 transition-colors hover:border-[color:var(--border)] hover:bg-[color:var(--background)] hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-1 active:cursor-grabbing disabled:cursor-default disabled:text-slate-300";

const serviceDragHandleClassName =
  "hidden h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-md border border-transparent text-slate-400 transition-colors hover:border-[color:var(--border)] hover:bg-[color:var(--background)] hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-1 active:cursor-grabbing md:flex";

const editIconButtonClassName =
  "flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-[color:var(--muted)] transition-colors hover:border-[color:var(--border)] hover:bg-[color:var(--background)] hover:text-[color:var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-1";

const deleteIconButtonClassName =
  "flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-[color:var(--muted)] transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-1";

export function ServicesCategoryList({
  categories,
  onEditCategory,
  onDeleteCategory,
  onReorderCategory,
  onAddService,
  onEditService,
  onDeleteService,
  onReorderService,
}: ServicesCategoryListProps) {
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null);
  const [categoryDropTarget, setCategoryDropTarget] = useState<{
    categoryId: string;
    placement: DropPlacement;
  } | null>(null);
  const [draggingServiceId, setDraggingServiceId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      {categories.map((category) => {
        const categoryDropPlacement =
          categoryDropTarget?.categoryId === category.id
            ? categoryDropTarget.placement
            : null;
        const categoryIsDragging = draggingCategoryId === category.id;

        return (
          <section
            key={category.id}
            data-service-category-id={category.id}
            onDragOver={(event) => {
              const hasCategoryDragPayload = event.dataTransfer.types.includes(
                "text/category-reorder-id",
              );

              if (
                (!draggingCategoryId && !hasCategoryDragPayload) ||
                draggingCategoryId === category.id
              ) {
                return;
              }

              event.preventDefault();
              event.dataTransfer.dropEffect = "move";

              const placement = getCategoryDropPlacement(event);

              if (
                categoryDropTarget?.categoryId !== category.id ||
                categoryDropTarget.placement !== placement
              ) {
                setCategoryDropTarget({ categoryId: category.id, placement });
              }
            }}
            onDragLeave={(event) => {
              const nextTarget = event.relatedTarget as Node | null;

              if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
                setCategoryDropTarget(null);
              }
            }}
            onDrop={(event) => {
              const categoryId = event.dataTransfer.getData("text/category-reorder-id");

              if (!categoryId || categoryId === category.id) {
                return;
              }

              event.preventDefault();
              event.stopPropagation();

              onReorderCategory(
                categoryId,
                category.id,
                categoryDropPlacement ?? getCategoryDropPlacement(event),
              );
              setDraggingCategoryId(null);
              setCategoryDropTarget(null);
            }}
            className={clsx(
              "space-y-2 border-t border-[color:var(--border)] pt-4 first:border-t-0 first:pt-0",
              categoryIsDragging && "opacity-50",
            )}
          >
            {categoryDropPlacement === "before" ? (
              <div className="h-px bg-[color:var(--primary)]/45" />
            ) : null}
            <div className="flex items-center justify-between gap-3 py-0.5">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={categories.length < 2}
                  draggable={categories.length > 1}
                  data-category-drag-handle={category.id}
                  onDragStart={(event) => {
                    if (categories.length < 2) {
                      return;
                    }

                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/category-reorder-id", category.id);
                    setDraggingCategoryId(category.id);
                    setCategoryDropTarget(null);
                  }}
                  onDragEnd={() => {
                    setDraggingCategoryId(null);
                    setCategoryDropTarget(null);
                  }}
                  className={categoryDragHandleClassName}
                  aria-label={`Перетащить категорию ${category.name}`}
                  title="Перетащить категорию"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                <h2 className="text-[16px] font-semibold text-[color:var(--foreground)]">
                  {category.name}
                </h2>
              </div>

              <div className="flex items-center gap-2 text-[color:var(--muted)]">
                <button
                  type="button"
                  onClick={() => onEditCategory(category)}
                  className={editIconButtonClassName}
                  aria-label={`Редактировать ${category.name}`}
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteCategory(category.id)}
                  className={deleteIconButtonClassName}
                  aria-label={`Удалить ${category.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-1">
              {category.services.map((service) => (
                <div
                  key={service.id}
                  data-service-row-id={service.id}
                  onDragOver={(event) => {
                    const hasServiceDragPayload = event.dataTransfer.types.includes(
                      "text/service-id",
                    );

                    if (!draggingServiceId && !hasServiceDragPayload) {
                      return;
                    }

                    event.preventDefault();
                    if (dropTargetId !== service.id) {
                      setDropTargetId(service.id);
                    }
                  }}
                  onDragLeave={() => {
                    if (dropTargetId === service.id) {
                      setDropTargetId(null);
                    }
                  }}
                  onDrop={(event) => {
                    const sourceCategoryId = event.dataTransfer.getData("text/category-id");
                    const serviceId = event.dataTransfer.getData("text/service-id");

                    if (
                      !serviceId ||
                      !sourceCategoryId ||
                      sourceCategoryId !== category.id ||
                      serviceId === service.id
                    ) {
                      return;
                    }

                    event.preventDefault();
                    event.stopPropagation();

                    onReorderService(category.id, serviceId, service.id);
                    setDraggingServiceId(null);
                    setDropTargetId(null);
                  }}
                  className={clsx(
                    "gap-3 py-1.5 text-[14px] transition-colors md:grid md:grid-cols-[minmax(0,1fr)_190px_64px]",
                    dropTargetId === service.id
                      ? "bg-[color:var(--primary)]/3"
                      : "hover:bg-[color:var(--background)]/60",
                  )}
                >
                  <div
                    className={
                      dropTargetId === service.id
                        ? "col-span-full h-px bg-[color:var(--primary)]/45 md:hidden"
                        : "hidden"
                    }
                  />
                  <div className="rounded-[4px] border border-[color:var(--border)] bg-white px-3 py-2.5 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-0">
                    <div className="flex min-w-0 items-start justify-between gap-3 md:block">
                      <div className="flex min-w-0 items-center gap-2 text-[color:var(--foreground)]">
                        <button
                          type="button"
                          draggable
                          data-service-drag-handle={service.id}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/category-id", category.id);
                            event.dataTransfer.setData("text/service-id", service.id);
                            setDraggingServiceId(service.id);
                          }}
                          onDragEnd={() => {
                            setDraggingServiceId(null);
                            setDropTargetId(null);
                          }}
                          className={serviceDragHandleClassName}
                          aria-label={`Перетащить ${service.name}`}
                          title="Перетащить услугу"
                        >
                          <GripVertical className="h-4 w-4" />
                        </button>
                        <span
                          className={
                            draggingServiceId === service.id
                              ? "truncate font-medium opacity-50"
                              : "truncate font-medium"
                          }
                        >
                          {service.name}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-1 text-[color:var(--muted)] md:hidden">
                        <button
                          type="button"
                          onClick={() => onEditService(category.id, service)}
                          className={editIconButtonClassName}
                          aria-label={`Редактировать ${service.name}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteService(category.id, service.id)}
                          className={deleteIconButtonClassName}
                          aria-label={`Удалить ${service.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-1.5 text-[13px] text-[color:var(--muted)] md:hidden">
                      {service.displayPriceLabel}
                    </div>
                  </div>

                  <div className="hidden self-center text-[13px] text-[color:var(--muted)] md:block md:pr-1 md:text-right">
                    {service.displayPriceLabel}
                  </div>

                  <div className="hidden items-center gap-1 text-[color:var(--muted)] md:flex md:justify-end">
                    <button
                      type="button"
                      onClick={() => onEditService(category.id, service)}
                      className={editIconButtonClassName}
                      aria-label={`Редактировать ${service.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteService(category.id, service.id)}
                      className={deleteIconButtonClassName}
                      aria-label={`Удалить ${service.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onAddService(category.id)}
              className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 border border-[color:var(--primary)]/35 bg-white px-4 text-[13px] text-[color:var(--foreground)] md:w-auto"
            >
              <Plus className="h-4 w-4 text-[color:var(--primary)]" />
              Добавить услугу
            </button>

            {categoryDropPlacement === "after" ? (
              <div className="h-px bg-[color:var(--primary)]/45" />
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
