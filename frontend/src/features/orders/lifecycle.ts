export const ORDER_MARKED_FOR_DELETION_STATUS = "Пометить на удаление";
export const ORDER_DELETED_FROM_LIST_LABEL = "Удалён из списка";

export function isOrderMarkedForDeletion(status: string) {
  return status === ORDER_MARKED_FOR_DELETION_STATUS;
}

export function getOrderVisibleStatusLabel(status: string) {
  return isOrderMarkedForDeletion(status) ? ORDER_DELETED_FROM_LIST_LABEL : status;
}

export function isOrderFinishedStatus(status: string) {
  return status === "Оплачен" || status === "Выполнен";
}
