'use client';

import Link from 'next/link';
import { ChevronRight, Receipt } from 'lucide-react';

import { BrandKpiCardHeader } from '@/components/admin/BrandKpiIconBox';
import { KPI_LIGHT } from '@/lib/dashboardTheme';

type WalletRow = {
  storeId: string;
  storeName: string;
  city: string;
  balance: number;
};

type Props = {
  wallets: WalletRow[];
  maxBalance: number;
  loading?: boolean;
  fmtWallet: (cents: number) => string;
};

export default function SuperAdminBranchPayablesCard({
  wallets,
  maxBalance,
  loading,
  fmtWallet,
}: Props) {
  const theme = KPI_LIGHT.green;

  return (
    <div className="card flex h-full min-h-[260px] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border/40 px-5 py-4">
        <BrandKpiCardHeader icon={Receipt} theme={theme} title="Branch Payable Balances" size="sm" accentTitle={false} titleClassName="text-sm font-semibold text-fg" />
        <Link href="/admin/wallet" className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-brand hover:underline">
          View all
          <ChevronRight size={14} />
        </Link>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {loading ? (
          <p className="py-8 text-center text-sm text-muted">Loading…</p>
        ) : wallets.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">No wallet balances</p>
        ) : (
          <div className="space-y-3">
            {wallets.map((w) => {
              const label = w.city ? `${w.storeName} - ${w.city}` : w.storeName;
              const hasBalance = w.balance > 0;
              return (
                <div key={w.storeId}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                    <Link
                      href={`/admin/wallet/${w.storeId}`}
                      className="truncate font-semibold text-fg hover:text-brand"
                      title={label}
                    >
                      {label}
                    </Link>
                    <span className={hasBalance ? 'shrink-0 font-bold text-green-500' : 'shrink-0 text-muted'}>
                      {fmtWallet(w.balance)}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-navy-light/80">
                    <div
                      className={`h-full rounded-full transition-all ${hasBalance ? 'bg-green-500' : 'bg-transparent'}`}
                      style={{ width: `${maxBalance > 0 ? (w.balance / maxBalance) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
