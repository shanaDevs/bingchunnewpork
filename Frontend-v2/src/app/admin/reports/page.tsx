'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart2, Sparkles, WalletCards, PackageOpen } from 'lucide-react';

import { getAdminSession, isSuperAdmin, type AdminSession } from '@/lib/adminAuth';

import BranchPerformanceReport from '@/components/admin/reports/BranchPerformanceReport';
import ProductPerformanceReport from '@/components/admin/reports/ProductPerformanceReport';
import HighValueCustomersReport from '@/components/admin/reports/HighValueCustomersReport';
import CustomerLoyaltyReport from '@/components/admin/reports/CustomerLoyaltyReport';
import GlobalOverviewReport from '@/components/admin/reports/GlobalOverviewReport';
import WalletLedgerReport from '@/components/admin/reports/WalletLedgerReport';
import SlabRateReport from '@/components/admin/reports/SlabRateReport';
import BranchSettlementReport from '@/components/admin/reports/BranchSettlementReport';
import OrderLifecycleReport from '@/components/admin/reports/OrderLifecycleReport';
import FulfillmentReport from '@/components/admin/reports/FulfillmentReport';
import CancellationReport from '@/components/admin/reports/CancellationReport';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type ReportTab = 'sales' | 'payments' | 'orders';

const TABS = [
  { id: 'sales', label: 'Sales', icon: Sparkles, hint: 'Branches, products & customers' },
  { id: 'payments', label: 'Payments', icon: WalletCards, hint: 'Wallet, fees & settlements' },
  { id: 'orders', label: 'Orders', icon: PackageOpen, hint: 'Lifecycle, efficiency & issues' },
] as const;

export default function AdminReportsPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<ReportTab>('sales');

  useEffect(() => {
    const session = getAdminSession();
    if (!session || !isSuperAdmin(session)) {
      router.replace('/admin');
      return;
    }
    setAdmin(session);
    setReady(true);
  }, [router]);

  if (!ready || !admin) {
    return (
      <div className="py-16 text-center text-muted text-sm">Loading reports…</div>
    );
  }

  return (
    <div className="min-w-0 max-w-full">
      <div className="no-print flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart2 size={22} className="text-brand" />
            <h1 className="text-2xl font-bold text-white">Reports</h1>
          </div>
          <p className="text-muted text-sm">
            Super admin report hub — customize columns with checkboxes, then export CSV or PDF.
          </p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ReportTab)} className="w-full min-w-0">
        <TabsList className="no-print mb-6">
          {TABS.map((item) => {
            const Icon = item.icon;
            return (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className="gap-2 px-4"
              >
                <Icon size={16} className="data-[state=active]:text-brand" />
                <span>{item.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="sales" className="mt-0 min-w-0">
          <BranchPerformanceReport />
          <ProductPerformanceReport />
          <HighValueCustomersReport />
          <CustomerLoyaltyReport />
        </TabsContent>

        <TabsContent value="payments" className="mt-0 min-w-0">
          <GlobalOverviewReport />
          <WalletLedgerReport />
          <SlabRateReport />
          <BranchSettlementReport />
        </TabsContent>

        <TabsContent value="orders" className="mt-0 min-w-0">
          <OrderLifecycleReport />
          <FulfillmentReport />
          <CancellationReport />
        </TabsContent>
      </Tabs>
    </div>
  );
}
