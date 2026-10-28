'use client';
import { getApiBaseUrl } from '@/lib/apiBase';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { keepPreviousData, useQuery, useQueries } from '@tanstack/react-query';
import type { DateRange } from 'react-day-picker';
import {
  RefreshCw,
  Download,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ShoppingBag,
  Bike,
  PackageCheck,
  XCircle,
} from 'lucide-react';
import AdminOrderDrawer from '@/components/admin/AdminOrderDrawer';
import AdminOrderItemsCompact from '@/components/admin/AdminOrderItemsCompact';
import AdminOrderStatusReadonly from '@/components/admin/AdminOrderStatusReadonly';
import AdminReceiptModal from '@/components/admin/AdminReceiptModal';
import DashboardPeriodFilter, {
  orderDateRange,
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
import SearchableBranchSelect from '@/components/admin/SearchableBranchSelect';
import { getAdminSession, isSuperAdmin, type AdminSession } from '@/lib/adminAuth';
import { isOrderPaid } from '@/lib/receipt';
import { adminBadgeClass, paymentStatusBadgeVariant } from '@/lib/adminBadges';
import type { PaymentMethod } from '@/types';
import { ADMIN_TABLE_PAGE_SIZE, buildPageList } from '@/lib/pagination';
import OrderChannelBadge from '@/components/admin/OrderChannelBadge';
import {
  RefundStatusBadge,
  refundStatusLabel,
} from '@/components/admin/RefundStatusBadge';
import { isOrderChannel, type OrderChannel } from '@/lib/orderChannel';
import { shortBranchName } from '@/lib/branchName';

const API_BASE = getApiBaseUrl();

type OrderModeFilter = '' | 'TAKEAWAY' | 'DELIVERY';
type OrderTab = 'pickup' | 'delivery';
type ArchiveView = 'delivered' | 'cancelled';

type AdminOrderItem = {
  productName: string;
  quantity: number;
  product?: { imageUrl?: string | null };
};

type AdminOrderRow = {
  id: string;
  orderNumber: string;
  orderMode: string;
  status: string;
  total: number;
  createdAt: string;
  paymentMethod: string;
  paymentStatus: string;
  channel?: string | null;
  guestPhone?: string | null;
  processedByName?: string | null;
  processedByAdminId?: string | null;
  items?: AdminOrderItem[];
  store?: { name?: string } | null;
  refund?: {
    id: string;
    status: string;
  } | null;
};

const ORDER_TABS: {
  id: OrderTab;
  label: string;
  icon: typeof ShoppingBag;
  mode: OrderModeFilter;
}[] = [
  { id: 'pickup', label: 'Pickup Queue', icon: ShoppingBag, mode: 'TAKEAWAY' },
  { id: 'delivery', label: 'Delivery Jobs', icon: Bike, mode: 'DELIVERY' },
];

function tabToMode(tab: OrderTab): OrderModeFilter {
  return ORDER_TABS.find((t) => t.id === tab)?.mode ?? '';
}

const DEFAULT_STATUS_FILTER = 'active';
const DELIVERY_ACTIVE_EXCLUDE = 'DELIVERED,OUT_FOR_DELIVERY';

function activeExcludeStatus(mode: OrderModeFilter): string {
  return mode === 'DELIVERY' ? DELIVERY_ACTIVE_EXCLUDE : 'DELIVERED';
}

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Received',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

async function adminFetch(endpoint: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.message || 'Request failed');
  return json;
}

function statusLabel(status: string, mode: string): string {
  if (status === 'DELIVERED' && mode === 'TAKEAWAY') return 'Picked up';
  return STATUS_LABELS[status] ?? status;
}

function PaymentStatusBadge({ order }: { order: AdminOrderRow }) {
  const payment = {
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod as PaymentMethod,
  };
  const paid = isOrderPaid(payment);
  const label = paid ? 'Paid' : order.paymentStatus === 'FAILED' ? 'Failed' : 'Unpaid';
  const variant = paymentStatusBadgeVariant(payment);
  return <span className={adminBadgeClass(variant)}>{label}</span>;
}

function formatRefundStatusExport(order: AdminOrderRow): string {
  const refund = order.refund;
  if (!refund) return '—';
  return refundStatusLabel(refund.status);
}

