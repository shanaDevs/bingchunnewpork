'use client';

import Link from 'next/link';
import { useMemo, type ReactNode } from 'react';
import {
  AlertCircle,
  BarChart3,
  Bike,
  ChevronRight,
  Clock3,
  CreditCard,
  CupSoda,
  Monitor,
  ShoppingBag,
  Trophy,
  Truck,
  Undo2,
  Users,
  Wallet,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Area, AreaChart, Cell, Pie, PieChart } from 'recharts';

import { type RevenueChannels } from '@/components/admin/BranchRevenueBreakdownDonut';
import {
  ChartAreaSkeleton,
  ChartBarsSkeleton,
  DashSkel,
  OrderBreakdownSkeleton,
} from '@/components/admin/BranchDashboardSkeleton';
import DonutChartCenterLabel from '@/components/admin/DonutChartCenterLabel';
import PeakHoursBarChart, { type PeakHourPoint } from '@/components/admin/PeakHoursBarChart';
import BranchDiscountsByMonthChart from '@/components/admin/BranchDiscountsByMonthChart';
import BranchRefundByMonthChart from '@/components/admin/BranchRefundByMonthChart';
import RevenueOverviewBarChart from '@/components/admin/RevenueOverviewBarChart';
import SuperAdminOutflowByMethodChart from '@/components/admin/SuperAdminOutflowByMethodChart';
import ProductImage from '@/components/ui/ProductImage';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import { STORE_HOURS_LABEL } from '@/lib/storeHours';
import type { RecentOrderRow } from '@/components/admin/DashboardRecentOrdersTable';

type TopProduct = {
  productName: string;
  quantity: number;
  revenue: number;
  imageUrl?: string | null;
};

type TopCustomer = {
  rank: number;
  name: string;
  phone?: string;
  email?: string;
  orders: number;
  totalSpend: number;
};

type PaymentChannelBreakdown = {
  pickupCashCount: number;
  pickupCardCount: number;
  pickupOnlineCount: number;
  deliveryOnlineCount: number;
};

type AttentionItem = {
  type: string;
  label: string;
  count: number;
  href: string;
};

type RiderStaff = {
  total: number;
  active: number;
  idle: number;
};

type MonthlyPoint = {
  month: string;
  revenue: number;
  orders: number;
  outflow?: number;
};

type ChannelKey = keyof RevenueChannels;

type ChannelDef = {
  key: ChannelKey;
  label: string;
  icon: LucideIcon;
  countKey: keyof PaymentChannelBreakdown;
  color: string;
};

type TableColumn = {
  label: string;
  align?: 'right';
};

const CHANNELS: ChannelDef[] = [
  { key: 'pickupCash', label: 'Pickup Cash', icon: ShoppingBag, countKey: 'pickupCashCount', color: '#1e3a8a' },
  { key: 'pickupCard', label: 'Pickup Card', icon: CreditCard, countKey: 'pickupCardCount', color: '#2563eb' },
  { key: 'pickupOnline', label: 'Pickup Online', icon: Monitor, countKey: 'pickupOnlineCount', color: '#307ef2' },
  { key: 'deliveryCard', label: 'Delivery Online', icon: Truck, countKey: 'deliveryOnlineCount', color: '#93c5fd' },
];

const CHANNEL_BY_KEY = Object.fromEntries(CHANNELS.map((channel) => [channel.key, channel])) as Record<
  ChannelKey,
  ChannelDef
>;

const ORDER_BREAKDOWN_KEYS: ChannelKey[] = [
  'deliveryCard',
  'pickupOnline',
  'pickupCash',
  'pickupCard',
];

const ORDER_PIE_SIZE = 168;
const REFUND_COMPLETED_COLOR = '#64748b';
const TABLE_SKELETON_ROWS = 5;
/** Dashboard preview rows only — full lists live on Sales / Orders pages. */
const DASHBOARD_TABLE_PREVIEW = 5;

const PRODUCT_COLUMNS: TableColumn[] = [
  { label: 'Product' },
  { label: 'Orders', align: 'right' },
  { label: 'Revenue (LKR)', align: 'right' },
];

const CUSTOMER_COLUMNS: TableColumn[] = [
  { label: 'Customer' },
  { label: 'Orders', align: 'right' },
  { label: 'Spend (LKR)', align: 'right' },
];

