export type DeliveryWalletBranch = {
  storeId: string;
  storeName: string;
  fromActiveOrders: number;
  fromLateCancels: number;
  grossDeliveryFee: number;
  orderCount: number;
  lateCancelCount: number;
  platformFee: number;
  afterPlatformFee: number;
  gatewayFee: number;
  netForDelivery: number;
};

export type DeliveryWalletSummary = {
  grossDeliveryFee: number;
  fromActiveOrders: number;
  fromLateCancels: number;
  platformFeePercent: number;
  platformFee: number;
  afterPlatformFee: number;
  gatewayFeePercent: number;
  gatewayFee: number;
  netForDelivery: number;
  orderCount: number;
  lateCancelCount: number;
  branches: DeliveryWalletBranch[];
};

export type DeliveryPayoutHistoryRow = {
  id: string;
  amount: number;
  amountLkr?: number;
  status: string;
  remarks: string | null;
  periodFrom: string;
  periodTo: string;
  requestedById?: string;
  paymentMethod?: string | null;
  proofUrl?: string | null;
  hasProof?: boolean;
  checkNumber?: string | null;
  checkDate?: string | null;
  breakdown?: DeliveryWalletSummary | null;
  createdAt: string;
};

export function parseDeliveryPayoutBreakdown(value: unknown): DeliveryWalletSummary | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<DeliveryWalletSummary>;
  if (typeof raw.netForDelivery !== 'number') return null;
  return raw as DeliveryWalletSummary;
}

export type DeliveryPayoutDueRow = {
  periodFrom: string;
  periodTo: string;
  days: number;
  orderCount: number;
  grossDeliveryFee: number;
  platformFeePercent: number;
  platformFee: number;
  gatewayFeePercent: number;
  gatewayFee: number;
  netForDelivery: number;
  payable: boolean;
};
