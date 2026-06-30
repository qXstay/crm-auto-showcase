export type DemoStorageStatus = "На хранении" | "Готово к выдаче" | "Выдано";

export type DemoStorageItem = {
  id: string;
  storageNumber: string;
  clientId: string | null;
  clientName: string;
  clientPhone: string;
  carBrand: string;
  carModel: string;
  plateNumber: string;
  kitLabel: string;
  status: DemoStorageStatus;
  warehouseId: string | null;
  warehouseName: string;
  shelfLabel: string;
  cellLabel: string;
  acceptedAt: string;
  releasedAt: string | null;
  note: string;
};

export type DemoStorageStore = {
  items: DemoStorageItem[];
};