const RECENT_COLUMNS: TableColumn[] = [
  { label: 'Type' },
  { label: 'Amount (LKR)', align: 'right' },
  { label: 'Status' },
  { label: 'Time', align: 'right' },
];

const orderPieConfig = {
  ...Object.fromEntries(CHANNELS.map((channel) => [channel.key, { label: channel.label, color: channel.color }])),
  refundCompleted: { label: 'Refund Completed', color: REFUND_COMPLETED_COLOR },
} satisfies ChartConfig;

const sparkConfig = {
  revenue: { label: 'Revenue', color: '#307ef2' },
} satisfies ChartConfig;

function hideDeliveryIfPickupOnly<T extends { key: string }>(items: T[], pickupOnly: boolean) {
  return pickupOnly ? items.filter((item) => item.key !== 'deliveryCard') : items;
}

function fmtWallet(cents: number) {
  return formatMoneyAmount(cents / 100);
}

function orderTypeLabel(mode: string) {
  return mode === 'DELIVERY' ? 'Delivery' : 'Pickup';
}

function formatOrderTime(iso: string) {
  return new Date(iso)
    .toLocaleString('en-LK', { hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\s+/g, ' ');
}

function formatOrderCount(count: number | undefined) {
  if (typeof count !== 'number' || Number.isNaN(count)) return '—';
  return `${count.toLocaleString('en-LK')} ${count === 1 ? 'Order' : 'Orders'}`;
}

function resolveStatusBadge(order: RecentOrderRow) {
  if (order.status === 'CANCELLED') {
    return {
      label: 'Cancelled',
      className: 'admin-orders-table__badge admin-orders-table__badge--cancelled',
    };
  }
  if (order.paymentStatus === 'PENDING') {
    return {
      label: 'Pending',
      className: 'admin-orders-table__badge admin-orders-table__badge--pending',
    };
  }
  if (order.status === 'DELIVERED') {
    return {
      label: 'Completed',
      className: 'admin-orders-table__badge admin-orders-table__badge--completed',
    };
  }
  return {
    label: 'Preparing',
    className: 'admin-orders-table__badge admin-orders-table__badge--progress',
  };
}

function ChipCount({ loading, value }: { loading: boolean; value: number }) {
  if (loading) return <DashSkel className="inline-block h-3 w-7 align-middle" />;
  return value.toLocaleString('en-LK');
}

function StatChip({
  href,
  icon: Icon,
  label,
  value,
  extra,
  alert,
}: {
  href?: string;
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  extra?: ReactNode;
  alert?: boolean;
}) {
  const className = alert ? 'branch-dash-chip branch-dash-chip--alert' : 'branch-dash-chip';
  const content = (
    <>
      <Icon size={13} />
      <span>{label}</span>
      <strong>{value}</strong>
      {extra}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }
  return <span className={className}>{content}</span>;
}

function DashEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-muted">{children}</p>;
}

