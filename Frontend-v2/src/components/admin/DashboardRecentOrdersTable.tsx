'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  CreditCard,
  Globe,
  Package,
  Search,
  ShoppingBag,
  Star,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import toast from 'react-hot-toast';

import { cn } from '@/lib/utils';
import { formatMoneyAmount } from '@/lib/receipt';
import { resolveCustomerDisplayName } from '@/lib/customerName';

export type RecentOrderRow = {
  id: string;
  orderNumber: string;
  orderMode: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  total: number;
  createdAt: string;
  guestName?: string | null;
  guestPhone?: string | null;
  user?: { name?: string | null; phone?: string | null } | null;
};

import { ONLINE_PAYMENT_LABEL } from '@/lib/paymentMethodLabels';

const PAYMENT_LABELS: Record<string, string> = {
  PAYHERE: ONLINE_PAYMENT_LABEL,
  CARD: ONLINE_PAYMENT_LABEL,
  CASH_AT_COUNTER: 'Cash',
  LOYALTY_POINTS: 'Loyalty',
};

type SortKey = 'date' | 'total' | 'orderId';
type SortDir = 'asc' | 'desc';
type StatusFilter = 'all' | 'in_progress' | 'pending' | 'completed' | 'cancelled';

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All Statuses' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function formatOrderDate(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleString('en-LK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const time = d
    .toLocaleString('en-LK', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
  return `${date} - ${time}`;
}

function orderTypeLabel(mode: string) {
  return mode === 'DELIVERY' ? 'Delivery' : 'Pickup';
}

type BadgeView = {
  label: string;
  className: string;
  Icon: LucideIcon;
};

function resolveStatusBadge(order: RecentOrderRow): BadgeView {
  if (order.status === 'CANCELLED') {
    return {
      label: 'Cancelled',
      className: 'admin-orders-table__badge admin-orders-table__badge--cancelled',
      Icon: XCircle,
    };
  }
  if (order.paymentStatus === 'PENDING') {
    return {
      label: 'Pending',
      className: 'admin-orders-table__badge admin-orders-table__badge--pending',
      Icon: AlertCircle,
    };
  }
  if (order.status === 'DELIVERED') {
    return {
      label: 'Completed',
      className: 'admin-orders-table__badge admin-orders-table__badge--completed',
      Icon: CheckCircle2,
    };
  }
  return {
    label: 'In Progress',
    className: 'admin-orders-table__badge admin-orders-table__badge--progress',
    Icon: Package,
  };
}

function resolvePaymentBadge(method: string): BadgeView {
  const label = PAYMENT_LABELS[method] ?? method;

  switch (method) {
    case 'PAYHERE':
      return {
        label,
        className: 'admin-orders-table__badge admin-orders-table__badge--payment-online',
        Icon: Globe,
      };
    case 'CARD':
      return {
        label,
        className: 'admin-orders-table__badge admin-orders-table__badge--payment-card',
        Icon: CreditCard,
      };
    case 'CASH_AT_COUNTER':
      return {
        label,
        className: 'admin-orders-table__badge admin-orders-table__badge--payment-cash',
        Icon: Banknote,
      };
    case 'LOYALTY_POINTS':
      return {
        label,
        className: 'admin-orders-table__badge admin-orders-table__badge--payment-loyalty',
        Icon: Star,
      };
    default:
      return {
        label,
        className: 'admin-orders-table__badge admin-orders-table__badge--payment',
        Icon: CreditCard,
      };
  }
}

function OrderBadge({ badge }: { badge: BadgeView }) {
  const { Icon, label, className } = badge;
  return (
    <span className={className}>
      <Icon className="admin-orders-table__badge-icon" aria-hidden />
      {label}
    </span>
  );
}

function matchesStatusFilter(order: RecentOrderRow, filter: StatusFilter) {
  if (filter === 'all') return true;
  const badge = resolveStatusBadge(order);
  if (filter === 'in_progress') return badge.label === 'In Progress';
  if (filter === 'pending') return badge.label === 'Pending';
  if (filter === 'completed') return badge.label === 'Completed';
  return badge.label === 'Cancelled';
}

type Props = {
  orders: RecentOrderRow[];
  loading?: boolean;
  variant?: 'default' | 'superAdmin';
};

