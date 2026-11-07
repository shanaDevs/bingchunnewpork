'use client';

import { UserX } from 'lucide-react';

interface Props {
  className?: string;
}

/** High-contrast notice for soft-deleted accounts (readable in light + dark themes). */
export default function DeletedAccountBanner({ className = '' }: Props) {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-amber-600/40 bg-amber-50 dark:bg-amber-950/45 p-4 text-sm ${className}`.trim()}
    >
      <p className="font-semibold text-amber-950 dark:text-amber-50 flex items-center gap-2">
        <UserX size={16} className="shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
        Account deleted
      </p>
      <p className="text-amber-900 dark:text-amber-100 mt-1.5 leading-relaxed">
        This profile was deleted. Sign in again with OTP and choose to recover your account or create a
        new one.
      </p>
    </div>
  );
}
