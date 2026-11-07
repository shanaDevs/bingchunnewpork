'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronUp, ChevronDown, ListOrdered, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { STATUS_LABELS } from '@/lib/orderStatus';
import { formatDateTime, formatTime } from '@/lib/datetime';
import { useThemeStore, type Theme } from '@/store/themeStore';
import { resolveCustomerDisplayName } from '@/lib/customerName';

type QueueOrder = {
  id: string;
  orderNumber: string;
  status: string;
  queuePosition: number | null;
  scheduledPickupAt?: string | null;
  createdAt: string;
  total: number;
  guestName?: string | null;
  guestPhone?: string | null;
  user?: { name?: string | null; phone?: string | null } | null;
  items?: { productName: string; quantity: number }[];
};

type QueueSort = 'queue' | 'ordered-asc' | 'ordered-desc';

const STATUSES = ['RECEIVED', 'PREPARING', 'READY'] as const;

const STATUS_ORDER: Record<(typeof STATUSES)[number], number> = {
  RECEIVED: 0,
  PREPARING: 1,
  READY: 2,
};

const STATUS_FILL: Record<Theme, Record<(typeof STATUSES)[number], string>> = {
  dark: {
    RECEIVED: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    PREPARING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    READY: 'bg-green-500/15 text-green-400 border-green-500/30',
  },
  light: {
    RECEIVED: 'bg-blue-500/10 text-blue-700 border-blue-300/55',
    PREPARING: 'bg-amber-500/10 text-amber-700 border-amber-300/55',
    READY: 'bg-green-500/10 text-green-700 border-green-300/55',
  },
};

const STATUS_DISABLED: Record<Theme, string> = {
  dark: 'bg-navy-light/60 text-gray-500 border-navy-border',
  light: 'bg-gray-100 text-gray-400 border-gray-200',
};

function isStatusDisabled(
  current: (typeof STATUSES)[number],
  option: (typeof STATUSES)[number],
): boolean {
  return STATUS_ORDER[option] < STATUS_ORDER[current];
}

