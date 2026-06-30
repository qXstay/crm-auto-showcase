export type DemoStorageWarehouseRecord = {
  id: string;
  name: string;
  shelvesCount: number;
  cellsCount: number;
  protected: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DemoStorageSettingsStore = {
  warehouses: DemoStorageWarehouseRecord[];
};
