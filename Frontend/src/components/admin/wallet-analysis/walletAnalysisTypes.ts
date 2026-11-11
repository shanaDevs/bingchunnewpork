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
  /** Online payables delivery fees (excluded from Online Available Balance). */
  deliveryFee: number;
  /** Online payables convenience fees (excluded from Online Available Balance). */
  convenienceFee: number;
};

export type WalletAnalysisSnapshot = {
  month: string;
  storeId: string | null;
  from: string;
  to: string;
  tank: { balance: number; capacity: number };
  /** Cumulative pickup + delivery online from day one, LKR (not reduced by payouts). */
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
