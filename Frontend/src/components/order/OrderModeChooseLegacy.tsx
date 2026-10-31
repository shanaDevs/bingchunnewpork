'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { Home, ShoppingBag, Truck } from 'lucide-react';
import { MASCOT_IMAGES } from '@/lib/mascotImages';
import type { OrderMode } from '@/store/cartStore';

type Props = {
  choiceHighlight: OrderMode | null;
  onHighlight: (mode: OrderMode) => void;
  onChoose: (mode: OrderMode) => void;
  onBackToHome?: () => void;
};

export function OrderModeChooseLegacy({
  choiceHighlight,
  onHighlight,
  onChoose,
  onBackToHome,
}: Props) {
  return (
    <motion.div
      key="choose"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.28 }}
      className="order-flow-step"
    >
      <div className="order-flow-step__header flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-center sm:text-left">
        <div>
          <span className="order-flow-step__badge">Step 1 of 2</span>
          <h3 className="order-flow-step__title">How would you like to order?</h3>
        </div>
        {onBackToHome && (
          <button
            type="button"
            onClick={onBackToHome}
            className="flex items-center justify-center gap-1.5 text-xs sm:text-sm font-medium text-muted hover:text-brand transition-colors py-2 px-3.5 rounded-xl border border-navy-border hover:border-brand/40 bg-navy-light/60 self-center sm:self-start shrink-0 shadow-sm"
          >
            <Home size={15} />
            Back to Home
          </button>
        )}
      </div>

      <div className="order-mode-choices order-mode-choices--pizza">
        {(['DELIVERY', 'TAKEAWAY'] as const).map((mode) => {
          const selected = choiceHighlight === mode;
          const mascot = mode === 'DELIVERY' ? MASCOT_IMAGES.delivery : MASCOT_IMAGES.takeaway;
          const title = mode === 'DELIVERY' ? 'Delivery' : 'Takeaway';
          const ActionIcon = mode === 'DELIVERY' ? Truck : ShoppingBag;
          const actionLabel = mode === 'DELIVERY' ? 'Select Delivery' : 'Select Pickup';

          return (
            <div
              key={mode}
              role="button"
              tabIndex={0}
              className={`order-mode-choice order-mode-choice--pizza${selected ? ' order-mode-choice--selected' : ''}`}
              aria-pressed={selected}
              onClick={() => {
                if (selected) {
                  void onChoose(mode);
                  return;
                }
                onHighlight(mode);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (selected) {
                    void onChoose(mode);
                    return;
                  }
                  onHighlight(mode);
                }
              }}
            >
              <span className="order-mode-choice__mascot" aria-hidden>
                <Image
                  src={mascot}
                  alt=""
                  width={88}
                  height={88}
                  className="object-contain"
                  unoptimized={mode === 'DELIVERY'}
                />
              </span>
              <span className="order-mode-choice__title">{title}</span>
              <button
                type="button"
                className="order-mode-choice__action"
                onClick={(e) => {
                  e.stopPropagation();
                  onHighlight(mode);
                  void onChoose(mode);
                }}
              >
                <ActionIcon size={14} aria-hidden />
                {actionLabel}
              </button>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
