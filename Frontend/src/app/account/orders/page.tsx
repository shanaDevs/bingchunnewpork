'use client';
import { useEffect, useMemo, useRef, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Package,
  ChevronRight,
  RotateCcw,
  ChevronLeft,
  Receipt,
  Search,
  X,
  MapPin,
  Calendar,
  SlidersHorizontal,
  ArrowUpDown,
  ShoppingBag,
  Truck,
  Lock,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';
import { api } from '@/lib/api';
import type { Order, OrderStatus } from '@/types';
import { formatDateTime } from '@/lib/datetime';
import toast from 'react-hot-toast';
import { getStatusLabel } from '@/lib/orderStatus';
import { markReceiptOpenedFrom } from '@/lib/orderLinks';

type StatusFilter = 'ALL' | 'ACTIVE' | 'DELIVERED' | 'CANCELLED';
type ModeFilter = 'ALL' | 'DELIVERY' | 'TAKEAWAY';
type RangeFilter = 'ALL' | '7D' | '30D' | '90D';
type SortFilter = 'NEWEST' | 'OLDEST' | 'TOTAL';

const ACTIVE_STATUSES: OrderStatus[] = ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

const STATUS_FILTERS: { value: StatusFilter; label: string; chip: string }[] = [
  { value: 'ALL', label: 'All', chip: 'all' },
  { value: 'ACTIVE', label: 'Active', chip: 'active' },
  { value: 'DELIVERED', label: 'Completed', chip: 'completed' },
  { value: 'CANCELLED', label: 'Cancelled', chip: 'cancelled' },
];

const MODE_FILTERS: { value: ModeFilter; label: string }[] = [
  { value: 'ALL', label: 'All types' },
  { value: 'DELIVERY', label: 'Delivery' },
  { value: 'TAKEAWAY', label: 'Takeaway' },
];

const RANGE_FILTERS: { value: RangeFilter; label: string; days?: number }[] = [
  { value: 'ALL', label: 'All time' },
  { value: '7D', label: 'Last 7 days', days: 7 },
  { value: '30D', label: 'Last 30 days', days: 30 },
  { value: '90D', label: 'Last 3 months', days: 90 },
];

const SORT_FILTERS: { value: SortFilter; label: string }[] = [
  { value: 'NEWEST', label: 'Newest' },
  { value: 'OLDEST', label: 'Oldest' },
  { value: 'TOTAL', label: 'Highest total' },
];

function statusTone(status: OrderStatus): string {
  if (status === 'CANCELLED') return 'cancelled';
  if (status === 'DELIVERED') return 'completed';
  if (status === 'READY') return 'ready';
  if (status === 'PREPARING') return 'preparing';
  if (status === 'OUT_FOR_DELIVERY') return 'delivery';
  return 'received';
}

function OrdersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const celebrated = useRef(false);
  const { isAuthenticated, user } = useAuthStore();
  const { addItem, setOrderMode } = useCartStore();

  useEffect(() => {
    if (!isAuthenticated) router.replace('/account/login');
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (celebrated.current || searchParams.get('celebrate') !== '1') return;
    celebrated.current = true;
    const orderNum = searchParams.get('order');
    if (orderNum) {
      router.replace(`/order/${encodeURIComponent(orderNum)}`);
      return;
    }
    toast.success('Order placed successfully!', { duration: 4000 });
    router.replace('/account/orders', { scroll: false });
  }, [searchParams, router]);

  const { data: orders = [], isLoading, isError, refetch } = useQuery<Order[]>({
    queryKey: ['my-orders', user?.id],
    queryFn: async () => {
      const result = await api.get<Order[]>('/orders/my?limit=50', true);
      return Array.isArray(result) ? result : [];
    },
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [modeFilter, setModeFilter] = useState<ModeFilter>('ALL');
  const [rangeFilter, setRangeFilter] = useState<RangeFilter>('ALL');
  const [sortBy, setSortBy] = useState<SortFilter>('NEWEST');

  const hasActiveFilters =
    search.trim() !== '' ||
    statusFilter !== 'ALL' ||
    modeFilter !== 'ALL' ||
    rangeFilter !== 'ALL' ||
    sortBy !== 'NEWEST';

  function clearFilters() {
    setSearch('');
    setStatusFilter('ALL');
    setModeFilter('ALL');
    setRangeFilter('ALL');
    setSortBy('NEWEST');
  }

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rangeDays = RANGE_FILTERS.find((r) => r.value === rangeFilter)?.days;
    const cutoff = rangeDays ? Date.now() - rangeDays * 24 * 60 * 60 * 1000 : null;

    const next = orders.filter((order) => {
      if (statusFilter === 'ACTIVE' && !ACTIVE_STATUSES.includes(order.status)) return false;
      if (statusFilter === 'DELIVERED' && order.status !== 'DELIVERED') return false;
      if (statusFilter === 'CANCELLED' && order.status !== 'CANCELLED') return false;

      if (modeFilter !== 'ALL' && order.orderMode !== modeFilter) return false;

      if (cutoff && new Date(order.createdAt).getTime() < cutoff) return false;

      if (query) {
        const inOrderNumber = order.orderNumber.toLowerCase().includes(query);
        const inItems = order.items?.some((item) =>
          item.productName?.toLowerCase().includes(query)
        );
        const inStore = order.store?.name?.toLowerCase().includes(query);
        if (!inOrderNumber && !inItems && !inStore) return false;
      }

      return true;
    });

    next.sort((a, b) => {
      if (sortBy === 'OLDEST') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'TOTAL') {
        return b.total - a.total;
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return next;
  }, [orders, search, statusFilter, modeFilter, rangeFilter, sortBy]);

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { ALL: orders.length, ACTIVE: 0, DELIVERED: 0, CANCELLED: 0 };
    for (const order of orders) {
      if (ACTIVE_STATUSES.includes(order.status)) counts.ACTIVE++;
      else if (order.status === 'DELIVERED') counts.DELIVERED++;
      else if (order.status === 'CANCELLED') counts.CANCELLED++;
    }
    return counts;
  }, [orders]);

  async function reorder(order: Order) {
    setOrderMode(order.orderMode);
    let added = 0;
    for (const item of order.items) {
      try {
        const productRes = await api.get<{ isAvailable: boolean } & Record<string, unknown>>(
          `/menu/products/${item.productId}`
        );
        if (productRes.isAvailable) {
          addItem({
            product: productRes as never,
            size: item.size as never,
            toppings: [],
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          });
          added++;
        }
      } catch {
        /* skip unavailable */
      }
    }
    if (added > 0) {
      toast.success(`${added} item${added > 1 ? 's' : ''} added to your cup! 🧋`);
      router.push('/cart');
    } else {
      toast.error('No items available for reorder');
    }
  }

  return (
    <div className="my-orders">
      <header className="my-orders__header">
        <div className="my-orders__header-copy">
          <Link href="/account" className="my-orders__back" aria-label="Back to account">
            <ChevronLeft size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="my-orders__title">My Orders</h1>
            <p className="my-orders__subtitle">
              {user?.phone ? `Orders for ${user.phone}` : 'Order history & tracking'}
            </p>
          </div>
        </div>
        <div className="my-orders__hero-visual" aria-hidden>
          <div className="my-orders__hero-bag">
            <ShoppingBag size={22} />
          </div>
          <Image
            src="/promos/menu-hero-cup.png"
            alt=""
            width={88}
            height={110}
            className="my-orders__hero-cup"
            unoptimized
          />
          <p className="my-orders__hero-caption">
            View and manage all your bubble tea orders in one place.
          </p>
        </div>
      </header>

      {!isLoading && !isError && orders.length > 0 && (
        <div className="my-orders__toolbar">
          <div className="my-orders__search-row">
            <div className="my-orders__search">
              <Search size={16} className="my-orders__search-icon" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search order #, item or store..."
                className="my-orders__search-input"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="my-orders__search-clear"
                >
                  <X size={15} />
                </button>
              )}
            </div>

            <div className="my-orders__selects">
              <label className="my-orders__select-wrap">
                <Calendar size={14} />
                <select
                  value={rangeFilter}
                  onChange={(e) => setRangeFilter(e.target.value as RangeFilter)}
                  aria-label="Filter by date range"
                >
                  {RANGE_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </label>
              <label className="my-orders__select-wrap">
                <SlidersHorizontal size={14} />
                <select
                  value={modeFilter}
                  onChange={(e) => setModeFilter(e.target.value as ModeFilter)}
                  aria-label="Filter by order type"
                >
                  {MODE_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </label>
              <label className="my-orders__select-wrap">
                <ArrowUpDown size={14} />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortFilter)}
                  aria-label="Sort orders"
                >
                  {SORT_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="my-orders__chips">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`my-orders__chip my-orders__chip--${f.chip}${
                  statusFilter === f.value ? ' my-orders__chip--on' : ''
                }`}
              >
                {f.label}
                <span>({statusCounts[f.value]})</span>
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <div className="my-orders__filter-meta">
              <p>
                Showing {filteredOrders.length} of {orders.length} order{orders.length === 1 ? '' : 's'}
              </p>
              <button type="button" onClick={clearFilters} className="my-orders__clear">
                <X size={13} /> Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="my-orders__list">
          {[1, 2, 3].map((i) => (
            <div key={i} className="my-orders__card my-orders__card--skeleton" />
          ))}
        </div>
      ) : isError ? (
        <div className="my-orders__empty my-orders__empty--card">
          <p className="text-muted text-sm mb-4">Could not load your orders.</p>
          <button type="button" onClick={() => refetch()} className="btn-primary px-6 py-2.5 text-sm">
            Try again
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="my-orders__empty">
          <Package size={48} className="mx-auto text-muted mb-4" />
          <h3 className="text-lg font-semibold text-fg mb-2">No orders yet</h3>
          <p className="text-muted text-sm mb-6 max-w-xs mx-auto">
            Place an order while signed in with your mobile number and it will show here.
          </p>
          <Link href="/menu" className="btn-primary px-6 py-3 inline-flex">
            Order Now
          </Link>
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="my-orders__empty my-orders__empty--card">
          <Search size={36} className="mx-auto text-muted mb-3" />
          <h3 className="text-base font-semibold text-fg mb-1">No matching orders</h3>
          <p className="text-muted text-sm mb-4">Try changing or clearing the filters above.</p>
          <button type="button" onClick={clearFilters} className="btn-outline px-5 py-2 text-sm inline-flex items-center gap-1.5">
            <X size={14} /> Clear filters
          </button>
        </div>
      ) : (
        <div className="my-orders__list">
          {filteredOrders.map((order, i) => {
            const ModeIcon = order.orderMode === 'DELIVERY' ? Truck : Lock;
            const tone = statusTone(order.status);
            return (
              <motion.article
                key={order.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.04, 0.24) }}
                className="my-orders__card"
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a, button')) return;
                  router.push(`/order/${order.orderNumber}`);
                }}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    router.push(`/order/${order.orderNumber}`);
                  }
                }}
              >
              <div className="my-orders__identity">
                <div className={`my-orders__icon my-orders__icon--${tone}`}>
                  <ShoppingBag size={22} />
                </div>
                <div className="my-orders__id">
                  <p className="my-orders__number">#{order.orderNumber}</p>
                  <p className="my-orders__date">
                    {formatDateTime(order.createdAt, {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>

                <div className="my-orders__details">
                  <p className="my-orders__meta">
                    <ModeIcon size={13} />
                    <span>
                      {order.orderMode === 'DELIVERY' ? 'Delivery' : 'Takeaway'} · {order.store?.name || 'Bing Chun'}
                    </span>
                  </p>
                  {order.items?.length > 0 && (
                    <p className="my-orders__items">
                      {order.items.map((item) => `${item.productName} x${item.quantity}`).join(', ')}
                    </p>
                  )}
                </div>

                <p className="my-orders__price">LKR {order.total.toLocaleString()}</p>

                <div className="my-orders__aside">
                  <div className="my-orders__status-row">
                    <span className={`my-orders__status my-orders__status--${tone}`}>
                      <span className="my-orders__status-dot" />
                      {getStatusLabel(order.status, order.orderMode)}
                    </span>
                    <ChevronRight size={16} className="my-orders__chevron" />
                  </div>
                  <div className="my-orders__actions">
                    <Link href={`/order/${order.orderNumber}`} className="btn-outline my-orders__btn">
                      <MapPin size={14} /> Track
                    </Link>
                    <Link
                      href={`/order/${order.orderNumber}/receipt`}
                      className="btn-outline my-orders__btn"
                      onClick={() => markReceiptOpenedFrom()}
                    >
                      <Receipt size={14} /> Receipt
                    </Link>
                    <button
                      type="button"
                      onClick={() => reorder(order)}
                      className="btn-primary my-orders__btn"
                    >
                      <RotateCcw size={14} /> Reorder
                    </button>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function OrdersPage() {
  return (
    <Suspense fallback={
      <div className="my-orders my-orders--loading">
        <div className="my-orders__card my-orders__card--skeleton" />
        <div className="my-orders__card my-orders__card--skeleton" />
      </div>
    }>
      <OrdersPageContent />
    </Suspense>
  );
}
