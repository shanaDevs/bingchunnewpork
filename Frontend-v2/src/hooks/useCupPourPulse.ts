'use client';

import { useEffect, useState } from 'react';
import { CUP_POUR_EVENT, type CupPourDetail } from '@/lib/cartCelebration';

export interface CupPourPulse {
  fillBefore: number;
  fillAfter: number;
  productName?: string;
  key: number;
}

const POUR_MS = 1400;

export function useCupPourPulse(): CupPourPulse | null {
  const [pulse, setPulse] = useState<CupPourPulse | null>(null);

  useEffect(() => {
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    function onPour(e: Event) {
      const detail = (e as CustomEvent<CupPourDetail>).detail;
      if (hideTimer) clearTimeout(hideTimer);

      setPulse({
        fillBefore: detail.fillBefore,
        fillAfter: detail.fillAfter,
        productName: detail.productName,
        key: Date.now(),
      });

      hideTimer = setTimeout(() => setPulse(null), POUR_MS);
    }

    window.addEventListener(CUP_POUR_EVENT, onPour);
    return () => {
      window.removeEventListener(CUP_POUR_EVENT, onPour);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, []);

  return pulse;
}

export function isCupPouring(pulse: CupPourPulse | null): boolean {
  return pulse != null;
}
