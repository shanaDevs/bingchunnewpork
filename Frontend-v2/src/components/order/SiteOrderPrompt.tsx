'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import OrderModeModal from './OrderModeModal';
import { clearDeferredOrderSetup } from '@/lib/postOrderSetupAction';
import type { OrderMode } from '@/store/cartStore';

export const OPEN_ORDER_MODAL_EVENT = 'bc-open-order-modal';
export const ORDER_PROMPT_SKIP_KEY = 'bc-order-prompt-skipped';

export type OpenOrderModalOptions = {
  required?: boolean;
  allowSkip?: boolean;
  /** Open directly on delivery/pickup setup (step 2) with this mode selected. */
  initialMode?: OrderMode;
  startAtSetup?: boolean;
};

function isSkippedRoute(pathname: string) {
  return (
    pathname.startsWith('/admin') ||
    pathname === '/account/login' ||
    pathname === '/account/register' ||
    pathname.startsWith('/mock-payment')
  );
}

export default function SiteOrderPrompt() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [required, setRequired] = useState(false);
  const [allowSkip, setAllowSkip] = useState(false);
  const [initialMode, setInitialMode] = useState<OrderMode | undefined>();
  const [startAtSetup, setStartAtSetup] = useState(false);

  const resetOpenOptions = useCallback(() => {
    setRequired(false);
    setAllowSkip(false);
    setInitialMode(undefined);
    setStartAtSetup(false);
  }, []);

  const closeModal = useCallback(() => {
    setOpen(false);
    clearDeferredOrderSetup();
    resetOpenOptions();
  }, [resetOpenOptions]);

  const completeModal = useCallback(() => {
    setOpen(false);
    resetOpenOptions();
  }, [resetOpenOptions]);

  const handleSkip = useCallback(() => {
    sessionStorage.setItem(ORDER_PROMPT_SKIP_KEY, '1');
    setOpen(false);
    clearDeferredOrderSetup();
    resetOpenOptions();
  }, [resetOpenOptions]);

  useEffect(() => {
    const openHandler = (e: Event) => {
      const detail = (e as CustomEvent<OpenOrderModalOptions>).detail;
      const onMenu = window.location.pathname === '/menu';
      const isRequired = Boolean(detail?.required) || onMenu;
      setRequired(isRequired);
      setAllowSkip(isRequired ? false : (detail?.allowSkip ?? !detail?.required));
      setInitialMode(detail?.initialMode);
      setStartAtSetup(Boolean(detail?.startAtSetup && detail?.initialMode));
      setOpen(true);
    };
    window.addEventListener(OPEN_ORDER_MODAL_EVENT, openHandler);
    return () => window.removeEventListener(OPEN_ORDER_MODAL_EVENT, openHandler);
  }, []);

  if (isSkippedRoute(pathname)) return null;

  return (
    <OrderModeModal
      isOpen={open}
      onClose={closeModal}
      onSetupComplete={completeModal}
      onSkip={allowSkip ? handleSkip : undefined}
      required={required}
      initialMode={initialMode}
      startAtSetup={startAtSetup}
    />
  );
}

export function openOrderModal(options?: OpenOrderModalOptions) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_ORDER_MODAL_EVENT, { detail: options }));
  }
}
