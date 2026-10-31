import { cn } from '@/components/home-redesign/lib/cn';

export const orderSetupFocusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

export const orderSetupPrimaryButton = cn(
  'inline-flex items-center justify-center gap-2 rounded-full bg-brand-600 px-7 py-3.5 font-semibold text-snow shadow-lg shadow-brand-600/25 transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 disabled:shadow-none',
  orderSetupFocusRing,
);

export const orderSetupSecondaryButton = cn(
  'inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 font-semibold text-brand-700 ring-1 ring-brand-200 ring-inset transition-colors hover:bg-brand-50',
  orderSetupFocusRing,
);

export const orderSetupDialogPanel = cn(
  'relative flex max-h-[calc(100dvh-0.75rem)] w-full flex-col overflow-clip rounded-t-[1.75rem] bg-white text-slate-900 shadow-2xl shadow-brand-950/30',
  'md:max-h-[min(54rem,100%)] md:rounded-4xl',
  'transition-[opacity,translate,scale] duration-300 ease-out starting:translate-y-4 starting:scale-[0.98] starting:opacity-0',
);

export const orderSetupDialogBackdrop =
  'm-0 h-dvh max-h-none w-full max-w-none items-end justify-center overflow-hidden bg-transparent p-0 backdrop:bg-brand-950/55 backdrop:backdrop-blur-[3px] open:flex md:items-center md:p-6';
