'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Loader2, MapPin, Maximize2, Route, Truck, X } from 'lucide-react';
import type { DeliveryRoutePayload } from '@/lib/deliveryRoute';
import { formatRouteAddress, formatStopAddress, formatDeliveryJobTitle } from '@/lib/deliveryRoute';
import { BRANCH_RETURN_RADIUS_M } from '@/lib/deliveryConstants';

const AdminDeliveryRouteMap = dynamic(() => import('./AdminDeliveryRouteMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[280px] items-center justify-center bg-navy-light text-sm text-muted">
      <Loader2 size={18} className="mr-2 animate-spin" />
      Loading map…
    </div>
  ),
});

export type PendingDeliveryJob = {
  batchId?: string;
  title: string;
  orderIds: string[];
  route: DeliveryRoutePayload;
};

type Props = {
  open: boolean;
  loading?: boolean;
  confirming?: boolean;
  pendingJob: PendingDeliveryJob | null;
  onClose: () => void;
  onConfirm: () => void;
};

function RouteSummary({
  summary,
  onViewFullRoute,
}: {
  summary: DeliveryRoutePayload['summary'];
  onViewFullRoute: () => void;
}) {
  return (
    <div className="rounded-2xl border border-navy-border/80 bg-navy-light/40 px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Fastest route</p>
        <button
          type="button"
          onClick={onViewFullRoute}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand transition-opacity hover:opacity-80"
          aria-label="View full route"
        >
          <Maximize2 size={12} />
          View full route
        </button>
      </div>
      <div className="mt-2.5 flex items-end gap-3">
        <span className="inline-flex items-center gap-1.5 text-2xl font-bold leading-none text-brand tabular-nums">
          <Clock size={18} strokeWidth={2.25} />
          ~{summary.estimatedMinutes}
          <span className="text-sm font-semibold">min</span>
        </span>
        <span className="pb-0.5 text-xs text-muted">
          {summary.totalDistanceKm.toFixed(1)} km · {summary.stopCount} stop
          {summary.stopCount === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

function RouteStopItem({
  label,
  title,
  orderNumber,
  address,
  legMeta,
  selected,
  isLast,
  onClick,
}: {
  label: string;
  title: string;
  orderNumber?: string;
  address?: string;
  legMeta?: string;
  selected?: boolean;
  isLast?: boolean;
  onClick?: () => void;
}) {
  const isOrigin = label === 'A' || label === 'B';

  return (
    <div className="relative flex gap-3">
      <div className="flex flex-col items-center">
        <span
          className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
            selected
              ? 'bg-brand text-white shadow-[0_0_0_3px_rgba(37,99,235,0.2)]'
              : isOrigin
                ? 'bg-brand text-white'
                : 'border border-brand/35 bg-navy-card text-brand'
          }`}
        >
          {label}
        </span>
        {!isLast && <span className="mt-1 w-px flex-1 min-h-[12px] bg-navy-border/80" aria-hidden />}
      </div>

      <button
        type="button"
        onClick={onClick}
        className={`mb-3 min-w-0 flex-1 rounded-xl px-3 py-2.5 text-left transition-colors ${
          selected
            ? 'bg-brand-subtle/25 ring-1 ring-brand/30'
            : 'hover:bg-navy-light/60'
        }`}
      >
        <p className="truncate text-sm font-semibold text-fg">{title}</p>
        {orderNumber && (
          <p className="mt-0.5 font-mono text-[11px] font-medium text-brand/90">{orderNumber}</p>
        )}
        {address && (
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{address}</p>
        )}
        {legMeta && (
          <p className="mt-1.5 text-[11px] text-muted">{legMeta}</p>
        )}
      </button>
    </div>
  );
}

function stopKey(orderId?: string, orderNumber?: string) {
  return orderId ?? orderNumber ?? '';
}

export default function AdminDeliveryRouteModal({
  open,
  loading = false,
  confirming = false,
  pendingJob,
  onClose,
  onConfirm,
}: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const [selectedStopKey, setSelectedStopKey] = useState<string | null>(null);
  const [fitNonce, setFitNonce] = useState(0);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setSelectedStopKey(null);
      setFitNonce(0);
    }
  }, [open]);

  useEffect(() => {
    setSelectedStopKey(null);
    setFitNonce(0);
  }, [pendingJob?.title, pendingJob?.orderIds.join(',')]);

  function toggleStop(key: string) {
    setSelectedStopKey((current) => (current === key ? null : key));
  }

  function viewFullRoute() {
    setSelectedStopKey(null);
    setFitNonce((n) => n + 1);
  }

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !confirming) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, confirming, onClose]);

  if (!portalReady) return null;

  const route = pendingJob?.route;
  const summary = route?.summary;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1250] bg-black/55 backdrop-blur-sm"
            onClick={confirming ? undefined : onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-label="Delivery route preview"
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            className="fixed left-1/2 top-1/2 z-[1251] flex h-[min(92vh,760px)] w-[min(96vw,72rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-navy-border bg-navy-card shadow-2xl md:flex-row"
          >
            <aside className="flex w-full shrink-0 flex-col border-b border-navy-border md:w-[26rem] md:border-b-0 md:border-r">
              <div className="flex items-start justify-between gap-3 border-b border-navy-border px-5 py-4">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-base font-bold text-fg">
                    <Route size={17} className="text-brand" />
                    Delivery route
                  </p>
                  {pendingJob?.title && (
                    <p className="mt-1 truncate text-xs text-muted">{formatDeliveryJobTitle(pendingJob.title)}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={confirming}
                  className="rounded-lg p-2 text-muted transition-colors hover:bg-navy-light hover:text-fg disabled:opacity-50"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
                    <Loader2 size={16} className="animate-spin" />
                    Building route…
                  </div>
                ) : route ? (
                  <div className="space-y-5">
                    {summary && (
                      <RouteSummary summary={summary} onViewFullRoute={viewFullRoute} />
                    )}

                    <div>
                      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">
                        Stops
                      </p>
                      <RouteStopItem
                        label="A"
                        title={route.store.name}
                        address={formatRouteAddress([route.store.addressLine, route.store.city])}
                        selected={selectedStopKey === 'store'}
                        onClick={() => toggleStop('store')}
                      />
                      {route.stops.map((stop) => {
                        const key = stopKey(stop.orderId, stop.orderNumber);
                        const legMeta =
                          stop.distanceFromPreviousKm != null && stop.etaMinutesFromPrevious != null
                            ? `${stop.distanceFromPreviousKm.toFixed(1)} km · ~${stop.etaMinutesFromPrevious} min from previous`
                            : stop.itemCount != null
                              ? `${stop.itemCount} cup${stop.itemCount === 1 ? '' : 's'}`
                              : undefined;

                        return (
                          <RouteStopItem
                            key={key}
                            label={String(stop.sequence)}
                            title={stop.customerName}
                            orderNumber={stop.orderNumber}
                            address={formatStopAddress(stop)}
                            legMeta={legMeta}
                            selected={selectedStopKey === key}
                            onClick={() => toggleStop(key)}
                          />
                        );
                      })}
                      <RouteStopItem
                        label="B"
                        title={route.store.name}
                        address={[
                          'Return to Branch',
                          formatRouteAddress([route.store.addressLine, route.store.city]),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        selected={selectedStopKey === 'store-return'}
                        isLast
                        onClick={() => toggleStop('store-return')}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 py-10 text-sm text-muted">
                    <MapPin size={16} />
                    Route preview unavailable.
                  </div>
                )}
              </div>

              <div className="border-t border-navy-border px-5 py-4">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={confirming}
                    className="btn-outline flex-1 py-2.5 text-sm disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onConfirm}
                    disabled={!route || loading || confirming}
                    className="btn-primary flex flex-[1.4] items-center justify-center gap-2 py-2.5 text-sm disabled:opacity-50"
                  >
                    {confirming ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Truck size={15} />
                    )}
                    Create job
                  </button>
                </div>
              </div>
            </aside>

            <div className="relative min-h-[280px] flex-1 bg-navy-light">
              {route && !loading ? (
                <AdminDeliveryRouteMap
                  route={route}
                  branchStore={route.branch}
                  highlightedStopKey={selectedStopKey}
                  fitNonce={fitNonce}
                  onStopSelect={toggleStop}
                  showReturnToStore
                  completionRadiusM={BRANCH_RETURN_RADIUS_M}
                />
              ) : (
                <div className="flex h-full min-h-[280px] items-center justify-center text-sm text-muted">
                  {loading ? (
                    <>
                      <Loader2 size={18} className="mr-2 animate-spin" />
                      Calculating road route…
                    </>
                  ) : (
                    'Map will appear here'
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
