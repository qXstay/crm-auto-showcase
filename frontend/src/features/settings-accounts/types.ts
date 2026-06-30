export type DemoAccountRecord = {
  id: string;
  name: string;
  isArchived: boolean;
  protected: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DemoAccountsStore = {
  accounts: DemoAccountRecord[];
};

export type DemoAccountAggregate = DemoAccountRecord & {
  totalAmount: number;
};

export type DemoResolvedPaymentAccount = {
  accountId: string;
  accountName: string;
};
