'use client';

import DashboardHourlyPeakTimes from '@/components/admin/DashboardHourlyPeakTimes';
import DashboardRecentOrdersTable from '@/components/admin/DashboardRecentOrdersTable';
import SuperAdminBranchPayablesCard from '@/components/admin/SuperAdminBranchPayablesCard';

type WalletRow = {
  storeId: string;
  storeName: string;
  city: string;
  balance: number;
};

type Store = {
  id: string;
  name: string;
  deliveryEnabled?: boolean;
  tier?: string;
};

type Props = {
  walletBalances: WalletRow[];
  stores?: Store[];
  recentOrders: Parameters<typeof DashboardRecentOrdersTable>[0]['orders'];
  loading?: boolean;
  fmtWallet: (cents: number) => string;
};

export default function SuperAdminDashboardLowerSection({
  walletBalances,
  stores,
  recentOrders,
  loading,
  fmtWallet,
}: Props) {
  const maxWallet = Math.max(...walletBalances.map((w) => w.balance), 1);

  return (
    <div className="super-admin-dashboard-lower space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <SuperAdminBranchPayablesCard
          wallets={walletBalances}
          maxBalance={maxWallet}
          loading={loading}
          fmtWallet={fmtWallet}
        />
        <DashboardHourlyPeakTimes stores={stores} variant="superAdmin" />
      </div>

      <DashboardRecentOrdersTable
        orders={recentOrders}
        loading={loading}
        variant="superAdmin"
      />
    </div>
  );
}
