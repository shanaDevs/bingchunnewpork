'use client';

import type { LucideIcon } from 'lucide-react';
import { Banknote, Coins, CreditCard } from 'lucide-react';
import { DashSkel } from '@/components/admin/BranchDashboardSkeleton';
import { formatMoneyAmount } from '@/lib/receipt';

type CalcTone = 'blue' | 'red' | 'green';
type AmountScale = 'before' | 'fee' | 'net';

function centsToMoney(cents: number): string {
  return formatMoneyAmount(cents / 100);
}

function CalcCell({
  tone,
  icon: Icon,
  label,
  amountCents,
  loading,
  amountScale = 'fee',
}: {
  tone: CalcTone;
  icon: LucideIcon;
  label: string;
  amountCents: number;
  loading: boolean;
  amountScale?: AmountScale;
}) {
  return (
    <div
      className={`branch-wallet-receivable__calc-cell branch-wallet-receivable__calc-cell--${tone}`}
    >
      <div className="branch-wallet-receivable__calc-icon" aria-hidden>
        <Icon size={16} strokeWidth={2.15} />
      </div>
      <div className="branch-wallet-receivable__calc-copy">
        <p className="branch-wallet-receivable__calc-label">{label}</p>
        <p
          className={`branch-wallet-receivable__calc-amount branch-wallet-receivable__calc-amount--${amountScale}`}
        >
          {loading ? (
            <DashSkel className="h-5 w-24 max-w-full bg-slate-900/10" />
          ) : (
            centsToMoney(amountCents)
          )}
        </p>
      </div>
    </div>
  );
}

type Props = {
  beforeGatewayCents: number;
  gatewayFeeCents: number;
  netPayoutCents: number;
  loading?: boolean;
};

/** In-card strip: (before gateway − gateway fee) = net payout. */
export default function BranchReceivablePayoutCalc({
  beforeGatewayCents,
  gatewayFeeCents,
  netPayoutCents,
  loading = false,
}: Props) {
  return (
    <div
      className="branch-wallet-receivable__calc"
      role="group"
      aria-label="Branch receivable payout calculation"
    >
      <div className="branch-wallet-receivable__calc-row">
        <div className="branch-wallet-receivable__calc-stack">
          <CalcCell
            tone="blue"
            icon={Coins}
            label="(Before Gateway Fee)"
            amountCents={beforeGatewayCents}
            loading={loading}
            amountScale="before"
          />
          <span className="branch-wallet-receivable__calc-op" aria-hidden="true">
            −
          </span>
          <CalcCell
            tone="red"
            icon={CreditCard}
            label="Payment Gateway Fee"
            amountCents={gatewayFeeCents}
            loading={loading}
            amountScale="fee"
          />
        </div>
        <span
          className="branch-wallet-receivable__calc-op branch-wallet-receivable__calc-op--equals"
          aria-hidden="true"
        >
          =
        </span>
        <CalcCell
          tone="green"
          icon={Banknote}
          label="Net Payout to Branch"
          amountCents={netPayoutCents}
          loading={loading}
          amountScale="net"
        />
      </div>
    </div>
  );
}