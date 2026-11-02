'use client';

import { ArrowRight, Bike, Store } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/components/home-redesign/lib/cn';
import { orderSetupFocusRing } from '@/components/order-redesign/orderSetupUi';
import { orderSetupCopy } from '@/components/order-redesign/orderSetupCopy';
import type { OrderMode } from '@/store/cartStore';

const MODES: {
  mode: OrderMode;
  title: string;
  text: string;
  image: string;
  icon: typeof Store;
}[] = [
  {
    mode: 'TAKEAWAY',
    title: orderSetupCopy.pickupTitle,
    text: orderSetupCopy.pickupText,
    image: '/images/mascots/takeaway.png',
    icon: Store,
  },
  {
    mode: 'DELIVERY',
    title: orderSetupCopy.deliveryTitle,
    text: orderSetupCopy.deliveryText,
    image: '/images/mascots/delivery-rider.png',
    icon: Bike,
  },
];

/** Step 1: two large cards (reference branchPicker OrderTypeStep). */
export function OrderTypeStep({ onChoose }: { onChoose: (mode: OrderMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3 px-5 pb-6 sm:gap-4 sm:px-8 sm:pb-8 short:pb-4">
      {MODES.map((option) => (
        <button
          key={option.mode}
          type="button"
          onClick={() => onChoose(option.mode)}
          className={cn(
            'group flex flex-col items-center rounded-3xl bg-white px-3 pt-5 pb-4 text-center ring-1 ring-brand-100 ring-inset transition-[background-color,box-shadow,translate] duration-200 ease-out hover:-translate-y-0.5 hover:bg-brand-50 hover:shadow-lg hover:ring-2 hover:shadow-brand-600/10 hover:ring-brand-600 sm:px-5 sm:pt-6 sm:pb-5 short:pt-3 short:pb-3',
            orderSetupFocusRing,
          )}
        >
          <span className="grid size-24 place-items-center rounded-full bg-brand-50 transition-colors group-hover:bg-white sm:size-32 short:size-18">
            <Image
              src={option.image}
              alt=""
              width={500}
              height={500}
              sizes="128px"
              className="size-22 transition-transform duration-300 ease-out group-hover:scale-105 group-hover:-rotate-3 sm:size-30 short:size-16"
            />
          </span>
          <span className="mt-4 flex items-center gap-2 text-lg font-semibold text-brand-900 sm:text-xl short:mt-2">
            <option.icon className="size-5 text-brand-600" aria-hidden="true" />
            {option.title}
          </span>
          <span className="mt-1 text-[0.8125rem] leading-snug text-slate-600 sm:text-sm">{option.text}</span>
          <span
            aria-hidden="true"
            className="mt-4 grid size-9 place-items-center rounded-full bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-600 group-hover:text-snow short:mt-2"
          >
            <ArrowRight className="size-4" />
          </span>
        </button>
      ))}
    </div>
  );
}
