import { create } from 'zustand';

export interface CancellationReasonResult {
  reason: string;
  customText?: string;
}

interface CancellationReasonState {
  isOpen: boolean;
  resolve: ((value: CancellationReasonResult | null) => void) | null;
  ask: () => Promise<CancellationReasonResult | null>;
  close: (result: CancellationReasonResult | null) => void;
}

export const useCancellationReasonStore = create<CancellationReasonState>((set, get) => ({
  isOpen: false,
  resolve: null,

  ask: () =>
    new Promise<CancellationReasonResult | null>((resolve) => {
      set({ isOpen: true, resolve });
    }),

  close: (result) => {
    const { resolve } = get();
    resolve?.(result);
    set({ isOpen: false, resolve: null });
  },
}));

export function askCancellationReason(): Promise<CancellationReasonResult | null> {
  return useCancellationReasonStore.getState().ask();
}
