'use client';

import {
  formatWithdrawalCheckPaymentDetail,
  WITHDRAWAL_METHOD_META,
} from '@/components/admin/withdrawalPaymentUtils';
import type { WithdrawalRow } from './WalletWithdrawalTable';

type Props = {
  row: WithdrawalRow;
};

export default function WithdrawalPaymentCell({ row }: Props) {
  if (row.status !== 'APPROVED' || !row.paymentMethod) {
    return <span className="text-xs text-[var(--color-text-muted)]">—</span>;
  }

  const methodKey = row.paymentMethod as keyof typeof WITHDRAWAL_METHOD_META;
  const meta = WITHDRAWAL_METHOD_META[methodKey];
  if (!meta) {
    return <span className="text-xs text-[var(--color-text-muted)]">—</span>;
  }

  const MethodIcon = meta.icon;
  const checkDetail =
    methodKey === 'CHECK'
      ? formatWithdrawalCheckPaymentDetail(row.checkNumber, row.checkDate)
      : null;

  return (
    <div className="flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.chipClass}`}
      >
        <MethodIcon size={13} className={meta.iconClass} />
        {meta.label}
      </span>
      {checkDetail ? (
        <span className="text-[10px] font-medium tabular-nums text-[var(--color-text-muted)]">
          {checkDetail}
        </span>
      ) : null}
    </div>
  );
}
