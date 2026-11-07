'use client';

import React, { useMemo, useState } from 'react';
import Image from 'next/image';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Printer, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useReportStores } from '@/components/admin/reports/ReportBranchFilter';
import {
  adminFetch,
  branchDisplayName,
  formatDateShort,
  formatLkr,
  formatReportPeriodFromDates,
} from '@/components/admin/reports/reportUtils';
import { formatPrintMoney } from '@/components/admin/AdminPrintReport';
import PayoutSettlementStatement, {
  settlementStatementToPrintHtml,
  type PayoutDetail,
} from '@/components/admin/reports/PayoutSettlementStatement';
import { escapeHtml } from '@/lib/escapeHtml';

export type WalletLedgerPreviewRow = {
  date: string;
  referenceId: string;
  transactionType: string;
  branchName: string;
  debit: number;
  credit: number;
  orderCount: number | null;
  runningBalance: number;
  transactionId?: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  rows: WalletLedgerPreviewRow[];
  storeId: string;
  storeName?: string;
  totalInflow: number;
  totalOutflow: number;
  closingBalance: number;
  broughtForward?: number;
  broughtForwardDate?: string;
  from: string;
  to: string;
};

function formatTypeLabel(row: WalletLedgerPreviewRow) {
  if (row.orderCount != null && row.orderCount > 0) {
    return `${row.transactionType} (${row.orderCount})`;
  }
  return row.transactionType;
}

function formatMoney(amount: number) {
  return formatLkr(amount);
}

function LedgerFooterTotal({
  label,
  amount,
  tone,
  showDashWhenZero = false,
}: {
  label: string;
  amount: number;
  tone: 'debit' | 'credit' | 'balance';
  showDashWhenZero?: boolean;
}) {
  const toneClass = {
    debit: 'text-rose-900',
    credit: 'text-emerald-900',
    balance: 'text-blue-900',
  }[tone];
  const showAmount = !showDashWhenZero || amount > 0;

  return (
    <div className="w-full min-w-[6rem] text-right">
      <div className="text-xs font-bold uppercase tracking-wide text-slate-900">{label}</div>
      {showAmount ? (
        <div className={`mt-1 text-lg font-extrabold whitespace-nowrap ${toneClass}`}>
          <span className="text-[10px] font-bold align-baseline text-slate-600">LKR </span>
          {formatLkr(amount)}
        </div>
      ) : (
        <div className="mt-1 text-lg font-extrabold text-slate-400">—</div>
      )}
    </div>
  );
}

function LedgerBfAmount({ amount }: { amount: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 font-extrabold text-blue-800">
      <span className="text-[10px] font-bold leading-none opacity-80">LKR</span>
      <span className="text-base leading-none">{formatLkr(amount)}</span>
    </span>
  );
}

const LEDGER_TABLE_COLGROUP = (
  <colgroup>
    <col style={{ width: '9%' }} />
    <col style={{ width: '14%' }} />
    <col style={{ width: '20%' }} />
    <col style={{ width: '19%' }} />
    <col style={{ width: '19%' }} />
    <col style={{ width: '19%' }} />
  </colgroup>
);

const LEDGER_TABLE_COLGROUP_HTML = `
  <colgroup>
    <col style="width:9%" />
    <col style="width:14%" />
    <col style="width:20%" />
    <col style="width:19%" />
    <col style="width:19%" />
    <col style="width:19%" />
  </colgroup>
`;

