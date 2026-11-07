'use client';

import { create } from 'zustand';
import {
  clearSpinClaim,
  getSpinClaim,
  saveSpinClaim,
  type SpinClaim,
} from '@/lib/spinStorage';

type SpinState = {
  claim: SpinClaim | null;
  /** Increments when header / CTA requests the wheel — SpinWheelModal listens. */
  openRequestId: number;
  hydrate: () => void;
  setClaim: (claim: SpinClaim) => void;
  clearClaim: () => void;
  requestOpenSpin: () => void;
};

export const useSpinStore = create<SpinState>((set) => ({
  claim: null,
  openRequestId: 0,
  hydrate: () => set({ claim: getSpinClaim() }),
  setClaim: (claim) => {
    saveSpinClaim(claim);
    set({ claim });
  },
  clearClaim: () => {
    clearSpinClaim();
    set({ claim: null });
  },
  requestOpenSpin: () =>
    set((state) => ({ openRequestId: state.openRequestId + 1 })),
}));
