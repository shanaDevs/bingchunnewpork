'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { OrderSetupDialog } from '@/components/order-redesign/OrderSetupDialog';
import { OrderSetupModalFooter } from '@/components/order-redesign/OrderSetupModalFooter';
import type { OrderSetupFooterState } from '@/components/order-redesign/orderSetupFooter';
import { OrderModeSelector } from './OrderModeSelector';
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
  const [step, setStep] = useState<'choose' | 'setup'>(() => (startAtSetup ? 'setup' : 'choose'));
  const [mode, setMode] = useState<OrderMode>(() => initialMode ?? 'DELIVERY');
  const [setupFooter, setSetupFooter] = useState<OrderSetupFooterState | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setStep(startAtSetup ? 'setup' : 'choose');
    if (initialMode) setMode(initialMode);
  }, [isOpen, startAtSetup, initialMode]);

  const handleComplete = useCallback(() => {
    (onSetupComplete ?? onClose)();
    runDeferredOrderSetupAction();
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

  const handleBackToType = useCallback(() => {
    setStep('choose');
    setSetupFooter(null);
  }, []);

  const footer =
    step === 'setup' && setupFooter ? (
      <OrderSetupModalFooter footer={setupFooter} />
    ) : step === 'choose' && onSkip ? (
      <div className="px-5 pb-6 sm:px-8 sm:pb-8">
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-center text-sm text-slate-500 transition-colors hover:text-brand-600 py-2"
        >
          Skip for now — you can set this later
        </button>
      </div>
    ) : null;

  return (
    <OrderSetupDialog
      open={isOpen}
      onClose={onClose}
      required={required}
      step={step}
      mode={mode}
      onBackToType={handleBackToType}
      footer={footer}
    >
      <OrderModeSelector
        appearance="redesign"
        flowStep={step}
        modalOpen={isOpen}
        onComplete={handleComplete}
        onStepChange={setStep}
        onModeChange={setMode}
        onSetupFooterChange={setSetupFooter}
        onBackToType={handleBackToType}
        initialMode={initialMode}
        startAtSetup={startAtSetup}
      />
    </OrderSetupDialog>
  );
}