function BranchTable({
  rows,
  groupByBranch,
  showBroughtForward,
  broughtForwardDate,
  broughtForward,
  showTotals,
  totalOutflow,
  totalInflow,
  closingBalance,
}: {
  rows: WalletLedgerPreviewRow[];
  groupByBranch?: boolean;
  showBroughtForward?: boolean;
  broughtForwardDate?: string;
  broughtForward?: number;
  showTotals?: boolean;
  totalOutflow?: number;
  totalInflow?: number;
  closingBalance?: number;
}) {
  const grouped = useMemo(() => {
    if (!groupByBranch) return [{ branchName: '', rows }];
    const map = new Map<string, WalletLedgerPreviewRow[]>();
    for (const row of rows) {
      const key = row.branchName || 'Unknown Branch';
      const list = map.get(key);
      if (list) list.push(row);
      else map.set(key, [row]);
    }
    return Array.from(map.entries()).map(([branchName, branchRows]) => ({
      branchName,
      rows: branchRows,
    }));
  }, [rows, groupByBranch]);

  return (
    <div className="wallet-ledger-preview__table-wrap overflow-visible rounded-xl border border-slate-200">
      <table className="w-full border-collapse text-[11px] table-fixed">
        {LEDGER_TABLE_COLGROUP}
        <thead>
          <tr style={{ background: '#1e293b' }}>
            <th
              className="px-3 py-2.5 text-left font-semibold uppercase tracking-wide"
              style={{ color: '#ffffff', background: '#1e293b' }}
            >
              Date
            </th>
            <th
              className="px-3 py-2.5 text-left font-semibold uppercase tracking-wide"
              style={{ color: '#ffffff', background: '#1e293b' }}
            >
              Reference
            </th>
            <th
              className="px-3 py-2.5 text-left font-semibold uppercase tracking-wide"
              style={{ color: '#ffffff', background: '#1e293b' }}
            >
              Type
            </th>
            <th
              className="px-3 py-2.5 text-right font-semibold uppercase tracking-wide"
              style={{ color: '#ffffff', background: '#1e293b' }}
            >
              Debit
            </th>
            <th
              className="px-3 py-2.5 text-right font-semibold uppercase tracking-wide"
              style={{ color: '#ffffff', background: '#1e293b' }}
            >
              Credit
            </th>
            <th
              className="px-3 py-2.5 text-right font-semibold uppercase tracking-wide"
              style={{ color: '#ffffff', background: '#1e293b' }}
            >
              Balance
            </th>
          </tr>
        </thead>
        <tbody>
          {showBroughtForward && broughtForwardDate != null && broughtForward != null && (
            <tr className="border-y-2 border-blue-300 bg-blue-50">
              <td className="px-3 py-3 text-sm font-semibold text-slate-700 whitespace-nowrap">
                {formatDateShort(broughtForwardDate)}
              </td>
              <td className="px-3 py-3 text-sm text-slate-900 font-mono font-bold whitespace-nowrap">B/F</td>
              <td className="px-3 py-3 text-sm font-bold text-blue-900">Brought Forward</td>
              <td className="px-3 py-3 text-right whitespace-nowrap text-slate-400">—</td>
              <td className="px-3 py-3 text-right whitespace-nowrap text-slate-400">—</td>
              <td className="px-3 py-3 text-right whitespace-nowrap">
                <LedgerBfAmount amount={broughtForward} />
              </td>
            </tr>
          )}
          {grouped.map((group, groupIdx) => {
            const totalDebit = group.rows.reduce((sum, r) => sum + r.debit, 0);
            const totalCredit = group.rows.reduce((sum, r) => sum + r.credit, 0);

            return (
              <React.Fragment key={group.branchName || groupIdx}>
                {groupByBranch && (
                  <tr className="wallet-ledger-preview__branch-row bg-[#dbeafe] border-y border-blue-200">
                    <td
                      colSpan={3}
                      className="px-3 py-2.5 text-left font-bold uppercase tracking-wide text-slate-800"
                    >
                      BRANCH: {branchDisplayName(group.branchName)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap font-bold text-rose-700">
                      {totalDebit > 0 ? formatMoney(totalDebit) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap font-bold text-emerald-700">
                      {totalCredit > 0 ? formatMoney(totalCredit) : '—'}
                    </td>
                    <td className="px-3 py-2.5" />
                  </tr>
                )}
                {group.rows.map((row, index) => {
                  const isOrderCredit = row.orderCount != null && row.orderCount > 0;
                  return (
                    <tr
                      key={`${row.referenceId}-${index}`}
                      className={`border-b border-slate-100 ${
                        isOrderCredit
                          ? 'bg-emerald-50/70'
                          : index % 2 === 0
                            ? 'bg-white'
                            : 'bg-slate-50'
                      }`}
                    >
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {formatDateShort(row.date)}
                      </td>
                      <td className="px-3 py-2 text-slate-800 font-mono whitespace-nowrap">
                        {row.referenceId}
                      </td>
                      <td className="px-3 py-2 text-slate-800 break-words leading-snug">
                        {formatTypeLabel(row)}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-medium text-rose-600">
                        {row.debit > 0 ? formatMoney(row.debit) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-medium text-emerald-600">
                        {row.credit > 0 ? formatMoney(row.credit) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap font-semibold text-blue-700">
                        {formatMoney(row.runningBalance)}
                      </td>
                    </tr>
                  );
                })}
              </React.Fragment>
            );
          })}
        </tbody>
        {showTotals && (
          <tfoot className="[&_td]:text-slate-900">
            <tr className="bg-slate-50">
              <td colSpan={3} className="border-t-[3px] border-slate-900" />
              <td className="px-3 py-4 text-right border-t-[3px] border-slate-900 align-top">
                <LedgerFooterTotal label="Total Debit" amount={totalOutflow ?? 0} tone="debit" showDashWhenZero />
              </td>
              <td className="px-3 py-4 text-right border-t-[3px] border-slate-900 align-top">
                <LedgerFooterTotal label="Total Credit" amount={totalInflow ?? 0} tone="credit" showDashWhenZero />
              </td>
              <td className="px-3 py-4 text-right border-t-[3px] border-slate-900 align-top">
                <LedgerFooterTotal label="Closing Balance" amount={closingBalance ?? 0} tone="balance" />
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export default function WalletLedgerPreviewSheet({
  open,
  onClose,
  rows,
  storeId,
  storeName,
  totalInflow,
  totalOutflow,
  closingBalance,
  broughtForward = 0,
  broughtForwardDate = '',
  from,
  to,
}: Props) {
  const [includeBroughtForward, setIncludeBroughtForward] = useState(true);
  const [includeInflow, setIncludeInflow] = useState(true);
  const [includeOutflow, setIncludeOutflow] = useState(true);
  const [includeClosingBalance, setIncludeClosingBalance] = useState(true);
  const [includePayoutSettlements, setIncludePayoutSettlements] = useState(true);

  const showBroughtForward = !!(storeId && from && broughtForwardDate);

  const payoutTransactionIds = useMemo(() => {
    const ids = rows
      .filter(
        (row) =>
          row.transactionType === 'Branch Payout (Outflow)' && !!row.transactionId,
      )
      .map((row) => row.transactionId!);
    return [...new Set(ids)];
  }, [rows]);

  const payoutDetailsQueryUrl = useMemo(() => {
    if (payoutTransactionIds.length === 0) return null;
    return `/admin/wallet/payout-details?transactionIds=${encodeURIComponent(payoutTransactionIds.join(','))}`;
  }, [payoutTransactionIds]);

  const { data: payoutDetails = [], isFetching: payoutDetailsLoading } = useQuery<PayoutDetail[]>({
    queryKey: ['wallet-ledger-payout-details', payoutDetailsQueryUrl],
    queryFn: () => adminFetch(payoutDetailsQueryUrl!),
    enabled: open && !!payoutDetailsQueryUrl,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const periodLabel = formatReportPeriodFromDates(from, to);
  const reference = useMemo(() => `VWL-${Date.now()}`, [open, rows.length, storeId, from, to]);
  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-LK', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [open],
  );

  const showByBranch = !storeId;

  const { data: stores = [] } = useReportStores();

  const selectedBranchName = useMemo(() => {
    if (!storeId) return null;
    if (storeName) return branchDisplayName(storeName);
    const fromStore = stores.find((s) => s.id === storeId)?.name;
    if (fromStore) return branchDisplayName(fromStore);
    const fromRows = rows.find((r) => r.branchName)?.branchName;
    return fromRows ? branchDisplayName(fromRows) : 'Selected branch';
  }, [storeId, storeName, stores, rows]);

  const branchScopeLabel = selectedBranchName ? `${selectedBranchName} Branch` : 'All Branches';

  const visibleStatCount =
    Number(showBroughtForward && includeBroughtForward) +
    Number(includeInflow) +
    Number(includeOutflow) +
    Number(includeClosingBalance);

  const branchCount = useMemo(() => {
    if (!showByBranch) return 0;
    const branches = new Set<string>();
    for (const row of rows) {
      branches.add(row.branchName || 'Unknown Branch');
    }
    return branches.size;
  }, [rows, showByBranch]);

  const statusLine = [
    'Live Ledger',
    `${rows.length} row${rows.length === 1 ? '' : 's'}`,
    showByBranch && branchCount > 0
      ? `${branchCount} branch${branchCount === 1 ? '' : 'es'}`
      : null,
  ]
    .filter(Boolean)
    .join('  ·  ');

  const handlePrint = () => {
    // Isolate from page print CSS (body:has(.admin-print-report) hides all other content).
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'Wallet Ledger Print');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument;
    const win = iframe.contentWindow;
    if (!doc || !win) {
      iframe.remove();
      return;
    }

    doc.open();
    doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Virtual Wallet Ledger</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    html, body {
      margin: 0;
      padding: 0;
      background: #faf9f6;
      color: #0f172a;
      font-family: Helvetica, Arial, sans-serif;
    }
    .wallet-ledger-preview-print {
      width: 100%;
      background: #faf9f6;
      overflow: visible;
      position: relative;
      padding-top: 3px;
    }
    .wallet-ledger-preview-print::before {
      content: '';
      position: absolute;
      left: 0; top: 0; right: 0;
      height: 3px;
      background: #307ef2;
    }
    .wallet-ledger-preview__letterhead {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1.5rem;
      padding: 1.35rem 1.5rem 0.75rem;
      background: transparent;
      color: #0f1428;
    }
    .wallet-ledger-preview__letterhead .brand-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .wallet-ledger-preview__letterhead img {
      width: 42px;
      height: 42px;
      object-fit: contain;
    }
    .brand-name {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: #0f1428;
    }
    .brand-loc {
      margin: 0.15rem 0 0;
      font-size: 8.5px;
      color: #64748b;
      letter-spacing: 0.04em;
    }
    .doc-title-block { text-align: right; min-width: 12rem; }
    .doc-title {
      margin: 0;
      font-family: "Times New Roman", Times, serif;
      font-size: 34px;
      font-weight: 400;
      color: #0f1428;
      line-height: 1;
    }
    .doc-meta-line {
      margin: 0.35rem 0 0;
      font-size: 9px;
      color: #64748b;
    }
    .wallet-ledger-preview__scope {
      padding: 0.35rem 1.5rem 1rem;
    }
    .scope-label {
      margin: 0;
      font-size: 7.5px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: #64748b;
    }
    .scope-branch {
      margin: 0.4rem 0 0;
      font-size: 13px;
      font-weight: 700;
      color: #0f1428;
    }
    .scope-desc {
      margin: 0.35rem 0 0;
      font-size: 10px;
      color: #1e293b;
    }
    .scope-period {
      margin: 0.3rem 0 0;
      font-size: 9.5px;
      color: #64748b;
    }
    .scope-status {
      margin: 0.45rem 0 0;
      font-size: 9px;
      font-weight: 700;
      color: #307ef2;
    }
    .wallet-ledger-preview__rule {
      height: 0;
      border: 0;
      border-top: 1px solid #a1a1aa;
      margin: 0 1.5rem 1rem;
    }
    .wallet-ledger-preview__stats {
      display: grid;
      grid-template-columns: repeat(${Math.max(visibleStatCount, 1)}, minmax(0, 1fr));
      gap: 0.65rem;
      padding: 0 1.5rem 1rem;
    }
    .wallet-ledger-preview__stat {
      border-radius: 0.5rem;
      padding: 0.75rem 0.85rem;
      border: 1px solid #e2e8f0;
      background: #fff;
    }
    .wallet-ledger-preview__stat-label {
      margin: 0;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .wallet-ledger-preview__stat--bf {
      border: 2px solid #93c5fd;
      background: #eff6ff;
      padding: 0.85rem 1rem;
    }
    .wallet-ledger-preview__stat--bf .wallet-ledger-preview__stat-label { color: #1e3a8a; font-size: 11px; }
    .wallet-ledger-preview__stat--in .wallet-ledger-preview__stat-label { color: #047857; }
    .wallet-ledger-preview__stat--out .wallet-ledger-preview__stat-label { color: #be123c; }
    .wallet-ledger-preview__stat--bal .wallet-ledger-preview__stat-label { color: #1d4ed8; }
    .wallet-ledger-preview__stat-value {
      margin: 0.25rem 0 0;
      font-size: 1rem;
      font-weight: 800;
    }
    .wallet-ledger-preview__stat--bf .wallet-ledger-preview__stat-value { color: #1e3a8a; font-size: 1.25rem; }
    .wallet-ledger-preview__stat--in .wallet-ledger-preview__stat-value { color: #065f46; }
    .wallet-ledger-preview__stat--out .wallet-ledger-preview__stat-value { color: #9f1239; }
    .wallet-ledger-preview__stat--bal .wallet-ledger-preview__stat-value { color: #1e40af; }
    .wallet-ledger-preview__table-wrap {
      margin: 0 1.5rem 1rem;
      border: 1px solid #e2e8f0;
      border-radius: 0.5rem;
      overflow: visible;
      background: #fff;
    }
    table {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      font-size: 11px;
    }
    thead { display: table-header-group; }
    tfoot { display: table-row-group; }
    th {
      background: #f8fafc;
      color: #334155;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 0.6rem 0.75rem;
      text-align: left;
      border-bottom: 2px solid #e2e8f0;
    }
    th.num, td.num { text-align: right; white-space: nowrap; }
    td {
      padding: 0.5rem 0.75rem;
      border-bottom: 1px solid #f1f5f9;
      color: #0f172a;
      vertical-align: top;
    }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .wallet-ledger-preview__branch-row td {
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .debit { color: #e11d48; font-weight: 600; }
    .credit { color: #059669; font-weight: 600; }
    .balance { color: #1d4ed8; font-weight: 700; }
    .row-credit { background: #fff; }
    .row-alt { background: #f8fafc; }
    .row-bf {
      background: #eff6ff;
      border-top: 2px solid #93c5fd;
      border-bottom: 2px solid #93c5fd;
      font-weight: 700;
    }
    .row-bf td { font-size: 12px; padding: 0.65rem 0.75rem; }
    .row-bf .bf-type { color: #1e3a8a; font-weight: 800; }
    .row-bf .bf-amount {
      display: inline-flex;
      align-items: baseline;
      gap: 0.2rem;
      font-size: 14px;
      font-weight: 800;
      color: #1e40af;
    }
    .row-bf .bf-amount .lkr { font-size: 9px; font-weight: 700; opacity: 0.8; }
    .muted { color: #64748b; }
    tfoot td {
      border-top: 3px solid #0f172a;
      padding: 0.85rem 0.75rem;
      background: #f8fafc;
      vertical-align: top;
    }
    tfoot .total-cell-inner {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 0.35rem;
    }
    tfoot .total-cell-label {
      font-size: 11px;
      font-weight: 700;
      color: #0f172a;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    tfoot .total-cell-amount {
      display: inline-flex;
      align-items: baseline;
      gap: 0.25rem;
      font-size: 18px;
      font-weight: 800;
      line-height: 1;
    }
    tfoot .total-cell-amount .lkr {
      font-size: 10px;
      font-weight: 700;
      color: #475569;
    }
    tfoot .total-cell-dash {
      font-size: 18px;
      font-weight: 700;
      color: #94a3b8;
    }
    tfoot .debit { color: #9f1239; }
    tfoot .credit { color: #047857; }
    tfoot .balance { color: #1e3a8a; }
    footer.report-footer {
      margin: 0.5rem 1.5rem 0;
      padding: 0.9rem 0 1.1rem;
      border-top: 1px solid #d4d4d8;
      position: relative;
    }
    footer.report-footer::after {
      content: '';
      position: absolute;
      left: -1.5rem; right: -1.5rem; bottom: 0;
      height: 3px;
      background: #307ef2;
    }
    .footer-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
    }
    .footer-h {
      margin: 0;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #0f1428;
    }
    .footer-line {
      margin: 0.35rem 0 0;
      font-size: 9px;
      color: #64748b;
    }
    .footer-auto {
      margin: 0.85rem 0 0;
      font-size: 8.5px;
      font-style: italic;
      color: #94a3b8;
    }
  </style>
</head>
<body></body>
</html>`);
    doc.close();

    const period = formatReportPeriodFromDates(from, to);
    const dateLabel = new Date().toLocaleDateString('en-LK', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const scopeBranch = selectedBranchName
      ? `${selectedBranchName} Branch`
      : 'All Branches';

    const groups = (() => {
      if (storeId) return [{ branchName: '', rows }];
      const map = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = row.branchName || 'Unknown Branch';
        const list = map.get(key);
        if (list) list.push(row);
        else map.set(key, [row]);
      }
      return Array.from(map.entries()).map(([branchName, branchRows]) => ({
        branchName,
        rows: branchRows,
      }));
    })();

    const formatType = (row: (typeof rows)[number]) =>
      row.orderCount != null && row.orderCount > 0
        ? `${row.transactionType} (${row.orderCount})`
        : row.transactionType;

    const money = (n: number) => formatLkr(n);

    const totalCell = (label: string, amount: number, tone: string, dashWhenZero = false) => {
      const showDash = dashWhenZero && amount <= 0;
      const amountHtml = showDash
        ? '<span class="total-cell-dash">—</span>'
        : `<span class="total-cell-amount ${tone}"><span class="lkr">LKR</span> ${money(amount)}</span>`;
      return `<td class="num" style="color:#0f172a;">
        <div class="total-cell-inner">
          <span class="total-cell-label">${escapeHtml(label)}</span>
          ${amountHtml}
        </div>
      </td>`;
    };

    const tableRowsHtml = (() => {
      const bfRow =
        showBroughtForward && includeBroughtForward
          ? `<tr class="row-bf">
              <td class="muted">${escapeHtml(formatDateShort(broughtForwardDate))}</td>
              <td style="font-family:ui-monospace,monospace;white-space:nowrap;font-weight:700;">B/F</td>
              <td class="bf-type">Brought Forward</td>
              <td class="num">—</td>
              <td class="num">—</td>
              <td class="num"><span class="bf-amount"><span class="lkr">LKR</span>${money(broughtForward)}</span></td>
            </tr>`
          : '';

      const body = groups
        .map((group) => {
          const totalDebit = group.rows.reduce((s, r) => s + r.debit, 0);
          const totalCredit = group.rows.reduce((s, r) => s + r.credit, 0);
          const branchHeader =
            !storeId
              ? `<tr class="wallet-ledger-preview__branch-row">
                <td colspan="3">BRANCH: ${escapeHtml(branchDisplayName(group.branchName))}</td>
                <td class="num debit">${totalDebit > 0 ? money(totalDebit) : '—'}</td>
                <td class="num credit">${totalCredit > 0 ? money(totalCredit) : '—'}</td>
                <td></td>
              </tr>`
              : '';

          const rowsHtml = group.rows
            .map((row, index) => {
              const isOrder = row.orderCount != null && row.orderCount > 0;
              const cls = isOrder ? 'row-credit' : index % 2 === 1 ? 'row-alt' : '';
              return `<tr class="${cls}">
              <td class="muted">${escapeHtml(formatDateShort(row.date))}</td>
              <td style="font-family:ui-monospace,monospace;white-space:nowrap;">${escapeHtml(row.referenceId)}</td>
              <td>${escapeHtml(formatType(row))}</td>
              <td class="num debit">${row.debit > 0 ? money(row.debit) : '—'}</td>
              <td class="num credit">${row.credit > 0 ? money(row.credit) : '—'}</td>
              <td class="num balance">${money(row.runningBalance)}</td>
            </tr>`;
            })
            .join('');

          return branchHeader + rowsHtml;
        })
        .join('');

      return bfRow + body;
    })();

    const logoSrc = `${window.location.origin}/brand/logo.avif`;
    const statusBits = [
      'Live Ledger',
      `${rows.length} row${rows.length === 1 ? '' : 's'}`,
      showByBranch && branchCount > 0
        ? `${branchCount} branch${branchCount === 1 ? '' : 'es'}`
        : null,
    ]
      .filter(Boolean)
      .join('  ·  ');

    doc.body.innerHTML = `
      <article class="wallet-ledger-preview-print">
        <header class="wallet-ledger-preview__letterhead">
          <div class="brand-row">
            <img src="${logoSrc}" alt="Bing Chun" />
            <div>
              <p class="brand-name">Bing Chun Delivery</p>
              <p class="brand-loc">Sri Lanka</p>
            </div>
          </div>
          <div class="doc-title-block">
            <p class="doc-title">Ledger</p>
            <p class="doc-meta-line">Date  ${escapeHtml(dateLabel)}</p>
            <p class="doc-meta-line">Report No.  ${escapeHtml(reference)}</p>
          </div>
        </header>

        <div class="wallet-ledger-preview__scope">
          <p class="scope-label">Report For</p>
          <p class="scope-branch">${escapeHtml(scopeBranch)}</p>
          <p class="scope-desc">Virtual wallet ledger</p>
          <p class="scope-period">Statement period  ${escapeHtml(period)}</p>
          <p class="scope-status">Status  ${escapeHtml(statusBits)}</p>
        </div>

        <hr class="wallet-ledger-preview__rule" />

        ${
          visibleStatCount > 0
            ? `<div class="wallet-ledger-preview__stats">
          ${
            includeInflow
              ? `<div class="wallet-ledger-preview__stat wallet-ledger-preview__stat--in">
            <p class="wallet-ledger-preview__stat-label">Total Inflow (Credits)</p>
            <p class="wallet-ledger-preview__stat-value">${formatPrintMoney(totalInflow)}</p>
          </div>`
              : ''
          }
          ${
            includeOutflow
              ? `<div class="wallet-ledger-preview__stat wallet-ledger-preview__stat--out">
            <p class="wallet-ledger-preview__stat-label">Total Outflow (Debits)</p>
            <p class="wallet-ledger-preview__stat-value">${formatPrintMoney(totalOutflow)}</p>
          </div>`
              : ''
          }
          ${
            includeClosingBalance
              ? `<div class="wallet-ledger-preview__stat wallet-ledger-preview__stat--bal">
            <p class="wallet-ledger-preview__stat-label">Closing Balance</p>
            <p class="wallet-ledger-preview__stat-value">${formatPrintMoney(closingBalance)}</p>
          </div>`
              : ''
          }
        </div>`
            : ''
        }

        <div class="wallet-ledger-preview__table-wrap">
          <table>
            ${LEDGER_TABLE_COLGROUP_HTML}
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Type</th>
                <th class="num">Debit</th>
                <th class="num">Credit</th>
                <th class="num">Balance</th>
              </tr>
            </thead>
            <tbody>
              ${tableRowsHtml || `<tr><td colspan="6" style="text-align:center;padding:2rem;color:#64748b;">No ledger rows</td></tr>`}
            </tbody>
            ${
              rows.length > 0 || (showBroughtForward && includeBroughtForward)
                ? `<tfoot>
              <tr>
                <td colspan="3"></td>
                ${totalCell('Total Debit', totalOutflow, 'debit', true)}
                ${totalCell('Total Credit', totalInflow, 'credit', true)}
                ${totalCell('Closing Balance', closingBalance, 'balance')}
              </tr>
            </tfoot>`
                : ''
            }
          </table>
        </div>

        ${
          includePayoutSettlements && payoutDetails.length > 0
            ? `<div style="margin:1.25rem 1.5rem 0;padding-top:1rem;border-top:1px solid #94a3b8;">
          <p style="margin:0 0 0.75rem;font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#475569;">Branch Payout Settlements</p>
          ${payoutDetails.map((detail) => settlementStatementToPrintHtml(detail)).join('')}
        </div>`
            : ''
        }

        <footer class="report-footer">
          <div class="footer-grid">
            <div>
              <p class="footer-h">Report Info</p>
              <p class="footer-line">Virtual Wallet Ledger</p>
              <p class="footer-line">Bing Chun Delivery — Virtual wallet</p>
            </div>
            <div>
              <p class="footer-h">Contact</p>
              <p class="footer-line">Head Office · Sri Lanka</p>
              <p class="footer-line">support@bingchun.lk</p>
              <p class="footer-line">www.bingchun.lk</p>
            </div>
          </div>
          <p class="footer-auto">This is a system generated report.</p>
        </footer>
      </article>
    `;

    const cleanup = () => {
      iframe.remove();
      win.removeEventListener('afterprint', cleanup);
      window.removeEventListener('afterprint', cleanup);
    };
    win.addEventListener('afterprint', cleanup);
    window.addEventListener('afterprint', cleanup);

    const triggerPrint = () => {
      try {
        win.focus();
        win.print();
      } catch {
        cleanup();
      }
      window.setTimeout(cleanup, 1500);
    };

    const imgs = Array.from(doc.images);
    if (imgs.length === 0) {
      requestAnimationFrame(() => requestAnimationFrame(triggerPrint));
      return;
    }
    let remaining = imgs.length;
    const done = () => {
      remaining -= 1;
      if (remaining <= 0) triggerPrint();
    };
    imgs.forEach((img) => {
      if (img.complete) done();
      else {
        img.addEventListener('load', done);
        img.addEventListener('error', done);
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full max-w-[min(72rem,92vw)] p-0 gap-0 bg-slate-50 text-slate-900 overflow-hidden flex flex-col h-full data-[side=right]:w-[min(72rem,92vw)] data-[side=right]:max-w-[min(72rem,92vw)]"
      >
        <SheetHeader className="wallet-ledger-preview-no-print border-b border-slate-200 bg-white px-4 py-3 pr-12 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-slate-900">Report Preview</SheetTitle>
              <SheetDescription className="text-slate-500">
                Virtual Wallet Ledger · {branchScopeLabel} · review before printing
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
              aria-label="Close preview"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Include in PDF:
            </span>
            {showBroughtForward && (
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                  checked={includeBroughtForward}
                  onChange={(e) => setIncludeBroughtForward(e.target.checked)}
                />
                Brought Forward
              </label>
            )}
            <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                checked={includeInflow}
                onChange={(e) => setIncludeInflow(e.target.checked)}
              />
              Total Inflow (Credits)
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                checked={includeOutflow}
                onChange={(e) => setIncludeOutflow(e.target.checked)}
              />
              Total Outflow (Debits)
            </label>
            <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                checked={includeClosingBalance}
                onChange={(e) => setIncludeClosingBalance(e.target.checked)}
              />
              Closing Balance
            </label>
            {payoutTransactionIds.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                  checked={includePayoutSettlements}
                  onChange={(e) => setIncludePayoutSettlements(e.target.checked)}
                />
                Payout Settlements ({payoutTransactionIds.length})
              </label>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="wallet-ledger-preview-print m-3 sm:m-4 rounded-2xl border border-slate-200 bg-[#faf9f6] shadow-sm overflow-hidden relative pt-[3px] before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-[#307ef2]">
            <header className="wallet-ledger-preview__letterhead flex items-start justify-between gap-6 px-5 pt-5 pb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative h-11 w-11 shrink-0">
                  <Image
                    src="/brand/logo.avif"
                    alt="Bing Chun"
                    fill
                    sizes="44px"
                    className="object-contain"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-[#0f1428] tracking-tight">Bing Chun Delivery</p>
                  <p className="text-[10px] text-slate-500 tracking-wide mt-0.5">Sri Lanka</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-serif text-[34px] leading-none text-[#0f1428]">Ledger</p>
                <p className="text-[11px] text-slate-500 mt-2">Date  {dateLabel}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Report No.  {reference}</p>
              </div>
            </header>

            <div className="px-5 pb-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Report For</p>
              <p className="text-[15px] font-bold text-[#0f1428] mt-1.5">{branchScopeLabel}</p>
              <p className="text-[12px] text-slate-800 mt-1.5">Virtual wallet ledger</p>
              <p className="text-[12px] text-slate-500 mt-1">Statement period  {periodLabel}</p>
              <p className="text-[11px] font-bold text-[#307ef2] mt-2">Status  {statusLine}</p>
            </div>

            <hr className="mx-5 border-0 border-t border-[#a1a1aa] mb-4" />

            {visibleStatCount > 0 && (
              <div
                className={`wallet-ledger-preview__stats grid grid-cols-1 gap-2.5 px-5 pb-4 ${
                  visibleStatCount === 1
                    ? 'sm:grid-cols-1'
                    : visibleStatCount === 2
                      ? 'sm:grid-cols-2'
                      : visibleStatCount === 3
                        ? 'sm:grid-cols-3'
                        : 'sm:grid-cols-2 lg:grid-cols-4'
                }`}
              >
                {includeInflow && (
                  <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                      Total Inflow (Credits)
                    </p>
                    <p className="mt-1 text-base font-extrabold text-emerald-800">
                      {formatPrintMoney(totalInflow)}
                    </p>
                  </div>
                )}
                {includeOutflow && (
                  <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-rose-700">
                      Total Outflow (Debits)
                    </p>
                    <p className="mt-1 text-base font-extrabold text-rose-800">
                      {formatPrintMoney(totalOutflow)}
                    </p>
                  </div>
                )}
                {includeClosingBalance && (
                  <div className="rounded-lg border border-slate-200 bg-white px-3.5 py-3">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-blue-700">
                      Closing Balance
                    </p>
                    <p className="mt-1 text-base font-extrabold text-blue-800">
                      {formatPrintMoney(closingBalance)}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="px-5 pb-5">
              {rows.length === 0 && !showBroughtForward ? (
                <p className="text-sm text-slate-500 text-center py-10">
                  No ledger rows for the selected filters.
                </p>
              ) : (
                <>
                  <BranchTable
                    rows={rows}
                    groupByBranch={showByBranch}
                    showBroughtForward={showBroughtForward && includeBroughtForward}
                    broughtForwardDate={broughtForwardDate}
                    broughtForward={broughtForward}
                    showTotals
                    totalOutflow={totalOutflow}
                    totalInflow={totalInflow}
                    closingBalance={closingBalance}
                  />
                </>
              )}

              {includePayoutSettlements && payoutTransactionIds.length > 0 && (
                <div className="mt-6 pt-5 border-t border-slate-300">
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-600 mb-3">
                    Branch Payout Settlements
                  </p>
                  {payoutDetailsLoading && payoutDetails.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3">Loading payout settlements…</p>
                  ) : payoutDetails.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3">
                      No payout settlement details available for this period.
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {payoutDetails.map((detail) => (
                        <PayoutSettlementStatement
                          key={detail.transactionId}
                          detail={detail}
                          variant="print"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <footer className="mx-5 mb-0 pt-4 pb-5 border-t border-[#d4d4d8] relative after:absolute after:left-[-1.25rem] after:right-[-1.25rem] after:bottom-0 after:h-[3px] after:bg-[#307ef2]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#0f1428]">Report Info</p>
                  <p className="text-[11px] text-slate-500 mt-1.5">Virtual Wallet Ledger</p>
                  <p className="text-[11px] text-slate-500 mt-1">Bing Chun Delivery — Virtual wallet</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#0f1428]">Contact</p>
                  <p className="text-[11px] text-slate-500 mt-1.5">Head Office · Sri Lanka</p>
                  <p className="text-[11px] text-slate-500 mt-1">support@bingchun.lk</p>
                  <p className="text-[11px] text-slate-500 mt-1">www.bingchun.lk</p>
                </div>
              </div>
              <p className="text-[10px] italic text-slate-400 mt-4">This is a system generated report.</p>
            </footer>
          </div>
        </div>

        <SheetFooter className="wallet-ledger-preview-no-print border-t border-slate-200 bg-white px-4 py-3 flex-row items-center justify-between gap-3 sm:flex-row">
          <p className="text-xs text-slate-500">
            {rows.length} row{rows.length === 1 ? '' : 's'}
            {showByBranch && branchCount > 0
              ? ` · ${branchCount} branch${branchCount === 1 ? '' : 'es'}`
              : ''}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="btn-outline px-3 py-2 text-xs">
              Close
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={rows.length === 0 && !showBroughtForward}
              className="btn-primary px-3 py-2 text-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Printer size={13} /> Print
            </button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
