'use client';

import { formatOrderChannel, type OrderChannel } from '@/lib/orderChannel';

type Props = {
  channel?: string | null;
  className?: string;
  /** Show compact pill suitable for table cells */
  compact?: boolean;
};

const CHANNEL_CLASS: Record<OrderChannel, string> = {
  WEB: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  APP: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  POS: 'bg-amber-500/15 text-amber-200 border-amber-500/30',
  WHATSAPP: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40 font-semibold',
  TELEGRAM: 'bg-blue-500/20 text-blue-300 border-blue-400/40 font-semibold',
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
