'use client';

import { formatOrderPaymentMethodLabel } from '@/lib/paymentMethodLabels';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { Copy, Check, ExternalLink, MapPin, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBase';
import { resolveCustomerDisplayName } from '@/lib/customerName';
import { adminBadgeClass } from '@/lib/adminBadges';
import { formatMoney } from '@/lib/receipt';
import { confirmDialog } from '@/store/confirmStore';
import {
  type AdminDriverComplaintDetail,
  complaintResolutionSummary,
  complaintStatusLabel,
  complaintStatusVariant,
} from '@/lib/complaints';

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

async function adminFetch(endpoint: string, options?: RequestInit) {
    const res = await fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 border-b border-navy-border/60 last:border-0">
      <dt className="text-xs text-muted shrink-0">{label}</dt>
      <dd className="text-sm text-fg text-right font-medium break-words min-w-0">{value}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">{children}</h3>;
}

function formatEnumLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSize(size: string): string {
  return size.charAt(0) + size.slice(1).toLowerCase().replace(/_/g, ' ');
}

function mapExternalUrl(lat?: number | null, lng?: number | null, address?: string): string | null {
  if (lat != null && lng != null) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  if (address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }
  return null;
}

type Props = {
  complaintId: string | null;
  onClose: () => void;
  onReview: (status: 'CONFIRMED' | 'DISMISSED' | 'RESOLVED') => void;
  isReviewing: boolean;
};

export default function AdminComplaintDetailModal({
  complaintId,
  onClose,
  onReview,
  isReviewing,
}: Props) {
  const portalReady = useIsClient();
  const [copied, setCopied] = useState(false);

  const detailQuery = useQuery({
    queryKey: ['admin-driver-complaint', complaintId],
    queryFn: async () =>
      (await adminFetch(`/admin/driver-complaints/${complaintId}`)).data as AdminDriverComplaintDetail,
    enabled: !!complaintId,
  });

  useEffect(() => {
    if (!complaintId) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [complaintId, onClose]);

  const handleCopyId = async () => {
    if (!detailQuery.data?.id) return;
    try {
      await navigator.clipboard.writeText(detailQuery.data.id);
      setCopied(true);
      toast.success('Complaint ID copied');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Could not copy ID');
    }
  };

  const handleConfirm = async () => {
    const ok = await confirmDialog({
      title: 'Confirm complaint?',
      message:
        'Confirming this complaint deducts 5 merit points from the driver. This cannot be undone from this screen.',
      confirmLabel: 'Confirm complaint',
      cancelLabel: 'Cancel',
      variant: 'danger',
    });
    if (ok) onReview('CONFIRMED');
  };

  const handleDismiss = async () => {
    const ok = await confirmDialog({
      title: 'Dismiss complaint?',
      message: 'Dismiss this complaint without deducting merit points from the driver?',
      confirmLabel: 'Dismiss',
      cancelLabel: 'Cancel',
    });
    if (ok) onReview('DISMISSED');
  };

  const handleResolve = async () => {
    const ok = await confirmDialog({
      title: 'Mark complaint resolved?',
      message:
        'Mark this complaint as resolved after the issue has been addressed? The driver will see Resolved. No additional merit points will change.',
      confirmLabel: 'Resolve complaint',
      cancelLabel: 'Cancel',
    });
    if (ok) onReview('RESOLVED');
  };

  if (!portalReady) return null;

  const row = detailQuery.data;
  const order = row?.order;
  const addressParts = order
    ? [order.deliveryAddressLine, order.deliveryCity, order.deliveryDistrict].filter(Boolean)
    : [];
  const address = addressParts.join(', ');
  const customerName = order
    ? resolveCustomerDisplayName({
        guestName: order.guestName,
        userName: order.user?.name,
        phone: order.user?.phone ?? order.guestPhone,
      })
    : '—';
  const customerPhone = order?.user?.phone ?? order?.guestPhone ?? null;
  const mapsUrl = order ? mapExternalUrl(order.deliveryLat, order.deliveryLng, address) : null;
  const resolution = row ? complaintResolutionSummary(row) : null;

  return createPortal(
    <AnimatePresence>
      {complaintId && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1200] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal
            aria-label="Complaint details"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: 'spring', damping: 28, stiffness: 360 }}
            className="fixed left-1/2 top-1/2 z-[1201] flex w-[min(94vw,44rem)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-navy-border bg-navy-card shadow-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-navy-border px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Complaint details
                </p>
                {row ? (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-bold text-fg truncate" title={row.id}>
                      {row.id}
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyId}
                      className="rounded-lg p-1.5 text-muted transition-colors hover:bg-navy-light hover:text-fg"
                      aria-label="Copy complaint ID"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <span className={adminBadgeClass(complaintStatusVariant(row.status))}>
                      {complaintStatusLabel(row.status)}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-muted">Loading…</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-navy-light hover:text-fg"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {detailQuery.isLoading && (
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-navy-light/40" />
                  ))}
                </div>
              )}

              {detailQuery.isError && (
                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                  {(detailQuery.error as Error)?.message || 'Failed to load complaint details.'}
                </p>
              )}

              {row && (
                <>
                  <section>
                    <SectionTitle>Complaint</SectionTitle>
                    <dl>
                      <DetailRow label="Category" value={row.category} />
                      <DetailRow
                        label="Description"
                        value={
                          <span className="whitespace-pre-wrap text-left block">{row.description}</span>
                        }
                      />
                      <DetailRow
                        label="Reported"
                        value={new Date(row.createdAt).toLocaleString()}
                      />
                      {row.otherComplaintsCount > 0 && (
                        <DetailRow
                          label="Other complaints on order"
                          value={`${row.otherComplaintsCount} more`}
                        />
                      )}
                    </dl>
                  </section>

                  <section>
                    <SectionTitle>Driver</SectionTitle>
                    <dl>
                      <DetailRow label="Name" value={row.driver?.name ?? row.driverId} />
                      <DetailRow
                        label="Phone"
                        value={
                          row.driver?.phone ? (
                            <a href={`tel:${row.driver.phone}`} className="text-brand hover:underline">
                              {row.driver.phone}
                            </a>
                          ) : (
                            '—'
                          )
                        }
                      />
                      <DetailRow
                        label="Merit points"
                        value={row.driver?.meritPoints != null ? row.driver.meritPoints : '—'}
                      />
                      <DetailRow
                        label="Vehicle"
                        value={
                          [row.driver?.vehicleType, row.driver?.vehicleNumber]
                            .filter(Boolean)
                            .join(' · ') || '—'
                        }
                      />
                    </dl>
                  </section>

                  <section>
                    <SectionTitle>Order</SectionTitle>
                    <dl>
                      <DetailRow label="Order #" value={order?.orderNumber ?? row.orderId} />
                      <DetailRow label="Status" value={formatEnumLabel(order?.status)} />
                      <DetailRow
                        label="Mode / channel"
                        value={`${formatEnumLabel(order?.orderMode)} · ${formatEnumLabel(order?.channel)}`}
                      />
                      <DetailRow
                        label="Placed"
                        value={order?.createdAt ? new Date(order.createdAt).toLocaleString() : '—'}
                      />
                      <DetailRow label="Customer" value={customerName} />
                      <DetailRow
                        label="Customer phone"
                        value={
                          customerPhone ? (
                            <a href={`tel:${customerPhone}`} className="text-brand hover:underline">
                              {customerPhone}
                            </a>
                          ) : (
                            '—'
                          )
                        }
                      />
                      <DetailRow
                        label="Delivery address"
                        value={
                          <span className="flex flex-col items-end gap-1.5">
                            <span className="text-right">{address || '—'}</span>
                            {mapsUrl && (
                              <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                              >
                                <MapPin size={12} /> Open in Maps <ExternalLink size={11} />
                              </a>
                            )}
                          </span>
                        }
                      />
                      {order?.notes && <DetailRow label="Notes" value={order.notes} />}
                    </dl>
                  </section>

                  <section>
                    <SectionTitle>Items</SectionTitle>
                    {(order?.items?.length ?? 0) === 0 ? (
                      <p className="text-sm text-muted py-2">No items on this order.</p>
                    ) : (
                      <div className="overflow-x-auto rounded-xl border border-navy-border">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="text-left text-muted bg-navy-light/30">
                              <th className="px-3 py-2 font-medium">Item</th>
                              <th className="px-3 py-2 font-medium whitespace-nowrap">Qty</th>
                              <th className="px-3 py-2 font-medium whitespace-nowrap">Unit</th>
                              <th className="px-3 py-2 font-medium whitespace-nowrap text-right">
                                Total
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {order!.items!.map((item, idx) => (
                              <tr key={`${item.productName}-${idx}`} className="border-t border-navy-border">
                                <td className="px-3 py-2">
                                  <p className="text-fg font-medium">
                                    {item.productName}
                                    {item.size ? (
                                      <span className="text-muted font-normal">
                                        {' '}
                                        · {formatSize(item.size)}
                                      </span>
                                    ) : null}
                                  </p>
                                  {item.toppings?.length > 0 && (
                                    <ul className="mt-0.5 text-xs text-muted space-y-0.5">
                                      {item.toppings.map((t) => (
                                        <li key={t.toppingName}>
                                          + {t.toppingName}
                                          {t.extraPrice > 0
                                            ? ` (${formatMoney(t.extraPrice)})`
                                            : ''}
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">{item.quantity}</td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  {formatMoney(item.unitPrice)}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-right">
                                  {formatMoney(item.totalPrice)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <dl className="mt-2">
                      <DetailRow
                        label="Subtotal"
                        value={order?.subtotal != null ? formatMoney(order.subtotal) : '—'}
                      />
                      <DetailRow
                        label="Delivery fee"
                        value={order?.deliveryFee != null ? formatMoney(order.deliveryFee) : '—'}
                      />
                      {(order?.convenientFee ?? 0) > 0 && (
                        <DetailRow
                          label="Convenient fee"
                          value={formatMoney(order!.convenientFee!)}
                        />
                      )}
                      {(order?.discount ?? 0) > 0 && (
                        <DetailRow label="Discount" value={`− ${formatMoney(order!.discount!)}`} />
                      )}
                      {(order?.loyaltyDiscount ?? 0) > 0 && (
                        <DetailRow
                          label="Loyalty discount"
                          value={`− ${formatMoney(order!.loyaltyDiscount!)}`}
                        />
                      )}
                      <DetailRow
                        label="Total"
                        value={
                          <span className="text-base font-semibold">
                            {order?.total != null ? formatMoney(order.total) : '—'}
                          </span>
                        }
                      />
                    </dl>
                  </section>

                  <section>
                    <SectionTitle>Payment</SectionTitle>
                    <dl>
                      <DetailRow
                        label="Method"
                        value={formatOrderPaymentMethodLabel(order?.paymentMethod)}
                      />
                      <DetailRow
                        label="Status"
                        value={formatEnumLabel(order?.paymentStatus)}
                      />
                    </dl>
                  </section>

                  {resolution && (
                    <section>
                      <SectionTitle>Action taken</SectionTitle>
                      <dl>
                        <DetailRow label="Resolution" value={resolution} />
                      </dl>
                    </section>
                  )}
                </>
              )}
            </div>

            {row?.status === 'OPEN' && (
              <div className="shrink-0 border-t border-navy-border px-5 py-4 space-y-3">
                <p className="text-xs text-muted">
                  Confirming deducts 5 merit points from the driver.
                </p>
                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    type="button"
                    className="btn-outline px-4 py-2 text-sm"
                    disabled={isReviewing}
                    onClick={handleDismiss}
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    className="btn-primary px-4 py-2 text-sm"
                    disabled={isReviewing}
                    onClick={handleConfirm}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}

            {row?.status === 'CONFIRMED' && (
              <div className="shrink-0 border-t border-navy-border px-5 py-4 space-y-3">
                <p className="text-xs text-muted">
                  This complaint is confirmed. Mark it resolved once remediation is complete.
                </p>
                <div className="flex flex-wrap gap-2 justify-end">
                  <button
                    type="button"
                    className="btn-primary px-4 py-2 text-sm"
                    disabled={isReviewing}
                    onClick={handleResolve}
                  >
                    Resolve complaint
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
