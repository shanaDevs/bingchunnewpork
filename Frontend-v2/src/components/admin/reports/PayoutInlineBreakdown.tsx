'use client';

import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '@/components/admin/reports/reportUtils';
import PayoutSettlementStatement, {
  type PayoutDetail,
} from '@/components/admin/reports/PayoutSettlementStatement';

type Props = {
  transactionId?: string;
  open: boolean;
  colSpan: number;
};

function SkeletonBlock() {
  return (
    <div className="animate-pulse rounded-xl border border-navy-border/60 bg-navy-light/10">
      <div className="h-12 border-b border-navy-border/40 bg-navy-light/20" />
      <div className="h-10 bg-navy-light/15" />
      <div className="space-y-0">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-9 border-t border-navy-border/30" />
        ))}
      </div>
    </div>
  );
}

export default function PayoutInlineBreakdown({ transactionId, open, colSpan }: Props) {
  const { data, isLoading, isError } = useQuery<PayoutDetail>({
    queryKey: ['payout-detail', transactionId],
    queryFn: () => adminFetch(`/admin/wallet/payout-detail/${transactionId}`),
    enabled: open && !!transactionId,
    staleTime: 60_000,
  });

  if (!open || !transactionId) return null;

  return (
    <tr className="bg-navy-light/10 border-b border-navy-border">
      <td colSpan={colSpan} className="px-3 sm:px-4 py-4">
        {isLoading && <SkeletonBlock />}

        {isError && (
          <p className="text-sm text-rose-300 py-2">
            Could not load payout settlement. Please try again.
          </p>
        )}

        {data && !isLoading && <PayoutSettlementStatement detail={data} variant="screen" />}
      </td>
    </tr>
  );
}