function DashTable({
  columns,
  className,
  wrapClassName,
  children,
}: {
  columns: TableColumn[];
  className?: string;
  wrapClassName?: string;
  children: ReactNode;
}) {
  const table = (
    <table className={className ? `branch-dash-table w-full ${className}` : 'branch-dash-table w-full'}>
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.label} className={column.align === 'right' ? 'text-right' : undefined}>
              {column.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
  return wrapClassName ? <div className={wrapClassName}>{table}</div> : table;
}

function SkelCell({ className, alignRight }: { className: string; alignRight?: boolean }) {
  return (
    <td className={alignRight ? 'text-right' : undefined}>
      <DashSkel className={alignRight ? `ml-auto ${className}` : className} />
    </td>
  );
}

function OrderSliceCount({
  value,
  waiting,
}: {
  value: number | undefined;
  waiting: boolean;
}) {
  if (typeof value === 'number') return formatOrderCount(value);
  if (waiting) return <DashSkel className="ml-1 inline-block h-3 w-12 align-middle" />;
  return '—';
}

function DashCardLink({ href, children }: { href?: string; children?: ReactNode }) {
  if (!href) return null;
  return (
    <Link href={href} className="text-xs font-semibold text-brand hover:underline">
      {children ?? 'View All'}
    </Link>
  );
}

type Props = {
  stats: {
    onlineWalletBalance?: number | null;
    periodRevenue?: number | null;
    periodRefundAmount?: number | null;
    periodPaidCount?: number | null;
    periodOrders?: number | null;
    periodCups?: number | null;
    cancelledOrders?: number | null;
    revenueChannels?: RevenueChannels | null;
    monthlyOverview?: MonthlyPoint[];
    peakHours?: PeakHourPoint[];
    topProducts?: TopProduct[];
    recentOrders?: RecentOrderRow[];
    riderStaffStatus?: RiderStaff | null;
    needsAttention?: AttentionItem[];
  } | null;
  loading: boolean;
  updating?: boolean;
  periodLabel: string;
  pickupOnly: boolean;
  cashierMode: boolean;
  branchAnalytics?: {
    paymentChannelBreakdown?: PaymentChannelBreakdown;
    topCustomers?: TopCustomer[];
    outflowByMethod?: Array<{ key: string; label: string; amount: number }>;
    refundByMonth?: Array<{ month: string; count: number; amountLkr: number }>;
    discountsByMonth?: Array<{ month: string; totalDiscount: number }>;
  } | null;
  branchAnalyticsReady: boolean;
  branchAnalyticsLoading?: boolean;
  refundCompletedCount?: number;
  refundCompletedLoading?: boolean;
};

export default function BranchAdminDashboard({
  stats,
  loading,
  updating = false,
  periodLabel,
  pickupOnly,
  cashierMode,
  branchAnalytics,
  branchAnalyticsReady,
  branchAnalyticsLoading = false,
  refundCompletedCount,
  refundCompletedLoading = false,
}: Props) {
  const channels = stats?.revenueChannels;
  const visibleChannels = hideDeliveryIfPickupOnly(CHANNELS, pickupOnly);
  const orderBreakdownItems = hideDeliveryIfPickupOnly(
    ORDER_BREAKDOWN_KEYS.map((key) => CHANNEL_BY_KEY[key]),
    pickupOnly,
  );
  const channelCounts = branchAnalyticsReady
    ? branchAnalytics?.paymentChannelBreakdown
    : undefined;
  const orderSlices = [
    ...orderBreakdownItems.map((item) => ({
      key: item.key,
      label: item.label,
      value: channelCounts?.[item.countKey],
      fill: item.color,
    })),
    {
      key: 'refundCompleted',
      label: 'Refund Completed',
      value: refundCompletedCount,
      fill: REFUND_COMPLETED_COLOR,
    },
  ];
  const pieData = orderSlices.flatMap((slice) =>
    typeof slice.value === 'number' && slice.value > 0
      ? [{ ...slice, value: slice.value }]
      : [],
  );
  const orderTotal = pieData.reduce((sum, slice) => sum + slice.value, 0);
  const allCountsKnown = orderSlices.every((slice) => typeof slice.value === 'number');
  const waitingBreakdown = loading || branchAnalyticsLoading || refundCompletedLoading;
  const allCustomers = branchAnalyticsReady ? (branchAnalytics?.topCustomers ?? []) : [];
  const showCustomerCard = !cashierMode && (branchAnalyticsLoading || allCustomers.length > 0);
  const allProducts = stats?.topProducts ?? [];
  const allRecentOrders = stats?.recentOrders ?? [];
  const previewProducts = useMemo(
    () => allProducts.slice(0, DASHBOARD_TABLE_PREVIEW),
    [allProducts],
  );
  const previewCustomers = useMemo(
    () => allCustomers.slice(0, DASHBOARD_TABLE_PREVIEW),
    [allCustomers],
  );
  const previewRecentOrders = useMemo(
    () => allRecentOrders.slice(0, DASHBOARD_TABLE_PREVIEW),
    [allRecentOrders],
  );
  const attentionItems = (stats?.needsAttention ?? []).filter(
    (item) => !pickupOnly || !item.href.includes('/admin/delivery'),
  );
  const riderStaff = stats?.riderStaffStatus;
  const showRider = !cashierMode && !pickupOnly;
  const sparkData = useMemo(
    () =>
      (stats?.monthlyOverview ?? []).map((point) => ({
        month: point.month,
        revenue: point.revenue,
      })),
    [stats?.monthlyOverview],
  );
  const hasSpark = sparkData.some((point) => point.revenue > 0);

  return (
    <div
      className={`branch-admin-dashboard space-y-4${updating ? ' branch-admin-dashboard--updating' : ''}`}
      aria-busy={loading || updating}
    >
      <div className="flex flex-wrap items-center gap-2">
        <StatChip
          href="/admin/orders"
          icon={ShoppingBag}
          label="Orders"
          value={<ChipCount loading={loading} value={stats?.periodOrders ?? 0} />}
        />
        <StatChip
          icon={CupSoda}
          label="Cups"
          value={<ChipCount loading={loading} value={stats?.periodCups ?? 0} />}
        />
        <StatChip
          href="/admin/orders"
          icon={XCircle}
          label="Cancelled"
          value={<ChipCount loading={loading} value={stats?.cancelledOrders ?? 0} />}
        />
        {showRider && (
          <StatChip
            href="/admin/delivery?tab=drivers"
            icon={Bike}
            label="Riders"
            value={<ChipCount loading={loading} value={riderStaff?.total ?? 0} />}
            extra={
              loading ? (
                <DashSkel className="inline-block h-3 w-24 align-middle" />
              ) : riderStaff ? (
                <em>
                  {riderStaff.active} active · {riderStaff.idle} idle
                </em>
              ) : null
            }
          />
        )}
        {attentionItems.map((item) => (
          <StatChip
            key={item.type}
            href={item.href}
            icon={AlertCircle}
            label={item.label}
            value={item.count}
            alert
          />
        ))}
      </div>

      <div className="branch-dash-top">
        <Link
          href="/admin/wallet"
          className="branch-dash-wallet group relative overflow-hidden no-underline"
        >
          <Wallet
            aria-hidden
            size={108}
            strokeWidth={1.15}
            className="branch-dash-wallet__deco"
          />
          <div className="branch-dash-wallet__body">
            <span className="branch-dash-wallet__icon" aria-hidden>
              <Wallet size={16} strokeWidth={2.2} />
            </span>
            <p className="branch-dash-wallet__label">
              {loading ? (
                <DashSkel className="branch-dash-skel--on-navy h-4 w-40" />
              ) : (
                'Online Wallet Balance'
              )}
            </p>
            <p className="branch-dash-wallet__amount">
              {loading ? (
                <DashSkel className="branch-dash-skel--on-navy mt-0.5 h-7 w-52 max-w-full" />
              ) : stats?.onlineWalletBalance != null ? (
                fmtWallet(stats.onlineWalletBalance)
              ) : (
                '0.00'
              )}
            </p>
            <p className="branch-dash-wallet__hint">
              {loading ? (
                <DashSkel className="branch-dash-skel--on-navy h-3.5 w-28" />
              ) : (
                'Available balance'
              )}
            </p>
          </div>
          <span className="branch-dash-wallet__go" aria-hidden>
            <ChevronRight size={16} strokeWidth={2.4} />
          </span>
        </Link>

        <div className="card branch-dash-card branch-dash-revenue">
          <div className="branch-dash-revenue__head">
            <div className="branch-dash-revenue__title">
              <span className="branch-dash-revenue__icon" aria-hidden>
                <BarChart3 size={14} strokeWidth={2.3} />
              </span>
              <h2>Total Revenue & Operations</h2>
            </div>
            <span className="branch-dash-revenue__period">{periodLabel}</span>
          </div>

          <div className="branch-dash-revenue__kpi">
            <p className="branch-dash-revenue__amount">
              {loading ? (
                <DashSkel className="h-8 w-48 max-w-full" />
              ) : (
                formatMoneyAmount(stats?.periodRevenue ?? 0)
              )}
            </p>
          </div>

          <div className="branch-dash-revenue__chart" aria-hidden={!hasSpark && !loading}>
            {loading ? (
              <ChartAreaSkeleton height={112} />
            ) : hasSpark ? (
              <ChartContainer
                config={sparkConfig}
                className="aspect-auto h-full w-full [&>.recharts-responsive-container]:h-full"
                initialDimension={{ width: 640, height: 132 }}
              >
                <AreaChart data={sparkData} margin={{ top: 10, right: 12, left: 4, bottom: 2 }}>
                  <defs>
                    <linearGradient id="fillBranchRevenueArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#307ef2" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#307ef2" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <Area
                    dataKey="revenue"
                    type="monotone"
                    fill="url(#fillBranchRevenueArea)"
                    stroke="#307ef2"
                    strokeWidth={2.4}
                    dot={{ r: 3.5, fill: '#307ef2', stroke: '#ffffff', strokeWidth: 2 }}
                    activeDot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ChartContainer>
            ) : (
              <p className="branch-dash-revenue__empty">No trend data for this period</p>
            )}
          </div>

          <div
            className={`branch-dash-revenue__channels ${
              visibleChannels.length + 1 >= 5
                ? 'branch-dash-revenue__channels--five'
                : visibleChannels.length + 1 >= 4
                  ? 'branch-dash-revenue__channels--four'
                  : ''
            }`}
          >
            {visibleChannels.map((channel) => {
              const Icon = channel.icon;
              const count = channelCounts?.[channel.countKey];
              return (
                <div key={channel.key} className="branch-dash-channel">
                  <span className="branch-dash-channel__icon" aria-hidden>
                    <Icon size={15} strokeWidth={2.1} />
                  </span>
                  <div className="branch-dash-channel__copy min-w-0">
                    <p className="branch-dash-channel__label">{channel.label}</p>
                    <p className="branch-dash-channel__amount">
                      {loading ? (
                        <DashSkel className="h-4 w-24" />
                      ) : (
                        formatMoneyAmount(channels?.[channel.key] ?? 0)
                      )}
                    </p>
                    {typeof count === 'number' ? (
                      <p className="branch-dash-channel__count">
                        From {count.toLocaleString('en-LK')} order{count !== 1 ? 's' : ''}
                      </p>
                    ) : branchAnalyticsLoading ? (
                      <DashSkel className="h-3 w-20" />
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div className="branch-dash-channel branch-dash-channel--refund">
              <span className="branch-dash-channel__icon" aria-hidden>
                <Undo2 size={15} strokeWidth={2.1} />
              </span>
              <div className="branch-dash-channel__copy min-w-0">
                <p className="branch-dash-channel__label">Refund Amount</p>
                <p className="branch-dash-channel__amount">
                  {loading ? (
                    <DashSkel className="h-4 w-24" />
                  ) : (
                    formatMoneyAmount(stats?.periodRefundAmount ?? 0)
                  )}
                </p>
                {typeof refundCompletedCount === 'number' ? (
                  <p className="branch-dash-channel__count">
                    From {refundCompletedCount.toLocaleString('en-LK')} refund
                    {refundCompletedCount !== 1 ? 's' : ''}
                  </p>
                ) : refundCompletedLoading ? (
                  <DashSkel className="h-3 w-20" />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="card branch-dash-card flex min-h-[280px] flex-col p-4">
          <div className="mb-2 flex items-center gap-2">
            <Clock3 size={15} className="text-brand" />
            <div>
              <h2 className="text-sm font-semibold text-fg">Peak Hours</h2>
              <p className="text-[11px] text-muted">
                {periodLabel} · {STORE_HOURS_LABEL}
              </p>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {loading ? (
              <ChartBarsSkeleton minHeight={160} />
            ) : (
              <PeakHoursBarChart
                data={stats?.peakHours ?? []}
                compact
                accent="blue"
              />
            )}
          </div>
        </div>

        <div className="card branch-dash-card branch-dash-orders flex min-h-[280px] flex-col p-4">
          <h2 className="mb-1 text-sm font-semibold text-fg">Order Breakdown</h2>
          <p className="mb-2 text-[11px] text-muted">{periodLabel} · order channels</p>
          <div className="branch-dash-orders__body">
            {pieData.length > 0 ? (
              <>
                <ChartContainer
                  config={orderPieConfig}
                  className="mx-auto aspect-square shrink-0"
                  style={{ width: ORDER_PIE_SIZE, height: ORDER_PIE_SIZE }}
                  initialDimension={{ width: ORDER_PIE_SIZE, height: ORDER_PIE_SIZE }}
                >
                  <PieChart>
                    <ChartTooltip
                      cursor={false}
                      content={
                        <ChartTooltipContent
                          hideLabel
                          formatter={(value) => (
                            <span className="font-bold">{formatOrderCount(Number(value))}</span>
                          )}
                        />
                      }
                    />
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="label"
                      innerRadius={48}
                      outerRadius={68}
                      paddingAngle={pieData.length > 1 ? 3 : 0}
                      strokeWidth={0}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.key} fill={entry.fill} />
                      ))}
                      <DonutChartCenterLabel
                        value={orderTotal.toLocaleString('en-LK')}
                        label={orderTotal === 1 ? 'Order' : 'Orders'}
                      />
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <ul className="branch-dash-orders__legend">
                  {orderSlices.map((item) => (
                    <li key={item.key} className="branch-dash-orders__legend-item">
                      <span
                        className="branch-dash-orders__swatch"
                        style={{ backgroundColor: item.fill }}
                        aria-hidden
                      />
                      <p className="branch-dash-orders__label">
                        {item.label}
                        <span className="branch-dash-orders__count">
                          {' '}
                          ·{' '}
                          <OrderSliceCount
                            value={item.value}
                            waiting={
                              item.key === 'refundCompleted'
                                ? refundCompletedLoading
                                : branchAnalyticsLoading
                            }
                          />
                        </span>
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            ) : waitingBreakdown ? (
              <OrderBreakdownSkeleton rows={orderSlices.length} />
            ) : allCountsKnown ? (
              <p className="branch-dash-orders__empty">No orders for this period</p>
            ) : (
              <p className="branch-dash-orders__empty">—</p>
            )}
          </div>
        </div>

        <div className="card branch-dash-card flex min-h-[280px] flex-col p-4 md:col-span-2 xl:col-span-1">
          <div className="mb-1 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-fg">Revenue Overview</h2>
              <p className="text-[11px] text-muted">{periodLabel} · paid orders · outflow</p>
            </div>
            <p className="text-sm font-bold text-fg">
              {loading ? <DashSkel className="h-4 w-24" /> : formatMoney(stats?.periodRevenue ?? 0)}
            </p>
          </div>
          <div className="min-h-0 flex-1">
            <RevenueOverviewBarChart
              data={stats?.monthlyOverview ?? []}
              compact
              showCashflow
              loading={loading}
            />
          </div>
        </div>
      </div>

      {!cashierMode && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="min-h-[380px] min-w-0">
            <SuperAdminOutflowByMethodChart
              data={branchAnalyticsReady ? (branchAnalytics?.outflowByMethod ?? []) : []}
              periodLabel={periodLabel}
              loading={branchAnalyticsLoading}
            />
          </div>
          <div className="min-h-[380px] min-w-0">
            <BranchRefundByMonthChart
              data={branchAnalyticsReady ? (branchAnalytics?.refundByMonth ?? []) : []}
              periodLabel={periodLabel}
              loading={branchAnalyticsLoading}
            />
          </div>
          <div className="min-h-[380px] min-w-0">
            <BranchDiscountsByMonthChart
              data={branchAnalyticsReady ? (branchAnalytics?.discountsByMonth ?? []) : []}
              periodLabel={periodLabel}
              loading={branchAnalyticsLoading}
            />
          </div>
        </div>
      )}

      <div
        className={`grid grid-cols-1 gap-4 md:grid-cols-2 ${
          showCustomerCard ? 'xl:grid-cols-3' : ''
        }`}
      >
        <div className="card branch-dash-card overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-navy-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Trophy size={14} className="text-brand" />
              <h2 className="text-sm font-semibold text-fg">Top Selling Products</h2>
            </div>
            <DashCardLink href={cashierMode ? undefined : '/admin/sales'} />
          </div>
          {loading ? (
            <DashTable columns={PRODUCT_COLUMNS}>
              {Array.from({ length: TABLE_SKELETON_ROWS }, (_, index) => (
                <tr key={`product-skel-${index}`}>
                  <td>
                    <div className="flex min-w-0 items-center gap-2">
                      <DashSkel className="h-8 w-8 shrink-0 rounded-md" />
                      <DashSkel className="h-3.5 w-36 max-w-[70%]" />
                    </div>
                  </td>
                  <SkelCell className="h-3.5 w-8" alignRight />
                  <SkelCell className="h-3.5 w-16" alignRight />
                </tr>
              ))}
            </DashTable>
          ) : allProducts.length === 0 ? (
            <DashEmpty>No product sales in this period</DashEmpty>
          ) : (
            <DashTable columns={PRODUCT_COLUMNS}>
                {previewProducts.map((product, index) => (
                  <tr key={`${product.productName}-${index}`}>
                    <td>
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-md border border-navy-border/60 bg-surface-raised">
                          <ProductImage
                            name={product.productName}
                            imageUrl={product.imageUrl}
                            contain
                            className="h-full w-full object-contain p-0.5"
                          />
                        </div>
                        <span className="truncate font-medium" title={product.productName}>
                          {product.productName}
                        </span>
                      </div>
                    </td>
                    <td className="text-right tabular-nums">{product.quantity.toLocaleString('en-LK')}</td>
                    <td className="text-right tabular-nums">{formatMoneyAmount(product.revenue)}</td>
                  </tr>
                ))}
            </DashTable>
          )}
        </div>

        {showCustomerCard && (
          <div className="card branch-dash-card overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-navy-border px-4 py-3">
              <div className="flex items-center gap-2">
                <Users size={14} className="text-brand" />
                <h2 className="text-sm font-semibold text-fg">Top Customers</h2>
              </div>
              <DashCardLink href="/admin/sales" />
            </div>
            {branchAnalyticsLoading ? (
              <DashTable columns={CUSTOMER_COLUMNS}>
                {Array.from({ length: TABLE_SKELETON_ROWS }, (_, index) => (
                  <tr key={`customer-skel-${index}`}>
                    <td>
                      <DashSkel className="h-3.5 w-28 max-w-[80%]" />
                    </td>
                    <SkelCell className="h-3.5 w-8" alignRight />
                    <SkelCell className="h-3.5 w-16" alignRight />
                  </tr>
                ))}
              </DashTable>
            ) : allCustomers.length === 0 ? (
              <DashEmpty>No customer data in this period</DashEmpty>
            ) : (
              <DashTable columns={CUSTOMER_COLUMNS}>
                  {previewCustomers.map((customer) => (
                    <tr key={`${customer.rank}-${customer.phone ?? customer.name}`}>
                      <td>
                        <div className="min-w-0">
                          <p className="truncate font-medium" title={customer.name}>
                            {customer.name}
                          </p>
                          {customer.phone ? (
                            <p className="truncate text-xs text-muted">{customer.phone}</p>
                          ) : null}
                        </div>
                      </td>
                      <td className="text-right tabular-nums">
                        {customer.orders.toLocaleString('en-LK')}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatMoneyAmount(customer.totalSpend)}
                      </td>
                    </tr>
                  ))}
              </DashTable>
            )}
          </div>
        )}

        <div
          className={`card branch-dash-card overflow-hidden ${
            showCustomerCard ? 'md:col-span-2 xl:col-span-1' : ''
          }`}
        >
          <div className="flex items-center justify-between gap-2 border-b border-navy-border px-4 py-3">
            <h2 className="text-sm font-semibold text-fg">Recent Orders</h2>
            <DashCardLink href="/admin/orders" />
          </div>
          {loading ? (
            <DashTable columns={RECENT_COLUMNS} wrapClassName="overflow-x-auto">
              {Array.from({ length: TABLE_SKELETON_ROWS }, (_, index) => (
                <tr key={`order-skel-${index}`}>
                  <SkelCell className="h-3.5 w-14" />
                  <SkelCell className="h-3.5 w-16" alignRight />
                  <td>
                    <DashSkel className="h-5 w-16 rounded-full" />
                  </td>
                  <SkelCell className="h-3.5 w-12" alignRight />
                </tr>
              ))}
            </DashTable>
          ) : allRecentOrders.length === 0 ? (
            <DashEmpty>No orders in this period</DashEmpty>
          ) : (
            <DashTable columns={RECENT_COLUMNS} wrapClassName="overflow-x-auto">
                {previewRecentOrders.map((order) => {
                  const badge = resolveStatusBadge(order);
                  return (
                    <tr key={order.id}>
                      <td>{orderTypeLabel(order.orderMode)}</td>
                      <td className="text-right tabular-nums">{formatMoneyAmount(order.total)}</td>
                      <td>
                        <span className={badge.className}>{badge.label}</span>
                      </td>
                      <td className="text-right text-muted">{formatOrderTime(order.createdAt)}</td>
                    </tr>
                  );
                })}
            </DashTable>
          )}
        </div>
      </div>
    </div>
  );
}