function QueueStatusSelect({
  orderNumber,
  status,
  busy,
  theme,
  onChange,
}: {
  orderNumber: string;
  status: (typeof STATUSES)[number];
  busy: boolean;
  theme: Theme;
  onChange: (status: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const current = STATUSES.includes(status as (typeof STATUSES)[number])
    ? (status as (typeof STATUSES)[number])
    : 'RECEIVED';

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePosition = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [open]);

  const menu =
    open &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={menuRef}
        role="listbox"
        style={menuStyle}
        className="rounded-xl border border-navy-border bg-navy-card shadow-2xl overflow-hidden"
      >
        {STATUSES.map((s) => {
          const disabled = isStatusDisabled(current, s);
          const isSelected = s === current;
          const itemClass = disabled
            ? STATUS_DISABLED[theme]
            : `${STATUS_FILL[theme][s]} ${isSelected ? 'ring-2 ring-inset ring-brand/25' : ''}`;

          return (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={disabled || busy}
              onClick={() => {
                if (disabled) return;
                setOpen(false);
                onChange(s);
              }}
              className={`w-full text-left px-3 py-2.5 text-xs font-semibold border-b border-navy-border/50 last:border-0 transition-opacity ${
                disabled ? 'cursor-not-allowed' : 'cursor-pointer hover:opacity-90'
              } ${itemClass}`}
            >
              {STATUS_LABELS[s]}
            </button>
          );
        })}
      </div>,
      document.body,
    );

  return (
    <div className="w-full min-w-[132px]">
      <button
        ref={triggerRef}
        type="button"
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
        className={`w-full text-xs font-semibold border rounded-xl px-3 py-2 flex items-center justify-between gap-2 transition-colors disabled:opacity-60 ${STATUS_FILL[theme][current]}`}
        aria-label={`Update status for order ${orderNumber}`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{STATUS_LABELS[current]}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {menu}
    </div>
  );
}

type Props = {
  adminFetch: (endpoint: string, options?: RequestInit) => Promise<{ data?: QueueOrder[] }>;
};

function formatOrderedAt(iso: string): string {
  return formatDateTime(iso, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPickupAt(iso: string): string {
  return formatTime(iso);
}

function sortQueue(orders: QueueOrder[], sort: QueueSort): QueueOrder[] {
  if (sort === 'queue') return orders;
  const sorted = [...orders].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  return sort === 'ordered-desc' ? sorted.reverse() : sorted;
}

function itemCount(items: QueueOrder['items']): number {
  return items?.reduce((sum, i) => sum + i.quantity, 0) ?? 0;
}

export default function AdminTakeawayQueuePanel({ adminFetch }: Props) {
  const qc = useQueryClient();
  const theme = useThemeStore((s) => s.theme);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [queueSort, setQueueSort] = useState<QueueSort>('queue');

  const { data: queue = [], isLoading, refetch } = useQuery({
    queryKey: ['admin-takeaway-queue'],
    queryFn: async () => {
      const res = await adminFetch('/orders/takeaway-queue');
      return (res.data || []) as QueueOrder[];
    },
    refetchInterval: 12000,
  });

  const reorder = useMutation({
    mutationFn: (orderIds: string[]) =>
      adminFetch('/orders/takeaway-queue/reorder', {
        method: 'PUT',
        body: JSON.stringify({ orderIds }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-takeaway-queue'] });
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success('Queue updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Reorder failed'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      adminFetch(`/orders/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-takeaway-queue'] });
      qc.invalidateQueries({ queryKey: ['admin-orders'] });
      toast.success('Status updated');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed'),
  });

  function moveOrder(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= queue.length) return;
    const ids = queue.map((o) => o.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    reorder.mutate(ids);
  }

  const displayed = sortQueue(queue, queueSort);

  return (
    <div className="admin-takeaway-queue card p-4 sm:p-5 mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-bold text-fg flex items-center gap-2">
            <ListOrdered size={20} className="text-brand" />
            Takeaway pickup queue
          </h2>
          <p className="text-muted text-xs mt-1">
            {queueSort === 'queue'
              ? 'Reorder with arrows · update prep status'
              : 'Switch to “Queue order” to reorder · sorted by ordered time'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={queueSort}
            onChange={(e) => setQueueSort(e.target.value as QueueSort)}
            className="filter-select text-xs"
            aria-label="Sort queue"
          >
            <option value="queue">Queue order</option>
            <option value="ordered-asc">Ordered · oldest first</option>
            <option value="ordered-desc">Ordered · newest first</option>
          </select>
          <button type="button" onClick={() => refetch()} className="btn-outline text-xs px-3 py-2">
            Refresh
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 text-center text-muted text-sm flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Loading queue…
        </div>
      ) : queue.length === 0 ? (
        <p className="text-muted text-sm text-center py-6">No active takeaway orders in queue</p>
      ) : (
        <div className="rounded-xl border border-navy-border">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-navy-border bg-navy-light/60 text-left text-muted text-xs uppercase tracking-wide">
                  <th className="px-3 py-3 font-semibold w-[140px]">#</th>
                  <th className="px-3 py-3 font-semibold min-w-[140px]">Order</th>
                  <th className="px-3 py-3 font-semibold min-w-[100px]">Customer</th>
                  <th className="px-3 py-3 font-semibold min-w-[200px]">Items</th>
                  <th className="px-3 py-3 font-semibold w-[72px] text-center">Qty</th>
                  <th className="px-3 py-3 font-semibold w-[110px] text-right">Total</th>
                  <th className="px-3 py-3 font-semibold min-w-[130px]">Ordered</th>
                  <th className="px-3 py-3 font-semibold w-[90px]">Pickup</th>
                  <th className="px-3 py-3 font-semibold w-[150px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((order, index) => {
                  const items = order.items ?? [];
                  const totalItems = itemCount(items);
                  return (
                    <tr
                      key={order.id}
                      className="border-b border-navy-border/60 hover:bg-navy-light/40 transition-colors align-middle"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="w-10 h-10 rounded-full bg-brand text-white font-bold text-sm flex items-center justify-center shrink-0">
                            {order.queuePosition ?? index + 1}
                          </span>
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              disabled={queueSort !== 'queue' || index === 0 || reorder.isPending}
                              onClick={() => moveOrder(index, -1)}
                              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-navy-border bg-navy-light/60 flex items-center justify-center text-fg hover:bg-navy-light hover:border-brand active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all touch-manipulation"
                              aria-label="Move up in queue"
                            >
                              <ChevronUp size={22} strokeWidth={2.5} />
                            </button>
                            <button
                              type="button"
                              disabled={
                                queueSort !== 'queue' ||
                                index === displayed.length - 1 ||
                                reorder.isPending
                              }
                              onClick={() => moveOrder(index, 1)}
                              className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-navy-border bg-navy-light/60 flex items-center justify-center text-fg hover:bg-navy-light hover:border-brand active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all touch-manipulation"
                              aria-label="Move down in queue"
                            >
                              <ChevronDown size={22} strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>
                      </td>

                      <td className="px-3 py-3">
                        <p className="font-mono font-semibold text-fg whitespace-nowrap">
                          {order.orderNumber}
                        </p>
                      </td>

                      <td className="px-3 py-3 text-fg whitespace-nowrap">
                        {resolveCustomerDisplayName({
                          guestName: order.guestName,
                          userName: order.user?.name,
                          phone: order.guestPhone ?? order.user?.phone,
                        })}
                      </td>

                      <td className="px-3 py-3">
                        {items.length > 0 ? (
                          <ul className="space-y-0.5">
                            {items.map((item, i) => (
                              <li key={`${order.id}-${i}`} className="text-fg text-xs leading-snug">
                                {item.productName}
                                <span className="text-muted"> ×{item.quantity}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-center text-fg font-medium tabular-nums">
                        {totalItems || '—'}
                      </td>

                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        <span className="font-bold text-green-400 tabular-nums">
                          LKR {order.total?.toLocaleString()}
                        </span>
                      </td>

                      <td className="px-3 py-3 text-muted text-xs whitespace-nowrap tabular-nums">
                        {formatOrderedAt(order.createdAt)}
                      </td>

                      <td className="px-3 py-3 text-brand text-xs font-semibold whitespace-nowrap tabular-nums">
                        {order.scheduledPickupAt ? formatPickupAt(order.scheduledPickupAt) : '—'}
                      </td>

                      <td className="px-3 py-3">
                        <QueueStatusSelect
                          orderNumber={order.orderNumber}
                          status={
                            STATUSES.includes(order.status as (typeof STATUSES)[number])
                              ? (order.status as (typeof STATUSES)[number])
                              : 'RECEIVED'
                          }
                          busy={busyId === order.id || updateStatus.isPending}
                          theme={theme}
                          onChange={(nextStatus) => {
                            if (
                              isStatusDisabled(
                                order.status as (typeof STATUSES)[number],
                                nextStatus as (typeof STATUSES)[number],
                              )
                            ) {
                              return;
                            }
                            setBusyId(order.id);
                            updateStatus.mutate(
                              { id: order.id, status: nextStatus },
                              { onSettled: () => setBusyId(null) },
                            );
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
