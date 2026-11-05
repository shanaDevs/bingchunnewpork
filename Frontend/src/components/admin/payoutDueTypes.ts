export type PayoutDueRow = {
  storeId: string;
  storeName: string;
  periodFrom: string;
  periodTo: string;
  days: number;
  netAmountCents: number;
  orderCount: number;
  breakdown?: unknown | null;
};
