'use client';

import SpinCasinoIcon from '@/components/promo/SpinCasinoIcon';
import { useSpinHeaderButton } from '@/hooks/useSpinHeaderButton';
import { useSpinStore } from '@/store/spinStore';

type SpinHeaderButtonProps = {
  className?: string;
  compact?: boolean;
};

export default function SpinHeaderButton({ className = '', compact = false }: SpinHeaderButtonProps) {
  const requestOpenSpin = useSpinStore((s) => s.requestOpenSpin);
  const { visible, eligibility: data } = useSpinHeaderButton();

  if (!visible || !data) return null;

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
