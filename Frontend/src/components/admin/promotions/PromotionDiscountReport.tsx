'use client';

import { Fragment, useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { DateRange } from 'react-day-picker';
import { Building2, ChevronDown, Download, Percent, ShoppingBag, Tag, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';

import DashboardKpiCard from '@/components/admin/DashboardKpiCard';
import DashboardPeriodFilter, {
  formatDashboardPeriodLabel,
  orderDateRange,
  type DashboardPeriod,
} from '@/components/admin/DashboardPeriodFilter';
import { branchDisplayName } from '@/components/admin/reports/reportUtils';
import { getApiBaseUrl } from '@/lib/apiBase';
import {
  exportPromoDiscountWorkbook,
  type PromoDiscountBranchLine,
  type PromoDiscountPromoLine,
  type PromoDiscountReportPayload,
} from '@/lib/promoDiscountExport';
import { formatMoney } from '@/lib/receipt';

type BranchLine = PromoDiscountBranchLine;
type PromoLine = PromoDiscountPromoLine;

type ViewTab = 'branch' | 'promo';

function adminFetchReport(endpoint: string): Promise<PromoDiscountReportPayload> {
    return fetch(`${getApiBaseUrl()}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || 'Request failed');
    return (data.data ?? data) as PromoDiscountReportPayload;
  });
}

function ownershipLabel(ownership: string) {
  const value = ownership.toUpperCase();
  if (value === 'BRANCH') return 'Branch';
  if (value === 'SHARED') return 'Shared';
  return 'Platform';
}

function promoLabel(row: Pick<PromoLine, 'promoCode' | 'title'>) {
  return row.title?.trim() || row.promoCode;
}

function formatPct(value: number) {
  return `${(value ?? 0).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

export default function PromotionDiscountReport() {
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [tab, setTab] = useState<ViewTab>('branch');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const range = useMemo(() => orderDateRange(period, customRange), [period, customRange]);
  const ready = Boolean(range.startDate && range.endDate);
  const periodLabel = formatDashboardPeriodLabel(period, customRange, { includeDates: true });

  const queryUrl = ready
    ? `/promos/admin/discount-report?from=${range.startDate}&to=${range.endDate}`
    : '';

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['promo-discount-report', range.startDate, range.endDate],
    queryFn: () => adminFetchReport(queryUrl),
    enabled: ready,
    placeholderData: keepPreviousData,
  });

  const loading = isLoading || (isFetching && !data);
  const totals = data?.totals;
  const empty = !loading && (totals?.orderCount ?? 0) === 0 && (totals?.usageCount ?? 0) === 0;
  const canExport = ready && !loading && !isError && !!data && !empty;

  function toggleExpanded(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleExport() {
    if (!data) return;
    try {
      exportPromoDiscountWorkbook(data, periodLabel);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to export Excel');
    }
  }

  return (
    <section className="promo-discount-report" aria-label="Discount report">
      <div className="promo-discount-report__toolbar">
        <div>
          <h2 className="promo-discount-report__title">Sales and discounts</h2>
          <p className="text-muted text-sm mt-1">
            {periodLabel} · paid orders + unpaid pickup (cash at counter), excluding cancelled
          </p>
        </div>
        <div className="promo-discount-report__toolbar-actions">
          <DashboardPeriodFilter
            period={period}
            customRange={customRange}
            onPeriodChange={setPeriod}
            onCustomRangeChange={(next) => {
              setCustomRange(next);
              if (next?.from && next?.to) setPeriod('custom');
            }}
            compact
            showPresetDates
          />
          <button
            type="button"
            className="btn-outline flex items-center gap-1.5 px-3 py-2 text-sm"
            onClick={handleExport}
            disabled={!canExport}
          >
            <Download size={14} />
            Export Excel
          </button>
        </div>
      </div>

      <div className="promo-discount-report__kpis">
        <DashboardKpiCard
          label="Promotional sales"
          value={formatMoney(totals?.grossSales ?? 0)}
          icon={ShoppingBag}
          tone="blue"
          compact
          loading={loading}
          hint={periodLabel}
        />
        <DashboardKpiCard
          label="Total discount"
          value={formatMoney(totals?.totalDiscount ?? 0)}
          icon={Percent}
          tone="purple"
          compact
          loading={loading}
          hint={`${formatPct(totals?.discountPct ?? 0)} of sales`}
        />
        <DashboardKpiCard
          label="Times used"
          value={(totals?.usageCount ?? 0).toLocaleString('en-LK')}
          icon={Tag}
          tone="navy"
          compact
          loading={loading}
        />
        <DashboardKpiCard
          label="Branch-funded"
          value={formatMoney(totals?.branchShare ?? 0)}
          icon={Building2}
          tone="green"
          compact
          loading={loading}
        />
        <DashboardKpiCard
          label="Platform-funded"
          value={formatMoney(totals?.platformShare ?? 0)}
          icon={Wallet}
          tone="orange"
          compact
          loading={loading}
        />
      </div>

      <div className="promo-discount-report__tabs" role="tablist" aria-label="Discount breakdown">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'branch'}
          className={`promo-discount-report__tab${tab === 'branch' ? ' promo-discount-report__tab--active' : ''}`}
          onClick={() => setTab('branch')}
        >
          By branch
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'promo'}
          className={`promo-discount-report__tab${tab === 'promo' ? ' promo-discount-report__tab--active' : ''}`}
          onClick={() => setTab('promo')}
        >
          By promotion
        </button>
      </div>

      <div className="card promo-discount-report__table-wrap">
        {isError && (
          <p className="px-4 py-8 text-center text-sm text-red-400">
            {error instanceof Error ? error.message : 'Failed to load discount report'}
          </p>
        )}
        {!isError && loading && !data && (
          <p className="px-4 py-8 text-center text-sm text-muted">Loading sales and discounts…</p>
        )}
        {!isError && period === 'custom' && !ready && (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Select a start and end date to view the report.
          </p>
        )}
        {!isError && ready && empty && (
          <p className="px-4 py-8 text-center text-sm text-muted">
            No qualifying orders in this date range.
          </p>
        )}
        {!isError && !empty && tab === 'branch' && (
          <table className="promo-discount-report__table">
            <thead>
              <tr>
                <th>Branch</th>
                <th className="promo-discount-report__num">Orders</th>
                <th className="promo-discount-report__num">Sales</th>
                <th className="promo-discount-report__num">Discount</th>
                <th className="promo-discount-report__num">Discount %</th>
                <th className="promo-discount-report__num">Branch share</th>
                <th className="promo-discount-report__num">Platform share</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byBranch ?? []).map((row) => {
                const key = `branch:${row.storeId}`;
                const open = expanded.has(key);
                const expandable = row.promos.length > 0;
                return (
                  <Fragment key={key}>
                    <tr
                      className={expandable ? 'promo-discount-report__row' : undefined}
                      onClick={expandable ? () => toggleExpanded(key) : undefined}
                    >
                      <td>
                        {expandable && (
                          <span className={`promo-discount-report__chevron${open ? ' promo-discount-report__chevron--open' : ''}`}>
                            <ChevronDown size={14} />
                          </span>
                        )}
                        {branchDisplayName(row.storeName)}
                      </td>
                      <td className="promo-discount-report__num">{row.orderCount.toLocaleString('en-LK')}</td>
                      <td className="promo-discount-report__num">{formatMoney(row.grossSales)}</td>
                      <td className="promo-discount-report__num">{formatMoney(row.totalDiscount)}</td>
                      <td className="promo-discount-report__num">{formatPct(row.discountPct)}</td>
                      <td className="promo-discount-report__num">{formatMoney(row.branchShare)}</td>
                      <td className="promo-discount-report__num">{formatMoney(row.platformShare)}</td>
                    </tr>
                    {open && expandable && (
                      <tr className="promo-discount-report__nested-row">
                        <td colSpan={7}>
                          <table className="promo-discount-report__nested">
                            <thead>
                              <tr>
                                <th>Promotion</th>
                                <th>Owner</th>
                                <th className="promo-discount-report__num">Uses</th>
                                <th className="promo-discount-report__num">Promo sales</th>
                                <th className="promo-discount-report__num">Discount</th>
                                <th className="promo-discount-report__num">Discount %</th>
                                <th className="promo-discount-report__num">Branch</th>
                                <th className="promo-discount-report__num">Platform</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.promos.map((promo) => (
                                <tr key={promo.promoCodeId ?? promo.promoCode}>
                                  <td>
                                    <span className="promo-discount-report__promo-title">{promoLabel(promo)}</span>
                                    <span className="promo-discount-report__code">{promo.promoCode}</span>
                                  </td>
                                  <td>{ownershipLabel(promo.ownership)}</td>
                                  <td className="promo-discount-report__num">{promo.usageCount.toLocaleString('en-LK')}</td>
                                  <td className="promo-discount-report__num">{formatMoney(promo.orderSales)}</td>
                                  <td className="promo-discount-report__num">{formatMoney(promo.totalDiscount)}</td>
                                  <td className="promo-discount-report__num">{formatPct(promo.discountPct)}</td>
                                  <td className="promo-discount-report__num">{formatMoney(promo.branchShare)}</td>
                                  <td className="promo-discount-report__num">{formatMoney(promo.platformShare)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        {!isError && !empty && tab === 'promo' && (
          <table className="promo-discount-report__table">
            <thead>
              <tr>
                <th>Promotion</th>
                <th className="promo-discount-report__num">Uses</th>
                <th className="promo-discount-report__num">Promo sales</th>
                <th className="promo-discount-report__num">Discount</th>
                <th className="promo-discount-report__num">Discount %</th>
                <th className="promo-discount-report__num">Branch share</th>
                <th className="promo-discount-report__num">Platform share</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byPromo ?? []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">
                    Sales in this range had no promotions applied.
                  </td>
                </tr>
              ) : (
                (data?.byPromo ?? []).map((row) => {
                  const key = `promo:${row.promoCodeId ?? row.promoCode}`;
                  const open = expanded.has(key);
                  return (
                    <Fragment key={key}>
                      <tr className="promo-discount-report__row" onClick={() => toggleExpanded(key)}>
                        <td>
                          <span className={`promo-discount-report__chevron${open ? ' promo-discount-report__chevron--open' : ''}`}>
                            <ChevronDown size={14} />
                          </span>
                          <span className="promo-discount-report__promo-title">{promoLabel(row)}</span>
                          <span className="promo-discount-report__code">{row.promoCode}</span>
                        </td>
                        <td className="promo-discount-report__num">{row.usageCount.toLocaleString('en-LK')}</td>
                        <td className="promo-discount-report__num">{formatMoney(row.orderSales)}</td>
                        <td className="promo-discount-report__num">{formatMoney(row.totalDiscount)}</td>
                        <td className="promo-discount-report__num">{formatPct(row.discountPct)}</td>
                        <td className="promo-discount-report__num">{formatMoney(row.branchShare)}</td>
                        <td className="promo-discount-report__num">{formatMoney(row.platformShare)}</td>
                      </tr>
                      {open && (
                        <tr className="promo-discount-report__nested-row">
                          <td colSpan={7}>
                            <table className="promo-discount-report__nested">
                              <thead>
                                <tr>
                                  <th>Branch</th>
                                  <th className="promo-discount-report__num">Uses</th>
                                  <th className="promo-discount-report__num">Promo sales</th>
                                  <th className="promo-discount-report__num">Discount</th>
                                  <th className="promo-discount-report__num">Discount %</th>
                                  <th className="promo-discount-report__num">Branch</th>
                                  <th className="promo-discount-report__num">Platform</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.branches.map((branch) => (
                                  <tr key={branch.storeId}>
                                    <td>{branchDisplayName(branch.storeName)}</td>
                                    <td className="promo-discount-report__num">{branch.usageCount.toLocaleString('en-LK')}</td>
                                    <td className="promo-discount-report__num">{formatMoney(branch.orderSales)}</td>
                                    <td className="promo-discount-report__num">{formatMoney(branch.totalDiscount)}</td>
                                    <td className="promo-discount-report__num">{formatPct(branch.discountPct)}</td>
                                    <td className="promo-discount-report__num">{formatMoney(branch.branchShare)}</td>
                                    <td className="promo-discount-report__num">{formatMoney(branch.platformShare)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