function RefundStatusCell({
  order,
  onOpenRefund,
}: {
  order: AdminOrderRow;
  onOpenRefund: (refundId: string) => void;
}) {
  const refund = order.refund;
  if (!refund) {
    return <span className="text-xs text-muted">—</span>;
  }

  return (
    <button
      type="button"
      className="all-orders-overview__refund-link flex flex-col items-start gap-1"
      onClick={(e) => {
        e.stopPropagation();
        onOpenRefund(refund.id);
      }}
    >
      <RefundStatusBadge status={refund.status} />
    </button>
  );
}

export default function AllOrdersPage() {
  const router = useRouter();
  const searchDebounceInit = useRef(true);
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [activeTab, setActiveTab] = useState<OrderTab>('pickup');
  const [archiveView, setArchiveView] = useState<ArchiveView | null>(null);
  const modeFilter = archiveView ? '' : tabToMode(activeTab);
  const [statusFilter] = useState(DEFAULT_STATUS_FILTER);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedOrderKey, setSelectedOrderKey] = useState<string | null>(null);
  const [receiptOrderKey, setReceiptOrderKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [storeId, setStoreId] = useState('');
  const [channelFilter, setChannelFilter] = useState<'' | OrderChannel>('');
  const [processedById, setProcessedById] = useState('');
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  const dateRange = useMemo(() => orderDateRange(period, customRange), [period, customRange]);
  const customReady = period !== 'custom' || !!(customRange?.from && customRange?.to);

  useEffect(() => {
    const session = getAdminSession();
    if (!session || !isSuperAdmin(session)) {
      router.replace('/admin/orders');
      return;
    }
    setAdmin(session);
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      if (!searchDebounceInit.current) setPage(1);
      searchDebounceInit.current = false;
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const { data: stores = [] } = useQuery({
    queryKey: ['admin-stores-list'],
    queryFn: async () => {
      const res = await adminFetch('/stores');
      return (res as { data?: { id: string; name: string }[] }).data ?? [];
    },
    enabled: Boolean(admin),
  });

  const { data: cashiers = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['admin-cashiers'],
    queryFn: async () => {
      const res = await adminFetch('/admin/cashiers');
      const rows = (res as { data?: { id: string; name: string }[] }).data;
      return Array.isArray(rows) ? rows : [];
    },
    enabled: Boolean(admin),
  });

  const countQueries = useQueries({
    queries: (['TAKEAWAY', 'DELIVERY'] as const).map((mode) => ({
      queryKey: ['admin-all-orders-count', mode, storeId, dateRange.startDate, dateRange.endDate],
      queryFn: async () => {
        const params = new URLSearchParams({
          page: '1',
          limit: '1',
          excludeStatus: activeExcludeStatus(mode),
        });
        params.set('orderMode', mode);
        if (mode === 'DELIVERY') params.set('hideUnassignedReady', 'true');
        if (storeId) params.set('storeId', storeId);
        if (dateRange.startDate) params.set('startDate', dateRange.startDate);
        if (dateRange.endDate) params.set('endDate', dateRange.endDate);
        const res = await adminFetch(`/orders?${params}`);
        return (res as { meta?: { total?: number } }).meta?.total ?? 0;
      },
      enabled: Boolean(admin) && customReady,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    })),
  });

  const tabCounts: Record<OrderTab, number> = {
    pickup: countQueries[0]?.data ?? 0,
    delivery: countQueries[1]?.data ?? 0,
  };

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: [
      'admin-all-orders',
      activeTab,
      archiveView,
      statusFilter,
      channelFilter,
      processedById,
      page,
      debouncedSearch,
      sortDir,
      storeId,
      dateRange.startDate,
      dateRange.endDate,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(ADMIN_TABLE_PAGE_SIZE),
        sortDir,
      });
      if (archiveView === 'delivered') {
        params.set('status', 'DELIVERED');
      } else if (archiveView === 'cancelled') {
        params.set('status', 'CANCELLED');
      } else {
        if (modeFilter) params.set('orderMode', modeFilter);
        if (statusFilter && statusFilter !== DEFAULT_STATUS_FILTER) {
          params.set('status', statusFilter);
        } else if (statusFilter === DEFAULT_STATUS_FILTER && !debouncedSearch) {
          params.set('excludeStatus', activeExcludeStatus(modeFilter));
        }
        if (activeTab === 'delivery') params.set('hideUnassignedReady', 'true');
      }
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (storeId) params.set('storeId', storeId);
      if (channelFilter) params.set('channel', channelFilter);
      if (processedById) params.set('processedById', processedById);
      if (dateRange.startDate) params.set('startDate', dateRange.startDate);
      if (dateRange.endDate) params.set('endDate', dateRange.endDate);
      return adminFetch(`/orders?${params}`);
    },
    enabled: Boolean(admin) && customReady,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  const orders = (data as { data?: AdminOrderRow[] })?.data ?? [];
  const meta = (data as { meta?: { total?: number; pages?: number; limit?: number } })?.meta ?? {};
  const totalPages = Math.max(1, meta.pages ?? 1);
  const totalItems = meta.total ?? 0;
  const pageSize = meta.limit ?? ADMIN_TABLE_PAGE_SIZE;
  const rangeStart = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalItems);
  const pageList = buildPageList(page, totalPages);

  useEffect(() => {
    if (meta.pages == null) return;
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages, meta.pages]);

  function clearSearch() {
    setSearchInput('');
    setDebouncedSearch('');
    setPage(1);
  }

  const hasActiveFilters = Boolean(
    debouncedSearch ||
    storeId ||
    channelFilter ||
    processedById ||
    archiveView ||
    activeTab !== 'pickup' ||
    sortDir !== 'desc',
  );

  function resetFilters() {
    setSearchInput('');
    setDebouncedSearch('');
    setStoreId('');
    setChannelFilter('');
    setProcessedById('');
    setArchiveView(null);
    setActiveTab('pickup');
    setSortDir('desc');
    setPage(1);
  }

  function switchTab(tab: OrderTab) {
    setArchiveView(null);
    setActiveTab(tab);
    setPage(1);
  }

  function viewAllDeliveredOrders() {
    setArchiveView('delivered');
    setPage(1);
  }

  function viewAllCancelledOrders() {
    setArchiveView('cancelled');
    setPage(1);
  }

  function exportCsv() {
    const showRefundColumn = archiveView === 'cancelled';
    const headers = showRefundColumn
      ? 'Order,Ordered Time,Channel,Items,Total (LKR),Payment,Refund Status,Status\n'
      : 'Order,Ordered Time,Channel,Items,Total (LKR),Payment,Status\n';
    const rows = orders
      .map((o) => {
        const items = (o.items ?? []).map((i) => `${i.productName} x${i.quantity}`).join('; ');
        const payment = isOrderPaid({
          paymentStatus: o.paymentStatus,
          paymentMethod: o.paymentMethod as PaymentMethod,
        })
          ? 'Paid'
          : o.paymentStatus === 'FAILED'
            ? 'Failed'
            : 'Unpaid';
        const orderedTime = new Date(o.createdAt).toLocaleString('en-LK');
        const channel = o.channel || 'WEB';
        const base = `${o.orderNumber},${orderedTime},${channel},"${items}",${o.total},${payment}`;
        if (showRefundColumn) {
          return `${base},${formatRefundStatusExport(o)},${statusLabel(o.status, o.orderMode)}`;
        }
        return `${base},${statusLabel(o.status, o.orderMode)}`;
      })
      .join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'all-orders.csv';
    a.click();
  }

  const openRefund = useCallback(
    (refundId: string) => {
      router.push(`/admin/refunds?refundId=${encodeURIComponent(refundId)}`);
    },
    [router],
  );

  const closeOrderDrawer = useCallback(() => {
    setSelectedOrderKey(null);
    setReceiptOrderKey(null);
  }, []);
  const openOrderReceipt = useCallback((orderNumber: string) => setReceiptOrderKey(orderNumber), []);

  if (!admin) {
    return <div className="p-8 text-center text-muted">Loading…</div>;
  }

  return (
    <div className={`all-orders-overview${archiveView === 'cancelled' ? ' all-orders-overview--cancelled' : ''}`}>
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-fg">Order History</h1>
          <p className="text-muted text-sm mt-1">Read-only view across all branches</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DashboardPeriodFilter
            period={period}
            customRange={customRange}
            onPeriodChange={setPeriod}
            onCustomRangeChange={(range) => {
              setCustomRange(range);
              setPage(1);
            }}
            compact
          />
          <button
            type="button"
            onClick={() => refetch()}
            className="btn-outline p-2.5"
            aria-label="Refresh"
          >
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="btn-outline px-3 py-2.5 text-sm flex items-center gap-1.5"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      <AdminOrderDrawer
        orderKey={selectedOrderKey}
        onClose={closeOrderDrawer}
        onViewReceipt={openOrderReceipt}
        readOnly
      />
      <AdminReceiptModal orderKey={receiptOrderKey} onClose={() => setReceiptOrderKey(null)} />

      <div className="orders-table-shell">
        <div className="orders-capsule-tabs-row">
          <div className="orders-capsule-tabs" role="tablist" aria-label="Order categories">
            {ORDER_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = !archiveView && activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => switchTab(tab.id)}
                  className={`orders-capsule-tab${isActive ? ' orders-capsule-tab--active' : ''}`}
                >
                  <span className="orders-capsule-tab__icon" aria-hidden>
                    <Icon size={18} />
                  </span>
                  <span className="orders-capsule-tab__label">{tab.label}</span>
                  <span
                    className="orders-capsule-tab__badge orders-capsule-tab__badge--alert"
                    aria-label={`${tabCounts[tab.id]} active`}
                  >
                    {tabCounts[tab.id]}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="orders-archive-links">
            <button
              type="button"
              onClick={viewAllCancelledOrders}
              className={`orders-delivered-link${archiveView === 'cancelled' ? ' orders-delivered-link--active' : ''}`}
              aria-pressed={archiveView === 'cancelled'}
            >
              <XCircle size={16} aria-hidden />
              Cancelled orders
            </button>
            <button
              type="button"
              onClick={viewAllDeliveredOrders}
              className={`orders-delivered-link${archiveView === 'delivered' ? ' orders-delivered-link--active' : ''}`}
              aria-pressed={archiveView === 'delivered'}
            >
              <PackageCheck size={16} aria-hidden />
              Delivered orders
            </button>
          </div>
        </div>

      <div className="card overflow-hidden">
      <div className="admin-orders-toolbar all-orders-overview__toolbar border-b border-navy-border p-4 sm:p-5">
        <div className={`input-icon-wrap admin-orders-toolbar__search flex-1 min-w-[12rem]${searchInput ? ' input-icon-wrap--end' : ''}`}>
          <Search size={16} className="input-icon" aria-hidden />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search orders..."
            className="search-bar"
          />
          {searchInput && (
            <button
              type="button"
              onClick={clearSearch}
              className="input-action p-1 text-muted hover:text-fg"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="admin-orders-toolbar__branch">
          <SearchableBranchSelect
            stores={stores}
            value={storeId || undefined}
            onChange={(id) => {
              setStoreId(id);
              setPage(1);
            }}
            formatName={shortBranchName}
            placeholder="All branches"
            className="filter-select w-full"
          />
        </div>

        <select
          value={channelFilter}
          onChange={(e) => {
            const v = e.target.value;
            setChannelFilter(v && isOrderChannel(v) ? v : '');
            setPage(1);
          }}
          className="filter-select admin-orders-toolbar__sort"
          aria-label="Filter by channel"
        >
          <option value="">All channels</option>
          <option value="WEB">🌐 Website</option>
          <option value="POS">🧾 POS</option>
          <option value="APP">📱 App</option>
          <option value="WHATSAPP">🟢 WhatsApp</option>
          <option value="TELEGRAM">🔵 Telegram</option>
        </select>

        <select
          value={processedById}
          onChange={(e) => {
            setProcessedById(e.target.value);
            setPage(1);
          }}
          className="filter-select admin-orders-toolbar__sort"
          aria-label="Filter by cashier"
        >
          <option value="">All cashiers</option>
          {cashiers.map((cashier) => (
            <option key={cashier.id} value={cashier.id}>{cashier.name}</option>
          ))}
        </select>

        <select
          value={sortDir}
          onChange={(e) => {
            setSortDir(e.target.value as 'desc' | 'asc');
            setPage(1);
          }}
          className="filter-select admin-orders-toolbar__sort"
          aria-label="Sort by ordered time"
        >
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="btn-outline admin-orders-toolbar__reset text-xs"
          >
            Reset
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted">Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className="p-8 text-center text-muted">
          {debouncedSearch
            ? `No orders match "${debouncedSearch}"`
            : archiveView === 'cancelled'
              ? 'No cancelled orders found'
              : archiveView === 'delivered'
                ? 'No delivered orders found'
                : activeTab === 'delivery'
                  ? 'No in-progress delivery orders'
                  : 'No pickup orders found'}
        </div>
      ) : (
        <div className="p-4 sm:p-5 pt-0">
          <div className="all-orders-overview__grid-head hidden lg:grid">
            <span>Order</span>
            <span>Ordered Time</span>
            <span>Channel</span>
            <span>Items</span>
            <span>Total (LKR)</span>
            <span>Payment</span>
            <span>Processed by</span>
            {archiveView === 'cancelled' && <span>Refund Status</span>}
            <span>Status</span>
            <span>Action</span>
          </div>

          <div className="all-orders-overview__list">
            {orders.map((order) => {
              const isCancelled = order.status === 'CANCELLED';
              const isWhatsApp = order.channel === 'WHATSAPP';

              return (
                <div
                  key={order.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedOrderKey(order.orderNumber)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedOrderKey(order.orderNumber);
                    }
                  }}
                  className={`all-orders-overview__row${isCancelled ? ' all-orders-overview__row--cancelled' : ''}${
                    isWhatsApp ? ' all-orders-overview__row--whatsapp' : ''
                  }`}
                >
                  <span className="admin-table__order-num">{order.orderNumber}</span>

                  <span className="all-orders-overview__ordered-time text-muted text-xs whitespace-nowrap tabular-nums">
                    {new Date(order.createdAt).toLocaleString('en-LK', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>

                  <div className="min-w-0">
                    <OrderChannelBadge channel={order.channel} compact />
                  </div>

                  <div className="all-orders-overview__items min-w-0">
                    <AdminOrderItemsCompact items={order.items} />
                  </div>

                  <span className="admin-table__amount text-xs whitespace-nowrap tabular-nums">
                    {(order.total as number)?.toLocaleString()}
                  </span>

                  <span>
                    <PaymentStatusBadge order={order} />
                  </span>

                  <span className="text-muted text-xs whitespace-nowrap">
                    {order.processedByName || '—'}
                  </span>

                  {archiveView === 'cancelled' && (
                    <div className="all-orders-overview__refund-cell">
                      <span className="all-orders-overview__refund-label lg:hidden text-xs text-muted">Refund</span>
                      <RefundStatusCell order={order} onOpenRefund={openRefund} />
                    </div>
                  )}

                  <AdminOrderStatusReadonly status={order.status} orderMode={order.orderMode} />

                  <span className="all-orders-overview__action" aria-hidden>
                    <ChevronRight size={18} />
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!isLoading && totalItems > 0 && (
        <div className="admin-table-pagination border-t border-navy-border">
          <p className="admin-table-pagination__summary text-xs text-muted">
            Showing{' '}
            <span className="text-fg font-semibold tabular-nums">
              {rangeStart}–{rangeEnd}
            </span>{' '}
            of <span className="text-fg font-semibold tabular-nums">{totalItems}</span> orders
          </p>
          <nav className="admin-table-pagination__nav" aria-label="Orders pagination">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="admin-table-pagination__arrow"
              aria-label="Previous page"
            >
              <ChevronLeft size={20} />
            </button>
            <div className="admin-table-pagination__pages">
              {pageList.map((item, i) =>
                item === 'ellipsis' ? (
                  <span key={`ellipsis-${i}`} className="admin-table-pagination__ellipsis" aria-hidden>
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item)}
                    aria-label={`Page ${item}`}
                    aria-current={item === page ? 'page' : undefined}
                    className={`admin-table-pagination__page${item === page ? ' admin-table-pagination__page--active' : ''}`}
                  >
                    {item}
                  </button>
                ),
              )}
            </div>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="admin-table-pagination__arrow"
              aria-label="Next page"
            >
              <ChevronRight size={20} />
            </button>
          </nav>
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
