export type DemoClientSourceRecord = {
  id: string;
  name: string;
  protected: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DemoClientSourcesStore = {
  sources: DemoClientSourceRecord[];
};
