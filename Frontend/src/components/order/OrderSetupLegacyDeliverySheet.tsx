'use client';

import { CheckCircle2, Loader2, MapPin, Store } from 'lucide-react';
import { isDeliveryBranchOrderable } from '@/components/order-redesign/orderSetupBranches';
import type { DeliveryBranchOption, DeliveryValidation } from '@/types';

type Props = {
  validating: boolean;
  validation: DeliveryValidation | null;
  suggestedDeliveryBranches: DeliveryBranchOption[];
  selectedDeliveryStoreId: string | null;
  onBranchClick: (branch: DeliveryBranchOption) => void;
  onSwitchToPickup: () => void;
};

export function OrderSetupLegacyDeliverySheet({
  validating,
  validation,
  suggestedDeliveryBranches,
  selectedDeliveryStoreId,
  onBranchClick,
  onSwitchToPickup,
}: Props) {
  if (!validating && !validation) return null;

  return (
    <>
      {validating && !suggestedDeliveryBranches.length ? (
        <div className="order-branch-slide order-branch-slide--loading">
          <Loader2 size={16} className="animate-spin shrink-0 text-brand" />
          <span className="text-sm text-brand">Finding nearest branches...</span>
        </div>
      ) : suggestedDeliveryBranches.length > 0 ? (
        <>
          <p className="order-delivery-sheet__label">Suggested branches</p>
          <div className="order-branch-slider" role="list">
            {suggestedDeliveryBranches.map((branch, index) => {
              const closed = Boolean(branch.branchClosed);
              const orderable = isDeliveryBranchOrderable(branch);
              const selected = orderable && selectedDeliveryStoreId === branch.id;
              return (
                <button
                  key={branch.id}
                  type="button"
                  role="listitem"
                  disabled={closed}
                  aria-disabled={closed}
                  onClick={() => onBranchClick(branch)}
                  className={`order-branch-slide ${selected ? 'order-branch-slide--selected' : ''}${
                    closed ? ' order-branch-slide--disabled' : ''
                  }`}
                >
                  <span className="order-branch-slide__thumb" aria-hidden>
                    <Store size={20} className={closed ? 'text-muted' : 'text-brand'} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-fg text-sm truncate block">{branch.name}</span>
                      {index === 0 && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-brand/15 text-brand-dark shrink-0">
                          Nearest
                        </span>
                      )}
                      {closed && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-500/12 text-red-500 shrink-0">
                          Closed
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted mt-0.5 block">
                      {branch.distanceKm} km · Fee LKR {branch.fee}
                      {closed ? ' · Not accepting orders' : ''}
                    </span>
                  </span>
                  {selected ? (
                    <CheckCircle2 size={20} className="text-green-500 shrink-0" />
                  ) : (
                    <span className="order-branch-slide__ring" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
          <p className="order-delivery-sheet__hint">Tap a branch to confirm</p>
        </>
      ) : (
        <div className="order-delivery-sheet__empty">
          <div className="flex items-start gap-2 text-sm text-red-400">
            <MapPin size={16} className="shrink-0 mt-0.5" />
            <span>
              {validation?.message || 'Delivery not available here. Try takeaway or move the pin.'}
            </span>
          </div>
          {validation?.reason === 'out-of-range' && (
            <button
              type="button"
              onClick={onSwitchToPickup}
              className="text-sm text-brand hover:text-brand-light font-medium mt-2"
            >
              Switch to Pickup instead
            </button>
          )}
        </div>
      )}
    </>
  );
}