export default function DashboardRecentOrdersTable({ orders, loading, variant = 'default' }: Props) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = orders.filter((o) => matchesStatusFilter(o, statusFilter));
    if (q) {
      rows = rows.filter((o) => {
        const customer = resolveCustomerDisplayName({
          guestName: o.guestName,
          userName: o.user?.name,
          phone: o.guestPhone ?? o.user?.phone,
          fallback: '',
        });
        const hay = [o.orderNumber, customer, PAYMENT_LABELS[o.paymentMethod] ?? o.paymentMethod]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'date') cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortKey === 'total') cmp = a.total - b.total;
      else cmp = a.orderNumber.localeCompare(b.orderNumber);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [orders, search, statusFilter, sortKey, sortDir]);

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const safePage = Math.min(page, totalPages);
  const pageStart = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const pageEnd = Math.min(safePage * pageSize, totalItems);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir(key === 'orderId' ? 'asc' : 'desc');
    }
    setPage(1);
  };

  const copyOrderNumber = async (orderNumber: string) => {
    try {
      await navigator.clipboard.writeText(orderNumber);
      toast.success('Order ID copied');
    } catch {
      toast.error('Could not copy');
    }
  };

  const pageNumbers = useMemo(() => {
    const pages: number[] = [];
    const maxButtons = 5;
    let start = Math.max(1, safePage - 2);
    const end = Math.min(totalPages, start + maxButtons - 1);
    start = Math.max(1, end - maxButtons + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }, [safePage, totalPages]);

  const isSuperAdmin = variant === 'superAdmin';

  return (
    <div className="admin-orders-table card h-full overflow-hidden">
      <div className="admin-orders-table__header flex flex-col gap-4 border-b border-[var(--color-navy-border)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-fg">Recent Orders</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="admin-orders-table__search relative min-w-[10rem] flex-1 sm:w-52 sm:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder={isSuperAdmin ? 'Search order ID, customer...' : 'Search'}
              className="h-9 w-full rounded-lg border border-[var(--color-navy-border)] bg-[var(--color-input-bg)] pr-3 pl-9 text-sm text-fg outline-none placeholder:text-muted focus:border-brand focus:ring-2 focus:ring-brand/15"
            />
          </label>
          <label className="admin-orders-table__status-select relative inline-flex items-center">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as StatusFilter);
                setPage(1);
              }}
              aria-label="Filter by status"
              className="admin-orders-table__tool-btn h-9 appearance-none rounded-lg border border-[var(--color-navy-border)] bg-[var(--color-navy-card)] py-0 pr-8 pl-3 text-sm font-medium text-fg outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted" />
          </label>
          <Link
            href="/admin/orders"
            className="admin-orders-table__tool-btn inline-flex h-9 items-center gap-1 rounded-lg border border-[var(--color-navy-border)] bg-[var(--color-navy-card)] px-3 text-sm font-medium text-fg"
          >
            View All
            <ChevronRight className="size-4 text-muted" />
          </Link>
        </div>
      </div>

      <div className="overflow-x-auto">
        {loading ? (
          <div className="py-16 text-center text-sm text-muted">Loading orders…</div>
        ) : orders.length === 0 ? (
          <div className="py-16 text-center text-muted">
            <ShoppingBag size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No orders in this period</p>
          </div>
        ) : (
          <table className="admin-orders-table__grid w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-navy-border)] text-left">
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort('orderId')} className="admin-orders-table__th">
                    Order ID
                    <ChevronDown className={cn('size-3.5', sortKey === 'orderId' && sortDir === 'asc' && 'rotate-180')} />
                  </button>
                </th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort('date')} className="admin-orders-table__th">
                    Order Date
                    <ChevronDown className={cn('size-3.5', sortKey === 'date' && sortDir === 'asc' && 'rotate-180')} />
                  </button>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted">Order Type</th>
                <th className="px-4 py-3">
                  <button type="button" onClick={() => toggleSort('total')} className="admin-orders-table__th">
                    Order Total (LKR)
                    <ChevronDown className={cn('size-3.5', sortKey === 'total' && sortDir === 'asc' && 'rotate-180')} />
                  </button>
                </th>
                <th className="px-4 py-3 text-xs font-medium text-muted">Payment Method</th>
                <th className="px-4 py-3 text-xs font-medium text-muted">Status</th>
                {isSuperAdmin && (
                  <th className="px-4 py-3 text-xs font-medium text-muted">Action</th>
                )}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((order) => {
                const status = resolveStatusBadge(order);
                const payment = resolvePaymentBadge(order.paymentMethod);
                return (
                  <tr key={order.id} className="admin-orders-table__row border-b border-[var(--color-navy-border)]/70 last:border-b-0">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-medium text-fg">{order.orderNumber}</span>
                        <button
                          type="button"
                          onClick={() => copyOrderNumber(order.orderNumber)}
                          className="rounded-md p-1 text-muted transition-colors hover:bg-[var(--color-navy-light)] hover:text-fg"
                          aria-label="Copy order ID"
                        >
                          <Copy className="size-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-fg">{formatOrderDate(order.createdAt)}</td>
                    <td className="px-4 py-4 text-fg">{orderTypeLabel(order.orderMode)}</td>
                    <td className="px-4 py-4 font-semibold tabular-nums text-fg">{formatMoneyAmount(order.total)}</td>
                    <td className="px-4 py-4">
                      <OrderBadge badge={payment} />
                    </td>
                    <td className="px-4 py-4">
                      <OrderBadge badge={status} />
                    </td>
                    {isSuperAdmin && (
                      <td className="px-4 py-4">
                        <Link
                          href={`/admin/orders?order=${encodeURIComponent(order.orderNumber)}`}
                          className="inline-flex h-8 items-center rounded-lg border border-[var(--color-navy-border)] bg-[var(--color-navy-card)] px-3 text-xs font-medium text-fg transition-colors hover:border-brand/40 hover:text-brand"
                        >
                          View
                        </Link>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {!loading && orders.length > 0 && (
        <div className="admin-orders-table__footer flex flex-col gap-3 border-t border-[var(--color-navy-border)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <label className="inline-flex items-center gap-2">
              <span className="text-xs">Items per page</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 rounded-lg border border-[var(--color-navy-border)] bg-[var(--color-input-bg)] px-2 text-xs text-fg"
              >
                {[5, 10, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <span className="text-xs">
              {pageStart}-{pageEnd} of {totalItems} items
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-muted">
              {safePage} of {totalPages} pages
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="admin-orders-table__page-btn"
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </button>
              {pageNumbers.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={cn(
                    'admin-orders-table__page-num',
                    n === safePage && 'admin-orders-table__page-num--active',
                  )}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="admin-orders-table__page-btn"
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
