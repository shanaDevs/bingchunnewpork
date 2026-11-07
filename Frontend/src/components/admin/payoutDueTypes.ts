export type PayoutDueRow = {
  storeId: string;
  storeName: string;
  periodFrom: string;
  periodTo: string;
  days: number;
  netAmountCents: number;
  orderCount: number;
  breakdown?: unknown | null;
  withdrawalId?: string;
  /** Oldest unpaid window for this branch; set by the paginated due-list API. */
  isOldestUnpaid?: boolean;
};
