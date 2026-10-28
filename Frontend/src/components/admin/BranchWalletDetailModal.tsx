'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBase';
import BranchWalletDetail from '@/components/admin/BranchWalletDetail';
import WalletApproveWithdrawalModal from '@/components/admin/WalletApproveWithdrawalModal';
import type { WithdrawalRow } from '@/components/admin/WalletWithdrawalTable';
import type { DuePeriodFocus } from '@/components/admin/payoutPeriodView';

type Props = {
  open: boolean;
  storeId: string | null;
  branchName?: string;
  onClose: () => void;
  /** Open Initiate Payout immediately after the branch wallet loads. */
  autoInitiatePayout?: boolean;
  /** When set (Payouts Due View), open the matching 15-day period breakdown first. */
  duePeriodFocus?: DuePeriodFocus | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  periodLabel?: string | null;
};

export default function BranchWalletDetailModal({
  open,
  storeId,
  branchName,
  onClose,
  autoInitiatePayout = false,
  duePeriodFocus = null,
  periodFrom = null,
  periodTo = null,
  periodLabel = null,
}: Props) {
  const [viewWithdrawalTarget, setViewWithdrawalTarget] = useState<WithdrawalRow | null>(null);
  const [withdrawalRefreshSignal, setWithdrawalRefreshSignal] = useState(0);

  const apiBase = getApiBaseUrl();

  useEffect(() => {
    if (!open) setViewWithdrawalTarget(null);
  }, [open]);

  return (
    <>
      {open && storeId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 sm:p-6"
          onClick={onClose}
          role="presentation"
        >
          <div
            className="card relative flex max-h-[min(95vh,960px)] w-full max-w-6xl flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={branchName ? `${branchName} wallet` : 'Branch wallet'}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-navy-border)] px-6 py-5">
              <p className="text-lg font-semibold text-[var(--color-text)]">
                {branchName ?? 'Branch Wallet'}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-input-bg)] hover:text-[var(--color-text)]"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
              <BranchWalletDetail
                storeId={storeId}
                embedded
                onViewWithdrawal={setViewWithdrawalTarget}
                withdrawalRefreshSignal={withdrawalRefreshSignal}
                autoInitiatePayout={autoInitiatePayout}
                duePeriodFocus={duePeriodFocus}
                periodFrom={periodFrom}
                periodTo={periodTo}
                periodLabel={periodLabel}
              />
            </div>
          </div>
        </div>
      )}

      <WalletApproveWithdrawalModal
        open={!!viewWithdrawalTarget}
        withdrawal={viewWithdrawalTarget}
        branchName={branchName}
        apiBase={apiBase}
        elevated
        onClose={() => setViewWithdrawalTarget(null)}
        onApproved={() => {
          setViewWithdrawalTarget(null);
          setWithdrawalRefreshSignal((n) => n + 1);
        }}
      />
    </>
  );
}
