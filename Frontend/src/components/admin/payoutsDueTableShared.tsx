import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export const PAYOUTS_DUE_ALLOCATION_COLUMNS = [
  'Branch payout',
  'Customer convenience fee',
  'Platform commission',
  'Delivery fee received',
] as const;

export const PAYOUTS_DUE_TABLE_COL_COUNT = 4 + PAYOUTS_DUE_ALLOCATION_COLUMNS.length + 3;

const PAYOUTS_DUE_SKELETON_WIDTHS = [
  'w-4',
  'w-28',
  'w-36',
  'w-10',
  'w-16',
  'w-16',
  'w-16',
  'w-16',
  'w-14',
  'w-14',
  'w-20',
] as const;

const TABLE_HEAD_ROW_CLASS =
  'border-b border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/50 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]';

const TH_BASE = 'px-3 py-2.5 font-semibold whitespace-nowrap';
const TH_RIGHT = `${TH_BASE} text-right`;

export function PayoutsDueTableHead() {
  return (
    <thead>
      <tr className={TABLE_HEAD_ROW_CLASS}>
        <th scope="col" className={TH_BASE}>
          In review
        </th>
        <th scope="col" className={TH_BASE}>
          Branch
        </th>
        <th scope="col" className={TH_BASE}>
          Period
        </th>
        <th scope="col" className={TH_RIGHT}>
          Orders
        </th>
        {PAYOUTS_DUE_ALLOCATION_COLUMNS.map((label) => (
          <th key={label} scope="col" className={TH_RIGHT}>
            {label}
          </th>
        ))}
        <th scope="col" className={TH_RIGHT}>
          Wallet view
        </th>
        <th scope="col" className={TH_RIGHT}>
          PDF
        </th>
        <th scope="col" className={TH_RIGHT}>
          Action
        </th>
      </tr>
    </thead>
  );
}

export function PayoutsDueTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-navy-border)] px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24 bg-[var(--color-navy-light)]/70" />
          <Skeleton className="h-3 w-40 bg-[var(--color-navy-light)]/70" />
        </div>
        <Skeleton className="h-8 w-full max-w-[220px] rounded-[12px] bg-[var(--color-navy-light)]/70 sm:w-[220px]" />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1240px] text-left text-xs">
          <PayoutsDueTableHead />
          <tbody>
            {Array.from({ length: rows }).map((_, row) => (
              <tr
                key={row}
                className="border-b border-[var(--color-navy-border)]/70 last:border-b-0"
              >
                {Array.from({ length: PAYOUTS_DUE_TABLE_COL_COUNT }).map((__, col) => (
                  <td
                    key={col}
                    className={col >= 3 && col <= 7 ? 'px-3 py-3 text-right' : 'px-3 py-3'}
                  >
                    <Skeleton
                      className={cn(
                        'h-3.5 bg-[var(--color-navy-light)]/70',
                        PAYOUTS_DUE_SKELETON_WIDTHS[col] ?? 'w-20',
                        col >= 3 && col <= 7 && 'ml-auto',
                        col >= 8 && 'ml-auto inline-block',
                      )}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
