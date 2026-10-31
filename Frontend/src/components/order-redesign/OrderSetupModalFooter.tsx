'use client';

import { ArrowRight, Bike, Store } from 'lucide-react';
import { cn } from '@/components/home-redesign/lib/cn';
import { orderSetupCopy } from '@/components/order-redesign/orderSetupCopy';
import { orderSetupFocusRing } from '@/components/order-redesign/orderSetupUi';
import type { OrderSetupFooterState } from '@/components/order-redesign/orderSetupFooter';

type Props = {
  footer: OrderSetupFooterState;
};

export function OrderSetupModalFooter({ footer }: Props) {
  return (
    <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-brand-100 bg-white px-5 py-2.5 sm:px-8">
      <p className="min-w-0 text-xs leading-snug text-slate-600 sm:text-sm" aria-live="polite">
        {footer.hintBold && footer.mode ? (
          <span className="flex items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 max-sm:hidden">
              {footer.mode === 'TAKEAWAY' ? (
                <Store className="size-4" aria-hidden="true" />
              ) : (
                <Bike className="size-4" aria-hidden="true" />
              )}
            </span>
            <span>
              {footer.hint}{' '}
              <strong className="font-semibold text-brand-900">{footer.hintBold}</strong>
            </span>
          </span>
        ) : (
          footer.hint
        )}
      </p>
      <button
        type="button"
        disabled={footer.disabled}
        onClick={footer.onConfirm}
        className={cn(
          'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-full bg-brand-600 px-5 text-sm font-semibold text-snow shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none sm:px-6 sm:text-base',
          orderSetupFocusRing,
        )}
      >
        {orderSetupCopy.viewMenu}
        <ArrowRight className="size-4" aria-hidden="true" />
      </button>
    </footer>
  );
}
