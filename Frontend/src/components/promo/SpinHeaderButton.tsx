'use client';

import SpinCasinoIcon from '@/components/promo/SpinCasinoIcon';
import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useSpinStore } from '@/store/spinStore';
import {
  fetchSpinEligibility,
  isSpinUiHidden,
  SPIN_ELIGIBILITY_QUERY_KEY,
  shouldShowSpinHeaderButton,
} from '@/lib/spinEligibility';

type SpinHeaderButtonProps = {
  className?: string;
  compact?: boolean;
};

export default function SpinHeaderButton({ className = '', compact = false }: SpinHeaderButtonProps) {
  const pathname = usePathname();
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const storeId = useCartStore((s) => s.getFulfillmentStoreId());
  const requestOpenSpin = useSpinStore((s) => s.requestOpenSpin);
  const hidden = isSpinUiHidden(pathname);

  const { data } = useQuery({
    queryKey: [...SPIN_ELIGIBILITY_QUERY_KEY, isAuthenticated ? 'auth' : 'guest', storeId ?? ''],
    queryFn: () => fetchSpinEligibility(isAuthenticated, storeId),
    enabled: authHydrated && isAuthenticated && !hidden,
    staleTime: 15_000,
    refetchOnMount: 'always',
  });

  // Guests must sign in before the spin wheel is offered in the header.
  if (!authHydrated || !isAuthenticated) return null;
  if (hidden || !data?.enabled || !shouldShowSpinHeaderButton(data)) return null;

  const iconSize = compact ? 22 : 24;

  return (
    <button
      type="button"
      data-loyalty-target="spin-wheel"
      onClick={() => requestOpenSpin()}
      className={`site-navbar__icon-btn site-navbar__spin-btn relative flex items-center justify-center rounded-xl text-brand hover:text-brand hover:bg-brand/10 transition-colors shrink-0 ${
        compact ? 'w-10 h-10' : 'w-10 h-10'
      } ${className}`.trim()}
      aria-label="Spin to win"
      title={
        data.loyaltySpin?.unlocked
          ? `Spin to win — ${data.loyaltySpin!.winChanceNumerator} in ${data.loyaltySpin!.winChanceDenominator} chance`
          : 'Spin to win'
      }
    >
      <SpinCasinoIcon size={iconSize} />
    </button>
  );
}
