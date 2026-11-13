'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw,
  Download,
  Search,
  X,
  ShoppingBag,
  Bike,
  ChevronLeft,
  ChevronRight,
  PackageCheck,
  XCircle,
} from 'lucide-react';
import type { DateRange } from 'react-day-picker';
import DashboardPeriodFilter, {
  formatDashboardPeriodLabel,
  orderDateRange,
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
// import AdminTakeawayQueuePanel from '@/components/admin/AdminTakeawayQueuePanel';
import AdminClassificationFab from '@/components/admin/AdminClassificationFab';
import AdminClassificationModal from '@/components/admin/AdminClassificationModal';
import AdminDeliveryClassificationTable from '@/components/admin/AdminDeliveryClassificationTable';
import AdminOrderDrawer from '@/components/admin/AdminOrderDrawer';
import AdminOrderCancelCountdownBadge from '@/components/admin/AdminOrderCancelCountdownBadge';
import AdminOrderItemsCompact from '@/components/admin/AdminOrderItemsCompact';
import AdminReceiptModal from '@/components/admin/AdminReceiptModal';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAdminSession, isAllBranchView, isCashier, isPickupOnlyBranchAdmin, type AdminSession } from '@/lib/adminAuth';
import { isOrderPaid } from '@/lib/receipt';
import {
  adminBadgeClass,
  ORDER_MODE_BADGE,
  paymentStatusBadgeVariant,
} from '@/lib/adminBadges';
import type { PaymentMethod } from '@/types';
import { ADMIN_TABLE_PAGE_SIZE, buildPageList } from '@/lib/pagination';
import { isOrderChannel, type OrderChannel } from '@/lib/orderChannel';
import { resolveCustomerDisplayName } from '@/lib/customerName';
import { formatDateTime, formatTime, todayDateString } from '@/lib/datetime';
import {
  useAdminNotificationContext,
  type OrderFocusTarget,
} from '@/contexts/AdminNotificationProvider';
import {
  ADMIN_NEW_ORDER_EVENT,
  upsertOptimisticAdminOrder,
  type OptimisticAdminOrderRow,
} from '@/lib/adminOrderSync';
import { adminApiJson } from '@/lib/adminApi';
import { resolveOrderRejectReason } from '@/lib/orderCancel';

const adminFetch = adminApiJson;

type OrderModeFilter = '' | 'TAKEAWAY' | 'DELIVERY';
type OrderTab = 'pickup' | 'delivery';
type ArchiveView = 'delivered' | 'cancelled';

type AdminOrderItem = {
  productName: string;
  quantity: number;
  product?: { imageUrl?: string | null };
};

