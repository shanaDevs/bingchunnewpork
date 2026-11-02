'use client';

import dynamic from 'next/dynamic';
import {
  CheckCircle2,
  ChevronLeft,
  Crosshair,
  Loader2,
  Search,
  Store,
  X,
} from 'lucide-react';
import { DEFAULT_LOCATION } from '@/lib/geolocation';
import { isBranchManuallyClosed } from '@/lib/storeOrderingHours';
import type { Store as StoreType } from '@/types';

const PickupMap = dynamic(() => import('./DeliveryMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[220px] rounded-xl border border-navy-border bg-navy-light flex items-center justify-center text-muted text-sm">
      Loading map...
    </div>
  ),
});

type Props = {
  pickupCoords: { lat: number; lng: number } | null;
  pickupAreaLabel: string | null;
  branchSearch: string;
  branchSearchQuery: string;
  detectingLocation: boolean;
  storesLoading: boolean;
  pickupStoresList: StoreType[];
  pickupBranchMarkers: Array<{ id: string; name: string; lat: number; lng: number }>;
  selectedStore: StoreType | null;
  onBack: () => void;
  onBranchSearchChange: (value: string) => void;
  onDetectLocation: () => void;
  onPickupCoordsChange: (coords: { lat: number; lng: number }) => void;
  onStoreClick: (store: StoreType) => void;
  onMapBranchSelect: (id: string) => void;
};

export function OrderSetupLegacyPickupStage({
  pickupCoords,
  pickupAreaLabel,
  branchSearch,
  branchSearchQuery,
  detectingLocation,
  storesLoading,
  pickupStoresList,
  pickupBranchMarkers,
  selectedStore,
  onBack,
  onBranchSearchChange,
  onDetectLocation,
  onPickupCoordsChange,
  onStoreClick,
  onMapBranchSelect,
}: Props) {
  return (
    <div className="order-delivery-stage">
      <div className="order-delivery-stage__chrome">
        <button type="button" onClick={onBack} className="order-flow-back order-flow-back--overlay">
          <ChevronLeft size={16} />
          Change order type
        </button>
      </div>

      <div className="address-map-overlay">
        <div className="address-map-overlay__map">
          <PickupMap
            lat={pickupCoords?.lat ?? DEFAULT_LOCATION.lat}
            lng={pickupCoords?.lng ?? DEFAULT_LOCATION.lng}
            onLocationChange={(la, ln) => onPickupCoordsChange({ lat: la, lng: ln })}
            branchMarkers={pickupBranchMarkers}
            selectedBranchId={selectedStore?.id ?? null}
            onBranchSelect={onMapBranchSelect}
            showRoute={Boolean(selectedStore && pickupCoords)}
            routeAnimation="pickup"
            className="h-full min-h-0 delivery-map-wrap--bleed"
          />
        </div>

        <div className="address-map-overlay__top">
          <div className="address-map-overlay__panel">
            <div className="order-delivery-stage__heading">
              <h3 className="order-flow-step__title">Choose your pickup store</h3>
            </div>
            <div className="input-icon-wrap input-icon-wrap--both address-map-overlay__branch-search relative">
              <Search size={16} className="input-icon" aria-hidden />
              <input
                type="search"
                value={branchSearch}
                onChange={(e) => onBranchSearchChange(e.target.value)}
                placeholder="Search all branches, e.g. Nugegoda..."
                className="input-field w-full"
                autoComplete="off"
                aria-label="Search all pickup branches by name or city"
              />
              <div className="address-map-overlay__search-actions">
                {branchSearchQuery ? (
                  <button
                    type="button"
                    onClick={() => onBranchSearchChange('')}
                    title="Clear search"
                    aria-label="Clear branch search"
                    className="input-action text-muted hover:text-fg"
                  >
                    <X size={16} strokeWidth={2} />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onDetectLocation}
                  disabled={detectingLocation}
                  title="Use my current location"
                  aria-label="Use my current location to find the nearest outlet"
                  className="input-action text-brand hover:text-brand-dark disabled:opacity-50"
                >
                  {detectingLocation ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Crosshair size={18} strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>
          </div>

          {(detectingLocation || (storesLoading && pickupCoords)) && (
            <div className="flex items-center gap-2 text-sm text-brand p-3 rounded-xl bg-white/95 border border-navy-border shadow-md">
              <Loader2 size={16} className="animate-spin shrink-0" />
              Finding the nearest outlet...
            </div>
          )}
        </div>

        <div className="address-map-overlay__bottom">
          <div className="order-delivery-sheet">
            <p className="order-delivery-sheet__label">
              {branchSearchQuery
                ? `Matching branches · “${branchSearchQuery}”`
                : pickupCoords
                  ? `Nearby branches${pickupAreaLabel ? ` · ${pickupAreaLabel}` : ''}`
                  : 'All branches'}
            </p>
            {pickupStoresList.length === 0 && !storesLoading ? (
              <div className="order-delivery-sheet__empty">
                <p className="text-sm text-muted text-center py-2">
                  {branchSearchQuery
                    ? `No branches match “${branchSearchQuery}”. Try another name or city.`
                    : 'No branches available.'}
                </p>
              </div>
            ) : (
              <>
                <div className="order-branch-slider" role="list">
                  {pickupStoresList.map((store, index) => {
                    const selected = selectedStore?.id === store.id;
                    return (
                      <button
                        key={store.id}
                        type="button"
                        role="listitem"
                        onClick={() => onStoreClick(store)}
                        className={`order-branch-slide ${selected ? 'order-branch-slide--selected' : ''}`}
                      >
                        <span className="order-branch-slide__thumb" aria-hidden>
                          <Store size={20} className="text-brand" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-fg text-sm truncate block">{store.name}</span>
                            {pickupCoords && !branchSearchQuery && index === 0 && store.distanceKm != null && (
                              <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-brand/15 text-brand-dark shrink-0">
                                Nearest
                              </span>
                            )}
                          </span>
                          <span className="text-xs text-muted mt-0.5 block truncate">
                            {store.distanceKm != null ? `${store.distanceKm.toFixed(1)} km · ` : ''}
                            {store.city}
                            {isBranchManuallyClosed(store)
                              ? ' · Closed'
                              : store.isBusy
                                ? ' · Busy'
                                : ' · Open'}
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
