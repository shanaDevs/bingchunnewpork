'use client';

import { formatOrderChannel, type OrderChannel } from '@/lib/orderChannel';

type Props = {
  channel?: string | null;
  className?: string;
  /** Show compact pill suitable for table cells */
  compact?: boolean;
};

const CHANNEL_CLASS: Record<OrderChannel, string> = {
  WEB: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
  APP: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/30',
  POS: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/15 dark:text-amber-200 dark:border-amber-500/30',
  WHATSAPP:
    'bg-emerald-100 text-emerald-800 border-emerald-400 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-400/40 font-semibold',
  TELEGRAM:
    'bg-blue-100 text-blue-800 border-blue-400 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-400/40 font-semibold',
};

export default function OrderChannelBadge({ channel, className = '', compact = false }: Props) {
  const key = ((channel || 'WEB').toUpperCase() as OrderChannel);
  const style = CHANNEL_CLASS[key] || CHANNEL_CLASS.WEB;
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 ${
        compact ? 'py-0.5 text-[10px]' : 'py-1 text-xs'
      } whitespace-nowrap ${style} ${className}`}
      title={formatOrderChannel(key)}
    >
      {formatOrderChannel(key)}
    </span>
  );
}
