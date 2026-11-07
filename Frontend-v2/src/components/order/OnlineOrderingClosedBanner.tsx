'use client';

import { Clock, Heart } from 'lucide-react';

interface Props {
  title?: string;
  message: string;
  detail?: string;
  className?: string;
}

/** High-contrast banner for closed online ordering (readable in light + dark themes). */
export default function OnlineOrderingClosedBanner({
  title = 'Online ordering closed',
  message,
  detail,
  className = '',
}: Props) {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-amber-600/35 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm ${className}`.trim()}
    >
      <p className="font-semibold text-amber-950 dark:text-amber-50 flex items-center gap-2">
        <Clock size={16} className="shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
        {title}
      </p>
      <p className="text-amber-900 dark:text-amber-100 mt-1.5 leading-relaxed">{message}</p>
      {detail && <p className="text-amber-800/80 dark:text-amber-200/80 text-xs mt-2">{detail}</p>}
      <p className="text-xs text-amber-800/70 dark:text-amber-200/70 mt-2 flex items-center gap-1.5">
        <Heart size={12} className="shrink-0" aria-hidden />
        You can still save favourites to your wishlist.
      </p>
    </div>
  );
}
