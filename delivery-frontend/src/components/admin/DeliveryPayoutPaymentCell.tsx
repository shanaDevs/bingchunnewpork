'use client';

import type { DeliveryPayoutHistoryRow } from '@/lib/deliveryPayoutTypes';
import { DELIVERY_PAYOUT_METHOD_META, type DeliveryPayoutPaymentMethodKey } from './deliveryPayoutPaymentUtils';

type Props = {
  row: Pick<DeliveryPayoutHistoryRow, 'status' | 'paymentMethod' | 'checkNumber' | 'checkDate'>;
};

function formatCheckDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function DeliveryPayoutPaymentCell({ row }: Props) {
  if (row.status !== 'APPROVED' || !row.paymentMethod) {
    return <span className="text-xs text-muted">—</span>;
  }

  const methodKey = row.paymentMethod as DeliveryPayoutPaymentMethodKey;
  const meta = DELIVERY_PAYOUT_METHOD_META[methodKey];
  if (!meta) {
    return <span className="text-xs text-muted">{row.paymentMethod}</span>;
  }

  const MethodIcon = meta.icon;

  return (
    <div className="min-w-0">
      <span
        className={`inline-flex w-fit max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${meta.chipClass}`}
      >
        <MethodIcon size={13} className={meta.iconClass} />
        {meta.label}
      </span>
      {methodKey === 'CHECK' && (row.checkNumber?.trim() || row.checkDate) && (
        <p className="mt-1 max-w-[140px] text-[10px] leading-snug text-muted">
          {row.checkNumber?.trim() && <>#{row.checkNumber.trim()}</>}
          {row.checkNumber?.trim() && row.checkDate && ' · '}
          {row.checkDate && formatCheckDate(row.checkDate)}
        </p>
      )}
    </div>
  );
}
