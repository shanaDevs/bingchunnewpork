import type { BranchWalletDashboard } from '@/components/admin/BranchWalletSummaryCards';
import type { StoreWallet } from '@/components/admin/SuperAdminSystemWalletTab';
import type { WithdrawalPagination, WithdrawalRow } from '@/components/admin/WalletWithdrawalTable';
import { WITHDRAWAL_PAGE_SIZE } from '@/components/admin/WalletWithdrawalTable';
import { adminAuthHeaders } from '@/lib/adminSession';

export type PeriodBranchReport = {
  storeId: string;
  storeName: string;
  totalIn: number;
  pickupOnlineIn: number;
  deliveryCardIn: number;
  totalOut: number;
  currentBalance: number;
};

export interface WalletSummary {
  storeId: string;
  currentBalance: number;
  totalEarnings: number;
  netTransferableEarnings: number;
  totalWithdrawn: number;
  pendingWithdrawalTotal: number;
  availableBalance: number;
}

export type AdminWalletOverviewData = {
  wallets: StoreWallet[];
  summary: WalletSummary | null;
  dashboard: BranchWalletDashboard | null;
  periodBranchReports: PeriodBranchReport[];
};

export type AdminWalletWithdrawalsData = {
  withdrawals: WithdrawalRow[];
  pendingWithdrawals: WithdrawalRow[];
  pagination: WithdrawalPagination;
};

async function readApiError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { message?: string };
    const detail = json.message ? `${res.status}: ${json.message}` : String(res.status);
    return `${fallback} (${detail})`;
  } catch {
    return `${fallback} (${res.status})`;
  }
}

export async function fetchAdminWalletOverview(
  apiBase: string,
  periodFrom: string | null,
  periodTo: string | null,
  signal?: AbortSignal,
): Promise<AdminWalletOverviewData> {
  const isFiltered = periodFrom != null && periodTo != null;
  const qs = isFiltered
    ? `?${new URLSearchParams({ from: periodFrom, to: periodTo })}`
    : '';
  const res = await fetch(`${apiBase}/admin/wallet${qs}`, {
    headers: adminAuthHeaders(),
    credentials: 'include',
    signal,
  });
  if (!res.ok) throw new Error(await readApiError(res, 'Failed to load wallet data'));
  const json = await res.json();
  return {
    wallets: json.data.wallets ?? [],
    summary: json.data.summary ?? null,
    dashboard: json.data.dashboard ?? null,
    periodBranchReports: isFiltered
      ? ((json.data.periodBranchReports ?? []) as PeriodBranchReport[])
      : [],
  };
}

export async function fetchAdminWalletWithdrawals(
  apiBase: string,
  periodFrom: string | null,
  periodTo: string | null,
  page: number,
  normalizeWithdrawal: (row: WithdrawalRow) => WithdrawalRow,
  signal?: AbortSignal,
): Promise<AdminWalletWithdrawalsData> {
  const isFiltered = periodFrom != null && periodTo != null;
  const historyQs = new URLSearchParams({
    page: String(page),
    limit: String(WITHDRAWAL_PAGE_SIZE),
  });
  const pendingQs = new URLSearchParams({
    status: 'PENDING',
    limit: '50',
  });
  if (isFiltered) {
    historyQs.set('from', periodFrom);
    historyQs.set('to', periodTo);
    pendingQs.set('from', periodFrom);
    pendingQs.set('to', periodTo);
  }
  const [historyRes, pendingRes] = await Promise.all([
    fetch(`${apiBase}/admin/wallet/withdrawals?${historyQs}`, {
      headers: adminAuthHeaders(),
      credentials: 'include',
      signal,
    }),
    fetch(`${apiBase}/admin/wallet/withdrawals?${pendingQs}`, {
      headers: adminAuthHeaders(),
      credentials: 'include',
      signal,
    }),
  ]);

  let withdrawals: WithdrawalRow[] = [];
  let pagination: WithdrawalPagination = {
    page,
    limit: WITHDRAWAL_PAGE_SIZE,
    total: 0,
    pages: 1,
  };

  if (historyRes.ok) {
    const json = await historyRes.json();
    const items = (json.data?.items ?? []).map((row: WithdrawalRow) => normalizeWithdrawal(row));
    withdrawals = items;
    pagination =
      json.data?.pagination ?? {
        page,
        limit: WITHDRAWAL_PAGE_SIZE,
        total: items.length,
        pages: Math.max(1, Math.ceil(items.length / WITHDRAWAL_PAGE_SIZE)),
      };
  }

  let pendingWithdrawals: WithdrawalRow[] = [];
  if (pendingRes.ok) {
    const json = await pendingRes.json();
    pendingWithdrawals = json.data?.items ?? [];
  }

  return { withdrawals, pendingWithdrawals, pagination };
}
