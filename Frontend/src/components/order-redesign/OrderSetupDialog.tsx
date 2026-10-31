'use client';

import { ArrowLeft, Bike, Store, X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/components/home-redesign/lib/cn';
import { homeFontVariables } from '@/components/home-redesign/fonts';
import {
  orderSetupDialogBackdrop,
  orderSetupDialogPanel,
  orderSetupFocusRing,
} from '@/components/order-redesign/orderSetupUi';
import { OrderSetupHighlight } from '@/components/order-redesign/OrderSetupHighlight';
import { orderSetupCopy } from '@/components/order-redesign/orderSetupCopy';
import type { OrderMode } from '@/store/cartStore';

type OrderSetupDialogProps = {
  open: boolean;
  onClose: () => void;
  required?: boolean;
  step: 'choose' | 'setup';
  mode: OrderMode;
  onBackToType?: () => void;
  footer?: ReactNode;
  children: ReactNode;
};

const modeMeta: Record<OrderMode, { label: string; icon: typeof Store }> = {
  TAKEAWAY: { label: 'Pickup', icon: Store },
  DELIVERY: { label: 'Delivery', icon: Bike },
};

/**
 * Native dialog shell aligned with bingchun-homepage-redesign BranchSelectModal:
 * small centred card for order type, full branch/map panel for setup.
 */
export function OrderSetupDialog({
  open,
  onClose,
  required = false,
  step,
  mode,
  onBackToType,
  footer,
  children,
}: OrderSetupDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const unmounting = useRef(false);
  const pressedOnBackdrop = useRef(false);
  const isLarge = step === 'setup';
  const modeOption = modeMeta[mode];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    unmounting.current = false;
    if (!dialog.open) dialog.showModal();
    document.documentElement.style.overflow = 'hidden';
    return () => {
      unmounting.current = true;
      dialog.close();
      document.documentElement.style.removeProperty('overflow');
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    headingRef.current?.focus({ preventScroll: true });
  }, [open, step]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="order-setup-heading"
      onCancel={(event) => {
        event.preventDefault();
        if (!required) onClose();
      }}
      onClose={(event) => {
        if (!unmounting.current && !event.currentTarget.open) onClose();
      }}
      onPointerDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (!required && pressedOnBackdrop.current && event.target === event.currentTarget) onClose();
      }}
      className={orderSetupDialogBackdrop}
    >
      <div
        key={step}
        className={cn(
          'home-redesign',
          homeFontVariables,
          orderSetupDialogPanel,
          isLarge
            ? 'max-md:h-[calc(100dvh-0.75rem)] md:max-w-6xl'
            : 'md:max-w-xl',
        )}
      >
        <header className="relative shrink-0 px-5 pt-6 pb-4 sm:px-8 sm:pt-8 short:pt-4 short:pb-3">
          {step === 'setup' && onBackToType ? (
            <div className="flex items-center gap-2 pr-12">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onBackToType();
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full py-1.5 pr-3.5 pl-2.5 text-sm font-semibold text-brand-700 ring-1 ring-brand-200 ring-inset transition-colors hover:bg-brand-50 max-lg:h-10 max-lg:pr-4 max-lg:pl-3',
                  orderSetupFocusRing,
                )}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Back
              </button>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 max-lg:h-10">
                <modeOption.icon className="size-4" aria-hidden="true" />
                {modeOption.label}
              </span>
            </div>
          ) : (
            <p className="text-xs font-semibold tracking-[0.2em] text-brand-600 uppercase short:hidden">
              {orderSetupCopy.beforeYouOrder}
            </p>
          )}
          <h2
            ref={headingRef}
            id="order-setup-heading"
            tabIndex={-1}
            className={cn(
              "font-display pr-12 text-[clamp(1.75rem,4.2vw,2.5rem)] leading-[1.05] font-semibold tracking-[-0.01em] text-black uppercase outline-none [font-variation-settings:'wdth'_75,'opsz'_96] [word-spacing:0.12em] short:mt-0 short:text-2xl",
              step === 'setup' ? 'mt-3 short:sr-only' : 'mt-2',
            )}
          >
            {step === 'choose' ? (
              <>
                {orderSetupCopy.headingTypeLead}{' '}
                <OrderSetupHighlight>{orderSetupCopy.headingTypeHighlight}</OrderSetupHighlight>
              </>
            ) : (
              <>
                {orderSetupCopy.headingBranchLead}{' '}
                <OrderSetupHighlight>{orderSetupCopy.headingBranchHighlight}</OrderSetupHighlight>{' '}
                {orderSetupCopy.headingBranchTail}
              </>
            )}
          </h2>
          {!required && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={cn(
                'absolute top-5 right-5 grid size-11 place-items-center rounded-full bg-brand-50 text-brand-700 transition-colors hover:bg-brand-100 sm:top-7 sm:right-7 short:top-3',
                orderSetupFocusRing,
              )}
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          )}
        </header>

        <div className={cn('flex min-h-0 flex-1 flex-col', isLarge && 'overflow-hidden')}>{children}</div>

        {footer}
      </div>
    </dialog>
  );
}
