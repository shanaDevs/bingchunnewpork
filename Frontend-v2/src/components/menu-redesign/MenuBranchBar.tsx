'use client';

import { Bike, MapPin, RefreshCw, Store } from 'lucide-react';
import { openOrderModal } from '@/components/order/SiteOrderPrompt';
import { cn } from '@/components/home-redesign/lib/cn';
import { menuCopy } from '@/components/menu-redesign/menuCopy';
import {
  selectActiveStoreName,
  useCartStore,
  type OrderMode,
} from '@/store/cartStore';
import { hasCompletedOrderSetup } from '@/lib/orderSetup';

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

type MenuBranchBarProps = {
  className?: string;
  onChangeBranch?: () => void;
};

function branchKicker(orderMode: OrderMode | null, deliveryAddress?: string): string {
  if (!orderMode) return menuCopy.branchBar.yourBranch;
  if (orderMode === 'TAKEAWAY') return menuCopy.branchBar.pickupFrom;
  const area = deliveryAddress?.split(',')[0]?.trim();
  return area ? menuCopy.branchBar.deliveryToFrom(area) : menuCopy.branchBar.deliveryFrom;
}

export function MenuBranchBar({ className, onChangeBranch }: MenuBranchBarProps) {
  const orderMode = useCartStore((s) => s.orderMode);
  const deliveryInfo = useCartStore((s) => s.deliveryInfo);
  const storeName = useCartStore(selectActiveStoreName);
  const setupComplete = useCartStore((s) => hasCompletedOrderSetup(s));

  const Icon = !setupComplete ? MapPin : orderMode === 'TAKEAWAY' ? Store : Bike;
  const kicker = branchKicker(orderMode, deliveryInfo?.address);

  const change = () => {
    onChangeBranch?.();
    openOrderModal({ startAtSetup: true });
  };

  const displayBranch = storeName
    ? menuCopy.branchBar.branchName(storeName)
    : menuCopy.branchBar.notChosen;

  return (
    <div
      className={cn(
        'inline-flex max-w-full items-center gap-2 rounded-full bg-white/10 p-1.5 text-snow ring-1 ring-white/25 ring-inset sm:gap-3 sm:py-2 sm:pr-2.5 sm:pl-2',
        className,
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-brand-600 sm:size-10">
        <Icon className="size-4 sm:size-5" aria-hidden="true" />
      </span>
      <p className="flex min-w-0 flex-1 flex-col leading-tight text-snow">
        <span className="truncate text-[0.5625rem] font-semibold tracking-[0.18em] text-snow/70 uppercase sm:text-[0.625rem]">
          {kicker}
        </span>
        <span className="truncate text-sm font-semibold sm:text-base">{displayBranch}</span>
      </p>
      <button
        type="button"
        onClick={change}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-md shadow-brand-950/20 transition-colors hover:bg-brand-50 sm:ml-1 sm:gap-1.5 sm:px-4 sm:py-2 sm:text-sm',
          focusRing,
        )}
      >
        <RefreshCw className="size-3.5 sm:size-4" aria-hidden="true" />
        {setupComplete ? menuCopy.branchBar.changeBranch : menuCopy.branchBar.chooseBranch}
      </button>
    </div>
  );
}
