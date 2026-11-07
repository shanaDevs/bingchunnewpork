'use client';

import { useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';
import { OrderModeSelector, type OrderFlowStep } from './OrderModeSelector';
import { homeFontVariables } from '@/components/home-redesign/fonts';
import { cn } from '@/components/home-redesign/lib/cn';
import { runDeferredOrderSetupAction } from '@/lib/postOrderSetupAction';
import type { OrderMode } from '@/store/cartStore';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSetupComplete?: () => void;
  onSkip?: () => void;
  required?: boolean;
  initialMode?: OrderMode;
  startAtSetup?: boolean;
}

/**
 * Order type and branch popup, in the redesign's look (the prototype's BranchSelectModal): one panel whose
 * size follows the step — a small centred card to choose Pickup or Delivery (or to continue with last time's
 * branch), then the wide setup panel with the list and map. On phones it is a bottom sheet, full height on the
 * setup step. The content and every backend call live in OrderModeSelector.
 *
 * `required` (the menu page, nothing chosen yet): no close button, and neither Escape nor a click outside closes it.
 */
export default function OrderModeModal({
  isOpen,
  onClose,
  onSetupComplete,
  onSkip,
  required = false,
  initialMode,
  startAtSetup = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [step, setStep] = useState<OrderFlowStep>(() => (startAtSetup && initialMode ? 'setup' : 'type'));
  const large = step === 'setup';

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !required) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, required]);

  // Each opening starts from its own first step (OrderModeSelector then reports it), not the last one's size.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setStep(startAtSetup && initialMode ? 'setup' : 'type');
  }

  const handleComplete = useCallback(() => {
    (onSetupComplete ?? onClose)();
    runDeferredOrderSetupAction();
    // Stay on the current page when order setup was triggered from an ordering flow page.
    if (
      pathname.startsWith('/cart') ||
      pathname.startsWith('/checkout') ||
      pathname.startsWith('/menu') ||
      pathname.startsWith('/order/') ||
      pathname.startsWith('/wishlist')
    ) {
      return;
    }
    router.push('/menu');
  }, [onSetupComplete, onClose, pathname, router]);

  const handleBackToHome = useCallback(() => {
    onClose();
    if (pathname !== '/') {
      router.push('/');
    }
  }, [onClose, pathname, router]);

  // No "Skip for now" link: when the popup offers a skip (an optional prompt), closing it is the skip, so the
  // prompt isn't shown again this visit.
  const dismiss = onSkip ?? onClose;

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        homeFontVariables,
        'order-popup-backdrop fixed inset-0 z-[10000] flex items-end justify-center bg-brand-950/55 backdrop-blur-[3px] md:items-center md:p-6',
        'transition-opacity duration-300 starting:opacity-0',
      )}
      onClick={() => {
        if (!required) dismiss();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-popup-heading"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          // overflow-clip, not hidden: a hidden-overflow box can still be scrolled by focus, which would push the
          // whole panel's content out of view. `home-redesign` brings the redesign's fonts and colours.
          'home-redesign order-popup relative flex max-h-[calc(100dvh-0.75rem)] w-full flex-col overflow-clip rounded-t-[1.75rem] bg-white text-slate-900 shadow-2xl shadow-brand-950/30',
          'md:max-h-[min(54rem,100%)] md:rounded-[2rem]',
          // Phones: the setup step fills the sheet, so it doesn't jump in height as its content changes.
          large ? 'max-md:h-[calc(100dvh-0.75rem)] md:max-w-6xl' : 'md:max-w-xl',
          'transition-[opacity,translate,scale] duration-300 ease-out starting:translate-y-4 starting:scale-[0.98] starting:opacity-0',
        )}
      >
        {!required && (
          <button
            type="button"
            onClick={dismiss}
            aria-label="Close"
            className="absolute top-5 right-5 z-20 grid size-11 place-items-center rounded-full bg-brand-50 text-brand-700 transition-colors hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:top-7 sm:right-7 short:top-3"
          >
            <X className="size-5" aria-hidden />
          </button>
        )}

        <OrderModeSelector
          modalOpen={isOpen}
          onComplete={handleComplete}
          onBackToHome={pathname !== '/' && !pathname.startsWith('/menu') ? handleBackToHome : undefined}
          onStepChange={setStep}
          initialMode={initialMode}
          startAtSetup={startAtSetup}
        />
      </div>
    </div>
  );
}
