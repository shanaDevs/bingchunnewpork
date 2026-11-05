'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart2, Sparkles, WalletCards, PackageOpen } from 'lucide-react';
import { getAdminSession, isBranchScoped, type AdminSession } from '@/lib/adminAuth';
import LowStockReport from '@/components/admin/reports/LowStockReport';
import ProductPerformanceReport from '@/components/admin/reports/ProductPerformanceReport';
import CustomerLoyaltyReport from '@/components/admin/reports/CustomerLoyaltyReport';
import GlobalOverviewReport from '@/components/admin/reports/GlobalOverviewReport';
import WalletLedgerReport from '@/components/admin/reports/WalletLedgerReport';
import BranchSettlementReport from '@/components/admin/reports/BranchSettlementReport';
import CancellationReport from '@/components/admin/reports/CancellationReport';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { branchDisplayName } from '@/components/admin/reports/reportUtils';

type ReportTab = 'sales' | 'payments' | 'orders';

const TABS = [
  { id: 'sales', label: 'Sales', icon: Sparkles },
  { id: 'payments', label: 'Payments', icon: WalletCards },
  { id: 'orders', label: 'Orders', icon: PackageOpen },
] as const;

export default function BranchReportsPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<ReportTab>('sales');

  useEffect(() => {
    const session = getAdminSession();
    if (!session || !isBranchScoped(session)) {
      router.replace('/admin');
      return;
    }
    setAdmin(session);
    setReady(true);
  }, [router]);

  if (!ready || !admin) {
    return <div className="py-16 text-center text-muted text-sm">Loading reports…</div>;
  }

  const lockedStoreId = admin.storeId ?? '';
  const lockedStoreName = admin.storeName ?? undefined;

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BarChart2 size={22} className="text-brand" />
          <h1 className="text-2xl font-bold text-fg">Reports</h1>
        </div>
        <p className="text-muted text-sm">
          Branch reports for{' '}
          {admin.storeName ? branchDisplayName(admin.storeName) : 'your store'}
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ReportTab)} className="w-full min-w-0">
        <TabsList className="no-print mb-6">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <TabsTrigger key={item.id} value={item.id} className="gap-2 px-4">
                <Icon size={16} className="data-[state=active]:text-brand" />
                <span>{item.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="sales" className="mt-0 min-w-0">
          <ProductPerformanceReport
            lockedStoreId={lockedStoreId}
            lockedStoreName={lockedStoreName}
          />
          <CustomerLoyaltyReport
            lockedStoreId={lockedStoreId}
            lockedStoreName={lockedStoreName}
          />
          <GlobalOverviewReport
            lockedStoreId={lockedStoreId}
            lockedStoreName={lockedStoreName}
          />
          <WalletLedgerReport
            lockedStoreId={lockedStoreId}
            lockedStoreName={lockedStoreName}
          />
        </TabsContent>

        <TabsContent value="payments" className="mt-0 min-w-0">
          <BranchSettlementReport
            lockedStoreId={lockedStoreId}
            lockedStoreName={lockedStoreName}
          />
        </TabsContent>

        <TabsContent value="orders" className="mt-0 min-w-0">
          <CancellationReport
            lockedStoreId={lockedStoreId}
            lockedStoreName={lockedStoreName}
          />
          <LowStockReport storeId={lockedStoreId} storeName={lockedStoreName} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
