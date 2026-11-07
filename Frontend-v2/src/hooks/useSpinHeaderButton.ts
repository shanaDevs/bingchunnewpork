'use client';

import { useSpinEligibility } from '@/hooks/useSpinEligibility';
import { shouldShowSpinHeaderButton } from '@/lib/spinEligibility';

/** Whether a header shows its Spin & Win button: anyone who may spin now, if the admin has it on. */
export function useSpinHeaderButton() {
  const { eligibility } = useSpinEligibility();
  const visible = Boolean(eligibility?.enabled) && shouldShowSpinHeaderButton(eligibility);
  return { visible, eligibility };
}
