export type WalletAnalysisTrendPoint = {
  day: number;
  label: string;
  inflow: number;
  outflow: number;
};

export type WalletAnalysisBranchContribution = {
  branchId: string;
  label: string;
  amount: number;
  percent: number;
};

export type WalletAnalysisFlowPoint = {
  key: string;
  label: string;
  amount: number;
};

export type WalletAnalysisHealthSlice = {
  key: string;
  label: string;
  amount: number;
};

export type WalletAnalysisExcludedFees = {
  deliveryFee: number;
  convenienceFee: number;
};

export type WalletAnalysisSnapshot = {
  month: string;
  storeId: string | null;
  from: string;
  to: string;
  tank: { balance: number; capacity: number };
  /** Pickup online + delivery online + all-time retained refunds (LKR). */
  onlineAvailableBalance?: number;
  health: { percent: number; slices: WalletAnalysisHealthSlice[] };
  excludedFees?: WalletAnalysisExcludedFees;
  trend: WalletAnalysisTrendPoint[];
  branchContribution: WalletAnalysisBranchContribution[];
  incoming: WalletAnalysisFlowPoint[];
  outgoing: WalletAnalysisFlowPoint[];
};

export type WalletAnalysisBranchOption = {
  storeId: string;
  name: string;
};
