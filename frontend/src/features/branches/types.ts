export type DemoBranchSummary = {
  id: string;
  code: string;
  name: string;
  displayName: string;
  address: string;
  phone: string | null;
};

export type DemoBranchProfile = {
  branchId: string;
  legalName: string;
  displayName: string;
  address: string;
  phone: string;
  timezoneLabel: string;
  workStart: string;
  workEnd: string;
};

export type DemoBranchPrintSettings = {
  branchId: string;
  receiptTitle: string;
  footerNote: string;
  showPhone: boolean;
  showAddress: boolean;
};
