'use client';

import { formatMoneyAmount } from '@/lib/receipt';
import { Wallet } from 'lucide-react';
import type {
  BranchPayoutDisplay,
  BranchReceiveDifference,
} from '@/components/admin/branchPayoutDisplay';
import {
  branchPayoutAmountIsVisible,
  branchPayoutWalletLabel,
  shouldShowBranchReceiveDifference,
} from '@/components/admin/branchPayoutDisplay';

type Props = {
  display: BranchPayoutDisplay;
  title?: string;
  subtitle?: string;
  /** When set, overrides `display.periodWalletNetLkr` in the wallet + Jason composition line. */
  walletLineLkr?: number;
  branchReceiveDifference?: BranchReceiveDifference | null;
  className?: string;
  size?: 'lg' | 'md';
  compositionJoiner?: string;
};

/** Branch payout total with optional wallet + Jason composition and cap explanation. */
export default function BranchPayoutHero({
  display,
  title = 'Branch payout',
  subtitle = 'Amount your branch receives',
  walletLineLkr,
  branchReceiveDifference = null,
  className = 'mb-4',
  size = 'lg',
  compositionJoiner = ' · ',
}: Props) {
  const { totalBranchPayoutLkr, periodWalletNetLkr, jasonTopUpLkr, scope } = display;
  if (!branchPayoutAmountIsVisible(totalBranchPayoutLkr)) return null;

  const walletLabel = branchPayoutWalletLabel(scope);
  const compositionWalletLkr = walletLineLkr ?? periodWalletNetLkr;
  const showComposition = branchPayoutAmountIsVisible(jasonTopUpLkr);
  const showDifferenceNote = shouldShowBranchReceiveDifference(
    branchReceiveDifference,
    totalBranchPayoutLkr,
  );

  const titleClass = size === 'lg' ? 'text-[11px]' : 'text-[10px]';
  const amountClass = size === 'lg' ? 'text-[26px]' : 'text-[22px]';
  const subtitleClass = size === 'lg' ? 'text-[12px]' : 'text-[11px]';

  return (
    <div
      className={`flex items-start gap-4 rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-5 py-4 dark:border-blue-800 dark:bg-blue-950/30 ${className}`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#3b82f6] bg-white dark:bg-slate-900">
        <Wallet size={20} className="text-[#3b82f6]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={`${titleClass} font-bold uppercase tracking-wide text-[#3b82f6]`}>{title}</p>
        <p
          className={`mt-1 ${amountClass} font-bold leading-tight tabular-nums text-[#2563eb]`}
        >
          LKR {formatMoneyAmount(totalBranchPayoutLkr)}
        </p>
        <p className={`mt-1 ${subtitleClass} font-medium text-[#475569] dark:text-slate-300`}>
          {subtitle}
        </p>
        {showComposition && (
          <p className="mt-2 text-[11px] leading-relaxed text-[#64748b] dark:text-slate-400">
            {walletLabel} LKR {formatMoneyAmount(compositionWalletLkr)}
            {compositionJoiner}
            Jason promo top-up LKR {formatMoneyAmount(jasonTopUpLkr)}
          </p>
        )}
        {showDifferenceNote && (
          <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-[11px] leading-relaxed text-[#475569] dark:text-slate-300">
            <p className="font-bold text-amber-700 dark:text-amber-300">
              Why this differs from net payout
            </p>
            <p className="mt-1">
              Net payout for this period is LKR{' '}
              {formatMoneyAmount(branchReceiveDifference.periodFinalPayLkr)} (includes Jason top-up).
              You receive LKR {formatMoneyAmount(totalBranchPayoutLkr)} because only LKR{' '}
              {formatMoneyAmount(branchReceiveDifference.payableWalletLkr)} is paid from your branch
              wallet—the lowest of your request (LKR{' '}
              {formatMoneyAmount(branchReceiveDifference.requestedWalletLkr)}), available balance
              (LKR {formatMoneyAmount(branchReceiveDifference.availableWalletLkr)}), and this
              period&apos;s calculated net (LKR{' '}
              {formatMoneyAmount(branchReceiveDifference.periodNetLkr)})—plus the Jason top-up.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