type AdminOrderRow = Record<string, unknown> & {
  id: string;
  orderNumber: string;
  orderMode: string;
  status: string;
  total: number;
  createdAt: string;
  paymentMethod: string;
  paymentStatus: string;
  convenientFee?: number;
  canCancel?: boolean;
  cancelWindowEndsAt?: string | null;
  cancelWindowExpired?: boolean;
  cancelReason?: string | null;
  cancelledBy?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  user?: { name?: string | null; phone?: string | null } | null;
  refund?: {
    id?: string;
    status?: string;
    cancellationReason?: string | null;
    customReasonText?: string | null;
  } | null;
  processedByName?: string | null;
  processedByAdminId?: string | null;
  statusEvents?: Array<{ status: string; note?: string | null }>;
  items?: AdminOrderItem[];
  queuePosition?: number | null;
  pickupTime?: string | null;
  scheduledPickupAt?: string | null;
  store?: { name?: string };
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

const ALL_STATUSES = ['RECEIVED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'] as const;
const PICKUP_QUEUE_STATUSES = ['RECEIVED', 'PREPARING', 'READY'] as const;
const DELIVERY_QUEUE_STATUSES = ['RECEIVED', 'PREPARING', 'READY'] as const;
const QUEUE_STATUS_TABS = ['RECEIVED', 'PREPARING', 'READY'] as const;
type QueueStatusTab = (typeof QUEUE_STATUS_TABS)[number];
const DEFAULT_PICKUP_STATUS_FILTER = 'RECEIVED';
const DEFAULT_DELIVERY_STATUS_FILTER = 'RECEIVED';
const DEFAULT_PICKUP_SORT_DIR = 'asc' as const;
const DEFAULT_DELIVERY_SORT_DIR = 'asc' as const;
const PICKUP_STATUSES = ['RECEIVED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'] as const;
const DELIVERY_STATUSES = ALL_STATUSES;

const STATUS_LABELS: Record<string, string> = {
  RECEIVED: 'Received',
  PREPARING: 'Preparing',
  READY: 'Ready',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/** Default view — hides completed orders; use status dropdown for Delivered / All */
const DEFAULT_STATUS_FILTER = 'active';
const DELIVERY_ACTIVE_EXCLUDE = 'DELIVERED,OUT_FOR_DELIVERY';

function activeExcludeStatus(mode: OrderModeFilter): string {
  return mode === 'DELIVERY' ? DELIVERY_ACTIVE_EXCLUDE : 'DELIVERED';
}

function isQueueStatusFilter(status: string): status is QueueStatusTab {
  return (QUEUE_STATUS_TABS as readonly string[]).includes(status);
}

function queueStatusesForTab(tab: OrderTab): readonly QueueStatusTab[] {
  return tab === 'pickup' ? PICKUP_QUEUE_STATUSES : DELIVERY_QUEUE_STATUSES;
}

const QUICK_FILTERS: { id: string; label: string; mode: OrderModeFilter; status: string; tab: OrderTab }[] = [
  { id: 'active-pickup', label: 'Active pickup', mode: 'TAKEAWAY', status: DEFAULT_PICKUP_STATUS_FILTER, tab: 'pickup' },
  { id: 'active-delivery', label: 'Active delivery', mode: 'DELIVERY', status: DEFAULT_DELIVERY_STATUS_FILTER, tab: 'delivery' },
  { id: 'delivered-pickup', label: 'Delivered pickup', mode: 'TAKEAWAY', status: 'DELIVERED', tab: 'pickup' },
  { id: 'delivered-delivery', label: 'Delivered delivery', mode: 'DELIVERY', status: 'DELIVERED', tab: 'delivery' },
];

function statusesForMode(mode: OrderModeFilter, tab: OrderTab): readonly string[] {
  if (mode === 'TAKEAWAY') {
    return tab === 'pickup' ? PICKUP_QUEUE_STATUSES : PICKUP_STATUSES;
  }
  if (mode === 'DELIVERY') {
    return tab === 'delivery'
      ? DELIVERY_STATUSES.filter((s) => s !== 'READY')
      : DELIVERY_STATUSES;
  }
  return ALL_STATUSES;
}

function statusLabel(status: string, mode: OrderModeFilter): string {
  if (status === 'DELIVERED' && mode === 'TAKEAWAY') return 'Picked up';
  return STATUS_LABELS[status] ?? status;
}

function ModeBadge({ mode }: { mode: string }) {
  const variant = ORDER_MODE_BADGE[mode] ?? 'neutral';
  return (
    <span className={`uppercase tracking-wide ${adminBadgeClass(variant)}`}>
      {mode === 'DELIVERY' ? 'Delivery' : 'Pick up'}
    </span>
  );
}

function PaymentStatusBadge({ order }: { order: { paymentStatus: string; paymentMethod: string } }) {
  const payment = {
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod as PaymentMethod,
  };
  const paid = isOrderPaid(payment);
  const label = paid ? 'Paid' : order.paymentStatus === 'FAILED' ? 'Failed' : 'Unpaid';
  const variant = paymentStatusBadgeVariant(payment);
  return (
    <span className={adminBadgeClass(variant)}>
      {label}
    </span>
  );
}

function tableColumns(showStore: boolean, tab: OrderTab, archiveView: ArchiveView | null): string[] {
  const cols: string[] = [];
  if (archiveView !== 'cancelled' && (archiveView || tab !== 'pickup')) cols.push('Order #');
  if (tab === 'pickup' && !archiveView) cols.push('Token');
  cols.push('Ordered Time', 'Customer Name', 'Mobile Number');
  if (tab === 'pickup' && !archiveView) cols.push('Pickup Time');
  if (archiveView) cols.push('Mode');
  if (showStore) cols.push('Store');
  cols.push('Items', 'Total (LKR)', 'Payment', 'Processed by');
  if (archiveView === 'cancelled') cols.push('Cancelled By', 'Reject Reason');
  cols.push('Action');
  return cols;
}

function orderCustomerName(order: AdminOrderRow): string {
  return resolveCustomerDisplayName({
    guestName: order.guestName,
    userName: order.user?.name,
    phone: order.guestPhone ?? order.user?.phone,
    fallback: '—',
  });
}

function orderCustomerPhone(order: AdminOrderRow): string {
  return order.guestPhone?.trim() || order.user?.phone?.trim() || '—';
}

function formatCancelReason(order: AdminOrderRow): string {
  return resolveOrderRejectReason({
    status: order.status,
    cancelReason: order.cancelReason,
    cancelledBy: order.cancelledBy,
    cancellationNote: order.statusEvents?.find((e) => e.status === 'CANCELLED')?.note,
    paymentStatus: order.paymentStatus,
    refundCancellationReason: order.refund?.cancellationReason,
    refundCustomReasonText: order.refund?.customReasonText,
  });
}

const CANCELLED_BY_LABELS: Record<string, string> = {
  customer: 'Customer',
  system: 'System',
  'payment-gateway': 'Payment gateway',
};

function formatCancelledBy(order: AdminOrderRow): string {
  const stored = order.cancelledBy?.trim();
  if (stored) {
    return CANCELLED_BY_LABELS[stored.toLowerCase()] ?? stored;
  }
  const note = order.statusEvents?.find((e) => e.status === 'CANCELLED')?.note?.trim() ?? '';
  const fromNote = note.match(/cancelled by[:\s]+([^|.]+)/i)?.[1]?.trim();
  if (fromNote) {
    return CANCELLED_BY_LABELS[fromNote.toLowerCase()] ?? fromNote;
  }
  return '—';
}

function formatOrderedTime(createdAt: string, timeOnly: boolean): string {
  if (timeOnly) {
    return formatTime(createdAt);
  }
  return formatDateTime(createdAt, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPickupTime(order: AdminOrderRow): string {
  const relativeLabel = /^In \d+ minutes?$/;
  if (order.pickupTime && !relativeLabel.test(order.pickupTime) && order.pickupTime !== 'As soon as ready') {
    return order.pickupTime;
  }
  if (order.scheduledPickupAt) {
    return formatTime(order.scheduledPickupAt);
  }
  return '—';
}

function defaultSortDir(_tab: OrderTab, archive: ArchiveView | null): 'asc' | 'desc' {
  return archive ? 'desc' : 'asc';
}

function findOrderRow(orderId?: string | null, orderNumber?: string): HTMLTableRowElement | null {
  if (orderId) {
    const byId = document.querySelector<HTMLTableRowElement>(`[data-order-id="${orderId}"]`);
    if (byId) return byId;
  }
  if (orderNumber) {
    return document.querySelector<HTMLTableRowElement>(`[data-order-number="${orderNumber}"]`);
  }
  return null;
}

function clearRowHighlights(): void {
  document
    .querySelectorAll('.admin-table__row--highlight, .admin-table__row--highlight-pulse')
    .forEach((el) => {
      el.classList.remove('admin-table__row--highlight', 'admin-table__row--highlight-pulse');
    });
}

function applyInstantRowHighlight(row: HTMLTableRowElement): void {
  clearRowHighlights();
  row.classList.add('admin-table__row--highlight', 'admin-table__row--highlight-pulse');
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function scrollToOrderRow(
  highlightKey: string,
  orderId?: string | null,
  orderNumber?: string,
  maxAttempts = 24,
  onFound?: () => void,
): () => void {
  let cancelled = false;

  const tryScroll = (attempt: number) => {
    if (cancelled) return;

    const row = findOrderRow(orderId, orderNumber ?? highlightKey);
    if (row) {
      applyInstantRowHighlight(row);
      onFound?.();
      return;
    }

    if (attempt < maxAttempts) {
      window.setTimeout(() => tryScroll(attempt + 1), 50);
    }
  };

  tryScroll(0);
  return () => {
    cancelled = true;
  };
}

function AdminOrdersContent() {
  const searchParams = useSearchParams();
  const { registerOrderFocusHandler } = useAdminNotificationContext();
  const highlightRef = useRef<HTMLTableRowElement>(null);
  const scrollCleanupRef = useRef<(() => void) | null>(null);
  const lastScrolledHighlightRef = useRef<string | null>(null);
  const searchDebounceInit = useRef(true);
  const [activeTab, setActiveTab] = useState<OrderTab>('pickup');
  const [archiveView, setArchiveView] = useState<ArchiveView | null>(null);
  const [period, setPeriod] = useState<DashboardPeriod>('today');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const modeFilter = archiveView ? '' : tabToMode(activeTab);
  const [statusFilter, setStatusFilter] = useState(DEFAULT_PICKUP_STATUS_FILTER);
  const [channelFilter, setChannelFilter] = useState<'' | OrderChannel>('');
  const [processedById, setProcessedById] = useState('');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [selectedOrderKey, setSelectedOrderKey] = useState<string | null>(null);
  const [receiptOrderKey, setReceiptOrderKey] = useState<string | null>(null);
  const [classificationOpen, setClassificationOpen] = useState(false);
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>(DEFAULT_PICKUP_SORT_DIR);
  const [mounted, setMounted] = useState(false);
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const qc = useQueryClient();
  // All-branch roles see orders from every branch, so they need the store column.
  const showStoreColumn = isAllBranchView(admin);
  const cashierMode = isCashier(admin);
  const showAdminFilters = Boolean(admin) && !cashierMode;
  const pickupOnly = isPickupOnlyBranchAdmin(admin);
  const dateRange = useMemo(() => {
    if (cashierMode) {
      const today = todayDateString();
      return { startDate: today, endDate: today };
    }
    return orderDateRange(period, customRange);
  }, [cashierMode, period, customRange]);
  const customReady = cashierMode || period !== 'custom' || !!(customRange?.from && customRange?.to);
  const periodLabel = formatDashboardPeriodLabel(period, customRange, { includeDates: true });
  const visibleOrderTabs = pickupOnly
    ? ORDER_TABS.filter((tab) => tab.id === 'pickup')
    : ORDER_TABS;

  useEffect(() => {
    setAdmin(getAdminSession());
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!pickupOnly) return;
    if (activeTab === 'delivery') {
      setActiveTab('pickup');
      setStatusFilter(DEFAULT_PICKUP_STATUS_FILTER);
      setSortDir(DEFAULT_PICKUP_SORT_DIR);
    }
  }, [pickupOnly, activeTab]);

  useEffect(() => {
    const search = searchParams.get('search') || '';
    const highlightParam = searchParams.get('id') || '';
    const tab = searchParams.get('tab');

    if (tab === 'pickup' || tab === 'delivery') {
      const nextTab: OrderTab =
        tab === 'delivery' && isPickupOnlyBranchAdmin(getAdminSession()) ? 'pickup' : tab;
      setArchiveView(null);
      setActiveTab(nextTab);
      setSortDir(defaultSortDir(nextTab, null));
      if (nextTab === 'pickup') {
        setStatusFilter(DEFAULT_PICKUP_STATUS_FILTER);
      } else {
        setStatusFilter(DEFAULT_DELIVERY_STATUS_FILTER);
      }
    }

    if (search) {
      setSearchInput(search);
      setAppliedSearch(search);
      setPage(1);
    }

    if (highlightParam) {
      lastScrolledHighlightRef.current = null;
      setHighlightId(highlightParam);
      if (!search) {
        setSearchInput('');
        setAppliedSearch('');
      }
    }
  }, [searchParams]);

  const focusOrderInTable = useCallback(
    (target: OrderFocusTarget) => {
      const tab: OrderTab =
        target.orderMode === 'DELIVERY' && !isPickupOnlyBranchAdmin(getAdminSession())
          ? 'delivery'
          : 'pickup';
      const highlightKey = target.orderId || target.orderNumber;

      scrollCleanupRef.current?.();
      scrollCleanupRef.current = null;

      const existingRow = findOrderRow(target.orderId, target.orderNumber);
      if (existingRow) {
        setHighlightId(highlightKey);
        lastScrolledHighlightRef.current = highlightKey;
        applyInstantRowHighlight(existingRow);
        return;
      }

      lastScrolledHighlightRef.current = null;
      setArchiveView(null);
      setActiveTab(tab);
      setSortDir(defaultSortDir(tab, null));
      setSearchInput('');
      setAppliedSearch('');
      searchDebounceInit.current = true;
      setPage(1);
      if (tab === 'pickup') {
        setStatusFilter(DEFAULT_PICKUP_STATUS_FILTER);
      } else {
        setStatusFilter(DEFAULT_DELIVERY_STATUS_FILTER);
      }
      setHighlightId(highlightKey);
      void qc.refetchQueries({ queryKey: ['admin-orders'] });
      scrollCleanupRef.current = scrollToOrderRow(
        highlightKey,
        target.orderId,
        target.orderNumber,
        24,
        () => {
          lastScrolledHighlightRef.current = highlightKey;
        },
      );
    },
    [qc],
  );

  useEffect(() => {
    return () => {
      scrollCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    return registerOrderFocusHandler(focusOrderInTable);
  }, [focusOrderInTable, registerOrderFocusHandler]);

  useEffect(() => {
    const onNewOrder = (event: Event) => {
      const order = (event as CustomEvent<OptimisticAdminOrderRow>).detail;
      if (!order) return;

      upsertOptimisticAdminOrder(qc, order);
      void qc.refetchQueries({ queryKey: ['admin-orders'] });
      void qc.refetchQueries({ queryKey: ['admin-orders-queue-counts'] });
    };
    window.addEventListener(ADMIN_NEW_ORDER_EVENT, onNewOrder);
    return () => window.removeEventListener(ADMIN_NEW_ORDER_EVENT, onNewOrder);
  }, [qc]);

  useEffect(() => {
    if (activeTab !== 'pickup' || archiveView) return;
    const timer = window.setTimeout(() => {
      setAppliedSearch(searchInput.trim());
      if (!searchDebounceInit.current) {
        setPage(1);
      }
      searchDebounceInit.current = false;
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput, activeTab, archiveView]);

  const queueStatuses = queueStatusesForTab(activeTab);
  const showQueueStatusTabs = !archiveView && isQueueStatusFilter(statusFilter);

  type QueueCountsPayload = {
    tabs: { pickup: number; delivery: number };
    status: Record<QueueStatusTab, number>;
  };

  /** Single aggregate counts call — socket/new-order invalidates; HTTP is a slow backup. */
  const { data: queueCounts } = useQuery({
    queryKey: [
      'admin-orders-queue-counts',
      activeTab,
      dateRange.startDate,
      dateRange.endDate,
      channelFilter,
      processedById,
    ],
    queryFn: async (): Promise<QueueCountsPayload> => {
      const params = new URLSearchParams({ queue: activeTab });
      if (dateRange.startDate) params.set('startDate', dateRange.startDate);
      if (dateRange.endDate) params.set('endDate', dateRange.endDate);
      if (channelFilter) params.set('channel', channelFilter);
      if (processedById) params.set('processedById', processedById);
      const res = await adminFetch(`/orders/queue-counts?${params}`);
      const payload = (res as { data?: QueueCountsPayload }).data;
      return (
        payload ?? {
          tabs: { pickup: 0, delivery: 0 },
          status: { RECEIVED: 0, PREPARING: 0, READY: 0 },
        }
      );
    },
    enabled: mounted && customReady,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const tabCounts: Record<OrderTab, number> = {
    pickup: queueCounts?.tabs.pickup ?? 0,
    delivery: pickupOnly ? 0 : (queueCounts?.tabs.delivery ?? 0),
  };

  const statusCounts: Record<QueueStatusTab, number> = {
    RECEIVED: queueCounts?.status.RECEIVED ?? 0,
    PREPARING: queueCounts?.status.PREPARING ?? 0,
    READY: queueCounts?.status.READY ?? 0,
  };

  const { data: cashiers = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['admin-cashiers'],
    queryFn: async () => {
      const res = await adminFetch('/admin/cashiers');
      const rows = (res as { data?: { id: string; name: string }[] }).data;
      return Array.isArray(rows) ? rows : [];
    },
    enabled: mounted,
  });

  const { data, isLoading, refetch } = useQuery({
    queryKey: [
      'admin-orders',
      activeTab,
      archiveView,
      dateRange.startDate,
      dateRange.endDate,
      statusFilter,
      channelFilter,
      processedById,
      page,
      appliedSearch,
      sortDir,
    ],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), limit: String(ADMIN_TABLE_PAGE_SIZE) });
      const pickupQueueView = activeTab === 'pickup' && !archiveView;
      const deliveryQueueView = activeTab === 'delivery' && !archiveView;
      if (pickupQueueView) {
        params.set('sortBy', 'pickup');
        params.set('sortDir', sortDir);
        params.set('status', statusFilter);
        params.set('orderMode', 'TAKEAWAY');
        params.set('fulfillmentQueue', 'pickup');
        if (appliedSearch) {
          params.set('searchBy', 'token');
          params.set('search', appliedSearch);
        }
      } else if (deliveryQueueView) {
        params.set('sortDir', sortDir);
        params.set('status', statusFilter);
        params.set('orderMode', 'DELIVERY');
        params.set('fulfillmentQueue', 'delivery');
        if (appliedSearch) params.set('search', appliedSearch);
      } else {
        params.set('sortDir', sortDir);
      }
      if (archiveView === 'delivered') {
        params.set('status', 'DELIVERED');
      } else if (archiveView === 'cancelled') {
        params.set('status', 'CANCELLED');
      } else {
        if (modeFilter) params.set('orderMode', modeFilter);
        if (statusFilter && statusFilter !== DEFAULT_STATUS_FILTER) {
          params.set('status', statusFilter);
        } else if (statusFilter === DEFAULT_STATUS_FILTER && !appliedSearch) {
          params.set('excludeStatus', activeExcludeStatus(modeFilter));
        }
      }
      if (dateRange.startDate) params.set('startDate', dateRange.startDate);
      if (dateRange.endDate) params.set('endDate', dateRange.endDate);
      if (channelFilter) params.set('channel', channelFilter);
      if (processedById) params.set('processedById', processedById);
      if (appliedSearch && !pickupQueueView && !deliveryQueueView) params.set('search', appliedSearch);
      return adminFetch(`/orders?${params}`);
    },
    enabled: mounted && customReady,
    placeholderData: keepPreviousData,
    // Socket + new-order event refresh the board; HTTP backup every 60s.
    refetchInterval: appliedSearch ? false : 60_000,
    refetchIntervalInBackground: false,
  });

  const orders = (data as { data?: unknown[] })?.data || [];
  const meta = (data as { meta?: { total?: number; pages?: number; page?: number; limit?: number } })?.meta || {};
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

  useEffect(() => {
    if (orders.length === 0 || !highlightId) return;

    const row = findOrderRow(highlightId, highlightId);
    if (row) {
      if (lastScrolledHighlightRef.current !== highlightId) {
        applyInstantRowHighlight(row);
        highlightRef.current = row;
        lastScrolledHighlightRef.current = highlightId;
        scrollCleanupRef.current?.();
        scrollCleanupRef.current = null;
      }
      return;
    }

    if (lastScrolledHighlightRef.current === highlightId) return;

    scrollCleanupRef.current?.();
    scrollCleanupRef.current = scrollToOrderRow(highlightId, highlightId, highlightId);
  }, [highlightId, orders]);

  useEffect(() => {
    if (!appliedSearch || orders.length === 0 || highlightId) return;
    highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [appliedSearch, highlightId, orders]);

  const hasActiveFilters = Boolean(
    appliedSearch ||
    archiveView ||
    activeTab === 'delivery' ||
    period !== 'today' ||
    customRange ||
    (activeTab === 'pickup' && !archiveView && statusFilter !== DEFAULT_PICKUP_STATUS_FILTER) ||
    sortDir !== defaultSortDir(activeTab, archiveView) ||
    channelFilter ||
    processedById
  );

  function activeQuickFilterId(): string {
    if (archiveView) return 'custom';
    const match = QUICK_FILTERS.find(
      (f) => f.tab === activeTab && f.mode === modeFilter && f.status === statusFilter && !appliedSearch
    );
    return match?.id ?? 'custom';
  }

  function applyQuickFilter(filter: (typeof QUICK_FILTERS)[number]) {
    setArchiveView(null);
    setActiveTab(filter.tab);
    setStatusFilter(filter.status);
    setSortDir(defaultSortDir(filter.tab, null));
    setPage(1);
  }

  function switchTab(tab: OrderTab) {
    if (pickupOnly && tab === 'delivery') return;
    setArchiveView(null);
    setActiveTab(tab);
    setSortDir(defaultSortDir(tab, null));
    setSearchInput('');
    setAppliedSearch('');
    searchDebounceInit.current = true;
    if (tab === 'pickup') {
      if (!(PICKUP_QUEUE_STATUSES as readonly string[]).includes(statusFilter)) {
        setStatusFilter(DEFAULT_PICKUP_STATUS_FILTER);
      }
    } else if (
      !(DELIVERY_QUEUE_STATUSES as readonly string[]).includes(statusFilter) ||
      statusFilter === 'OUT_FOR_DELIVERY' ||
      statusFilter === 'DELIVERED' ||
      statusFilter === DEFAULT_STATUS_FILTER
    ) {
      setStatusFilter(DEFAULT_DELIVERY_STATUS_FILTER);
    }
    setPage(1);
  }

  function viewAllDeliveredOrders() {
    setArchiveView('delivered');
    setStatusFilter('DELIVERED');
    setSearchInput('');
    setAppliedSearch('');
    setPage(1);
    setHighlightId(null);
  }

  function viewAllCancelledOrders() {
    setArchiveView('cancelled');
    setStatusFilter('CANCELLED');
    setSearchInput('');
    setAppliedSearch('');
    setPage(1);
    setHighlightId(null);
  }

  function resetFilters() {
    setSearchInput('');
    setAppliedSearch('');
    setArchiveView(null);
    setPeriod('today');
    setCustomRange(undefined);
    setActiveTab('pickup');
    setStatusFilter(DEFAULT_PICKUP_STATUS_FILTER);
    setSortDir(DEFAULT_PICKUP_SORT_DIR);
    setChannelFilter('');
    setProcessedById('');
    setHighlightId(null);
    setPage(1);
    searchDebounceInit.current = true;
  }

  function deliveryLocation(order: {
    orderMode: string;
    deliveryAddressLine?: string | null;
    deliveryLat?: number | null;
    deliveryLng?: number | null;
    address?: { addressLine: string; lat?: number | null; lng?: number | null } | null;
  }) {
    const line = order.deliveryAddressLine || order.address?.addressLine;
    const lat = order.deliveryLat ?? order.address?.lat;
    const lng = order.deliveryLng ?? order.address?.lng;
    return { line, lat, lng };
  }

  function exportCsv() {
    const headers = showStoreColumn
      ? 'Order Number,Mode,Store,Delivery Location,Total,Status,Date\n'
      : 'Order Number,Mode,Delivery Location,Total,Status,Date\n';
    const rows = (orders as Array<Record<string, unknown>>).map((o) => {
      const loc = deliveryLocation(o as Parameters<typeof deliveryLocation>[0]);
      const store = o.store as { name?: string } | undefined;
      const mode = (o.orderMode as string) === 'DELIVERY' ? 'Delivery' : 'Pick up';
      const base = `${o.orderNumber},${mode}`;
      const storePart = showStoreColumn ? `,${store?.name}` : '';
      return `${base}${storePart},"${loc.line || ''}",${o.total},${o.status},${new Date(o.createdAt as string).toLocaleDateString()}`;
    }).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'orders.csv'; a.click();
  }

  function runDeliverySearch() {
    setAppliedSearch(searchInput.trim());
    setPage(1);
  }

  function clearSearch() {
    setSearchInput('');
    setAppliedSearch('');
    setHighlightId(null);
    setPage(1);
  }

  const closeOrderDrawer = useCallback(() => {
    setSelectedOrderKey(null);
    setReceiptOrderKey(null);
  }, []);
  const openOrderReceipt = useCallback((orderNumber: string) => setReceiptOrderKey(orderNumber), []);
  const refreshOrders = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['admin-orders'] });
  }, [qc]);

  return (
    <div>
      {showAdminFilters && (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-fg">Orders</h1>
            <p className="text-muted text-sm mt-0.5">
              {archiveView === 'delivered'
                ? `${meta.total || 0} complete orders · ${periodLabel}`
                : archiveView === 'cancelled'
                  ? `${meta.total || 0} cancelled orders · ${periodLabel}`
                  : activeTab === 'pickup'
                    ? `${meta.total || 0} ${statusLabel(statusFilter, 'TAKEAWAY').toLowerCase()} pickup orders · ${periodLabel}`
                    : activeTab === 'delivery'
                      ? `${meta.total || 0} ${statusLabel(statusFilter, 'DELIVERY').toLowerCase()} delivery orders · ${periodLabel}`
                      : `${meta.total || 0} orders in view`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <DashboardPeriodFilter
              period={period}
              customRange={customRange}
              onPeriodChange={(next) => {
                setPeriod(next);
                setPage(1);
              }}
              onCustomRangeChange={(range) => {
                setCustomRange(range);
                if (range?.from && range?.to) setPeriod('custom');
                setPage(1);
              }}
              compact
              showPresetDates
            />
            <button onClick={() => refetch()} className="btn-outline p-2.5" type="button" aria-label="Refresh orders">
              <RefreshCw size={15} />
            </button>
            <button onClick={exportCsv} className="btn-outline px-3 py-2.5 text-sm flex items-center gap-1.5" type="button">
              <Download size={14} /> Export
            </button>
          </div>
        </div>
      )}

      {/* Takeaway pickup queue — hidden for now
      <AdminTakeawayQueuePanel adminFetch={adminFetch} />
      */}

      <AdminOrderDrawer
        orderKey={selectedOrderKey}
        onClose={closeOrderDrawer}
        onViewReceipt={openOrderReceipt}
        onComplete={refreshOrders}
        asModal
      />
      <AdminReceiptModal orderKey={receiptOrderKey} onClose={() => setReceiptOrderKey(null)} />

      <div className="orders-table-shell">
        <div className="orders-capsule-tabs-row">
          <div className="orders-capsule-tabs" role="tablist" aria-label="Order categories">
            {visibleOrderTabs.map((tab) => {
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
              Complete orders
            </button>
          </div>
        </div>

      <div className="card overflow-hidden">
        <div className="admin-orders-toolbar px-4 py-2 sm:px-5 sm:py-2.5 border-b border-navy-border">
          {showQueueStatusTabs && (
            <Tabs
              value={statusFilter}
              onValueChange={(value) => {
                if (!isQueueStatusFilter(value)) return;
                setStatusFilter(value);
                setPage(1);
              }}
              className="admin-orders-toolbar__status-tabs"
            >
              <TabsList
                variant="default"
                className="admin-orders-toolbar__status-list !w-full"
                aria-label="Order status"
              >
                {queueStatuses.map((status) => (
                  <TabsTrigger
                    key={status}
                    value={status}
                    className={`admin-orders-toolbar__status-trigger admin-orders-toolbar__status-trigger--${status.toLowerCase()}`}
                  >
                    <span>{statusLabel(status, modeFilter)}</span>
                    <span
                      className={`admin-orders-toolbar__status-count ${
                        status === 'RECEIVED' && statusCounts.RECEIVED > 0
                          ? 'admin-orders-toolbar__status-count--blink'
                          : ''
                      }`}
                    >
                      {statusCounts[status]}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {!archiveView && (
            <div className={showAdminFilters ? 'admin-orders-toolbar__search-group' : 'admin-orders-toolbar__end admin-orders-toolbar__search-group'}>
              <div className={`input-icon-wrap admin-orders-toolbar__search${searchInput ? ' input-icon-wrap--end' : ''}`}>
                <Search size={16} className="input-icon" aria-hidden />
                <input
                  type="text"
                  inputMode={activeTab === 'pickup' ? 'numeric' : 'search'}
                  value={searchInput}
                  onChange={(e) => {
                    const value = activeTab === 'pickup'
                      ? e.target.value.replace(/\D/g, '')
                      : e.target.value;
                    setSearchInput(value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && activeTab === 'delivery') {
                      e.preventDefault();
                      runDeliverySearch();
                    }
                  }}
                  placeholder={
                    activeTab === 'pickup'
                      ? 'Search by token...'
                      : 'Search by order number...'
                  }
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
              {activeTab === 'delivery' && (
                <button
                  type="button"
                  onClick={runDeliverySearch}
                  className="btn-primary admin-orders-toolbar__find shrink-0"
                >
                  Find
                </button>
              )}
            </div>
          )}

          {showAdminFilters ? (
            <div className="admin-orders-toolbar__actions">
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
              {archiveView && (
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
              )}
              <select
                value={sortDir}
                onChange={(e) => { setSortDir(e.target.value as 'desc' | 'asc'); setPage(1); }}
                className="filter-select admin-orders-toolbar__sort"
                aria-label="Sort by ordered time"
              >
                <option value="desc">Newest first</option>
                <option value="asc">Oldest first</option>
              </select>
              {!archiveView && (
                <select
                  value={
                    activeQuickFilterId() === 'custom'
                      ? (activeTab === 'pickup' ? 'active-pickup' : 'active-delivery')
                      : activeQuickFilterId()
                  }
                  onChange={(e) => {
                    const f = QUICK_FILTERS.find((q) => q.id === e.target.value);
                    if (f) applyQuickFilter(f);
                  }}
                  className="filter-select admin-orders-toolbar__quick"
                  aria-label="Quick filter"
                >
                  {QUICK_FILTERS.filter((f) => f.tab === activeTab).map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </select>
              )}
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
          ) : archiveView ? (
            <div className="admin-orders-toolbar__end">
              <div className="admin-orders-toolbar__actions">
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
              </div>
            </div>
          ) : null}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-muted">Loading orders...</div>
        ) : !customReady ? (
          <div className="p-8 text-center text-muted">Select a date range to view order history.</div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-muted">
            {appliedSearch
              ? activeTab === 'pickup' && !archiveView
                ? `No orders match token "${appliedSearch}"`
                : activeTab === 'delivery' && !archiveView
                  ? `No orders match order number "${appliedSearch}"`
                : `No orders match "${appliedSearch}"`
              : archiveView === 'cancelled' || statusFilter === 'CANCELLED'
                ? 'No cancelled orders found'
                : archiveView === 'delivered' || statusFilter === 'DELIVERED'
                  ? 'No complete orders found'
                : activeTab === 'delivery'
                  ? `No ${statusLabel(statusFilter, modeFilter).toLowerCase()} delivery orders found`
                  : activeTab === 'pickup'
                    ? `No ${statusLabel(statusFilter, modeFilter).toLowerCase()} pickup orders found`
                    : statusFilter === DEFAULT_STATUS_FILTER
                      ? 'No active orders'
                      : 'No orders found'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-table w-full text-sm">
              <thead>
                <tr>
                  {tableColumns(showStoreColumn, activeTab, archiveView).map((h) => (
                    <th key={h} className="px-4 py-3 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(orders as AdminOrderRow[]).map((order, index) => {
                  const isCancelled = order.status === 'CANCELLED';
                  const isHighlight =
                    !isCancelled &&
                    ((highlightId &&
                      (order.id === highlightId || order.orderNumber === highlightId)) ||
                      (appliedSearch && index === 0 && (orders as unknown[]).length === 1));
                  const pickupQueueRow = activeTab === 'pickup' && !archiveView;
                  const queueStatusRow = pickupQueueRow || (activeTab === 'delivery' && !archiveView);

                  return (
                  <tr
                    key={order.id}
                    id={`order-row-${order.id}`}
                    data-order-id={order.id}
                    data-order-number={order.orderNumber}
                    ref={isHighlight ? highlightRef : undefined}
                    onClick={() => setSelectedOrderKey(order.orderNumber)}
                    className={`admin-order-row cursor-pointer ${
                      isCancelled ? 'admin-order-row--cancelled' : ''
                    } ${
                      isHighlight ? 'admin-table__row--highlight admin-table__row--highlight-pulse' : ''
                    }`}
                  >
                    {!pickupQueueRow && archiveView !== 'cancelled' && (
                      <td className="px-4 py-3 align-top">
                        <span className="admin-table__order-num">
                          {order.orderNumber}
                        </span>
                      </td>
                    )}
                    {pickupQueueRow && (
                      <td className="px-4 py-3 align-top">
                        {order.queuePosition != null ? (
                          <span className="pickup-token-badge" title="Pickup queue token">
                            {order.queuePosition}
                          </span>
                        ) : (
                          <span className="text-muted text-xs">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-muted text-xs align-top whitespace-nowrap tabular-nums">
                      <div>{formatOrderedTime(order.createdAt, (cashierMode || period === 'today') && queueStatusRow)}</div>
                      {!archiveView && order.status === 'RECEIVED' && (
                        <AdminOrderCancelCountdownBadge order={order} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm align-top whitespace-nowrap">
                      {orderCustomerName(order)}
                    </td>
                    <td className="px-4 py-3 text-muted text-xs align-top whitespace-nowrap tabular-nums">
                      {orderCustomerPhone(order)}
                    </td>
                    {pickupQueueRow && (
                      <td className="px-4 py-3 text-muted text-xs align-top whitespace-nowrap tabular-nums">
                        {formatPickupTime(order)}
                      </td>
                    )}
                    {archiveView && (
                      <td className="px-4 py-3 align-top">
                        <ModeBadge mode={order.orderMode} />
                      </td>
                    )}
                    {showStoreColumn && (
                      <td className="px-4 py-3 text-muted text-xs align-top">{order.store?.name}</td>
                    )}
                    <td className="px-4 py-3 align-top min-w-[11rem]">
                      <AdminOrderItemsCompact items={order.items} />
                    </td>
                    <td className="px-4 py-3 admin-table__amount text-xs align-top whitespace-nowrap tabular-nums">
                      {(order.total as number)?.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <PaymentStatusBadge order={order} />
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      <span className="text-muted text-xs">{order.processedByName || '—'}</span>
                    </td>
                    {archiveView === 'cancelled' && (
                      <>
                        <td className="px-4 py-3 align-top whitespace-nowrap">
                          <span className="text-muted text-xs">{formatCancelledBy(order)}</span>
                        </td>
                        <td className="px-4 py-3 align-top min-w-[10rem] max-w-[16rem]">
                          <span className="text-muted text-xs leading-snug">{formatCancelReason(order)}</span>
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3 align-top">
                      <span className="all-orders-overview__action" aria-hidden>
                        <ChevronRight size={18} />
                      </span>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading && totalItems > 0 && (
          <div className="admin-table-pagination">
            <p className="admin-table-pagination__summary text-xs text-muted">
              Showing <span className="text-fg font-semibold tabular-nums">{rangeStart}–{rangeEnd}</span> of{' '}
              <span className="text-fg font-semibold tabular-nums">{totalItems}</span> orders
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

      <AdminDeliveryClassificationTable
        visible={!pickupOnly && activeTab === 'delivery' && !archiveView}
        adminFetch={adminFetch}
      />

      <AdminClassificationFab
        visible={!pickupOnly && activeTab === 'delivery' && !archiveView}
        onOpen={() => setClassificationOpen(true)}
        adminFetch={adminFetch}
      />
      <AdminClassificationModal
        open={!pickupOnly && classificationOpen}
        onClose={() => setClassificationOpen(false)}
        adminFetch={adminFetch}
      />
    </div>
  );
}

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted">Loading orders...</div>}>
      <AdminOrdersContent />
    </Suspense>
  );
}
