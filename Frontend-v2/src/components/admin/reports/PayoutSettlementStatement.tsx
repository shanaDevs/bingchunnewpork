'use client';
import { openPayoutProof, openPayoutProofById, openWithdrawalInvoice } from '@/lib/adminProtectedFile';
import { hasWithdrawalInvoice } from '@/components/admin/settlementTypes';

import { ExternalLink, FileText } from 'lucide-react';
import toast from 'react-hot-toast';
import { formatLkr } from '@/components/admin/reports/reportUtils';

export type PayoutDetail = {
  transactionId: string;
  withdrawalId: string;
  referenceId: string;
  amount: number;
  periodFrom: string;
  periodTo: string;
  periodLabel: string;
  paymentMethod: string | null;
  proofUrl?: string | null;
  hasProof?: boolean;
  invoiceRef: string | null;
  invoiceUrl: string | null;
  remarks: string | null;
  isAdvance: boolean;
  orderCount: number;
  slabRatePct: number | null;
  gatewayRatePct: number;
  convenienceFeeRatePct: number;
  /** Canonical settlement fields */
  revenueSubtotal: number;
  deliveryFee: number;
  onlinePaymentsCollected: number;
  platformCommission: number;
  paymentGatewayFee: number;
  customerConvenienceFee: number;
  netPayout: number;
  /** Basis helpers */
  grossSalesForCommission: number;
  gatewayBase: number;
  convenienceFeeBase?: number;
  /** Legacy aliases (kept for compatibility) */
  totalOrderCredits?: number;
  totalDeliveryFee?: number;
  onlineWalletGross?: number;
  totalDeductions?: number;
};

type SettlementRow = {
  key: string;
  component: string;
  basis: string;
  amount: number;
  tone: 'default' | 'emphasis' | 'deduction' | 'net';
  sign?: '+' | '−' | '=' | '';
};

type Props = {
  detail: PayoutDetail;
  variant?: 'screen' | 'print';
  className?: string;
};

export function paymentMethodLabel(method: string | null | undefined) {
  switch (method) {
    case 'BANK_TRANSFER':
      return 'Bank Transfer';
    case 'CASH':
      return 'Cash';
    case 'CHECK':
      return 'Check';
    default:
      return method ?? '—';
  }
}

function resolveDetail(detail: PayoutDetail) {
  const revenueSubtotal = detail.revenueSubtotal ?? detail.grossSalesForCommission ?? detail.totalOrderCredits ?? 0;
  const deliveryFee = detail.deliveryFee ?? detail.totalDeliveryFee ?? 0;
  const onlinePaymentsCollected =
    detail.onlinePaymentsCollected ?? detail.onlineWalletGross ?? 0;
  const platformCommission = detail.platformCommission ?? 0;
  const paymentGatewayFee = detail.paymentGatewayFee ?? 0;
  const customerConvenienceFee = detail.customerConvenienceFee ?? 0;
  const netPayout = detail.netPayout ?? detail.amount ?? 0;
  const gatewayBase = detail.gatewayBase ?? onlinePaymentsCollected;
  const convenienceFeeBase = detail.convenienceFeeBase ?? 0;

  return {
    revenueSubtotal,
    deliveryFee,
    onlinePaymentsCollected,
    platformCommission,
    paymentGatewayFee,
    customerConvenienceFee,
    netPayout,
    gatewayBase,
    convenienceFeeBase,
  };
}

export function buildSettlementRows(detail: PayoutDetail): SettlementRow[] {
  const d = resolveDetail(detail);
  const slabLabel = detail.slabRatePct != null ? `${detail.slabRatePct}%` : 'active slab rate';
  const gatewayLabel = `${detail.gatewayRatePct ?? 1.9}%`;
  const convenienceLabel = `${detail.convenienceFeeRatePct ?? 'configured'}%`;

  // Rows that feed Net: Online − Commission − Gateway − Convenience
  // Delivery fee is shown for transparency (already included in online payments).
  return [
    {
      key: 'online',
      component: 'Online payments collected',
      basis: 'Online payment wallet inflow (pickup online + delivery online)',
      amount: d.onlinePaymentsCollected,
      tone: 'emphasis',
      sign: '+',
    },
    {
      key: 'delivery',
      component: 'Delivery fee collected',
      basis: 'Included in online payments · not added again to net',
      amount: d.deliveryFee,
      tone: 'default',
    },
    {
      key: 'commission',
      component: 'Platform Commission',
      basis: `${formatLkr(d.revenueSubtotal)} × ${slabLabel}`,
      amount: d.platformCommission,
      tone: 'deduction',
      sign: '−',
    },
    {
      key: 'gateway',
      component: 'Payment Gateway Fee',
      basis: `${formatLkr(d.gatewayBase)} × ${gatewayLabel}`,
      amount: d.paymentGatewayFee,
      tone: 'deduction',
      sign: '−',
    },
    {
      key: 'convenience',
      component: 'Customer Convenience Fee',
      basis:
        d.convenienceFeeBase > 0
          ? `${formatLkr(d.convenienceFeeBase)} × ${convenienceLabel}`
          : `Delivery order subtotal × ${convenienceLabel}`,
      amount: d.customerConvenienceFee,
      tone: 'deduction',
      sign: '−',
    },
    {
      key: 'net',
      component: 'Net branch payout',
      basis: 'Online payments − commission − gateway − convenience',
      amount: d.netPayout,
      tone: 'net',
      sign: '=',
    },
  ];
}

function formatAmount(row: SettlementRow) {
  const prefix = row.sign === '+' ? '+ ' : row.sign === '−' ? '− ' : row.sign === '=' ? '= ' : '';
  return `${prefix}${formatLkr(row.amount)}`;
}

export function settlementStatementToPrintHtml(detail: PayoutDetail): string {
  const rows = buildSettlementRows(detail);
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const meta = [
    escape(detail.referenceId),
    escape(detail.periodLabel),
    detail.orderCount > 0
      ? `${detail.orderCount} order${detail.orderCount !== 1 ? 's' : ''}`
      : null,
    paymentMethodLabel(detail.paymentMethod),
    detail.isAdvance ? 'Advance' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const bodyRows = rows
    .map((row) => {
      const amountClass =
        row.tone === 'deduction'
          ? 'color:#b91c1c;font-weight:600;'
          : row.tone === 'net'
            ? 'color:#1a5cd4;font-weight:800;'
            : row.tone === 'emphasis'
              ? 'color:#0f172a;font-weight:700;'
              : 'color:#0f172a;font-weight:500;';
      const rowBorder =
        row.tone === 'net'
          ? 'border-top:2px solid #94a3b8;'
          : 'border-top:1px solid #e2e8f0;';
      const labelWeight = row.tone === 'net' || row.tone === 'emphasis' ? '700' : '500';
      return `<tr>
        <td style="padding:7px 10px;${rowBorder}font-weight:${labelWeight};color:#0f172a;width:32%;">${escape(row.component)}</td>
        <td style="padding:7px 10px;${rowBorder}color:#64748b;font-size:10px;width:48%;">${escape(row.basis)}</td>
        <td style="padding:7px 10px;${rowBorder}text-align:right;white-space:nowrap;${amountClass}width:20%;">${escape(formatAmount(row))}</td>
      </tr>`;
    })
    .join('');

  return `<section class="payout-settlement-block" style="margin:0 0 1.1rem;border:1px solid #cbd5e1;border-radius:10px;overflow:hidden;background:#fff;page-break-inside:avoid;">
    <div style="padding:10px 12px;background:#f1f5f9;border-bottom:1px solid #cbd5e1;">
      <p style="margin:0;font-size:11px;font-weight:700;color:#0f1428;">Branch Payout Settlement</p>
      <p style="margin:4px 0 0;font-size:10px;color:#64748b;">${meta}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;">
      <thead>
        <tr style="background:#1e293b;">
          <th style="padding:7px 10px;text-align:left;color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Component</th>
          <th style="padding:7px 10px;text-align:left;color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Basis / Calculation</th>
          <th style="padding:7px 10px;text-align:right;color:#fff;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;">Amount (LKR)</th>
        </tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>
  </section>`;
}

export default function PayoutSettlementStatement({
  detail,
  variant = 'screen',
  className = '',
}: Props) {
  const rows = buildSettlementRows(detail);
  const isPrint = variant === 'print';
  const wrapClass = isPrint
    ? `rounded-xl border border-slate-200 bg-white overflow-hidden ${className}`
    : `rounded-xl border border-navy-border/70 bg-card/20 overflow-hidden ${className}`;

  const headerClass = isPrint
    ? 'flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3.5 py-3'
    : 'flex flex-wrap items-start justify-between gap-2 border-b border-navy-border/60 bg-navy-light/15 px-3.5 py-3';

  const titleClass = isPrint ? 'text-sm font-semibold text-slate-900' : 'text-sm font-semibold text-fg';
  const metaClass = isPrint ? 'text-xs text-slate-500 mt-0.5' : 'text-xs text-muted mt-0.5';
  const thClass = isPrint
    ? 'px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white'
    : 'px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-white';
  const theadBg = { background: '#1e293b' };

  return (
    <section className={wrapClass}>
      <div className={headerClass}>
        <div className="min-w-0">
          <p className={titleClass}>Branch Payout Settlement</p>
          <p className={metaClass}>
            {detail.referenceId} · {detail.periodLabel}
            {detail.orderCount > 0 && (
              <>
                {' '}
                · {detail.orderCount} order{detail.orderCount !== 1 ? 's' : ''}
              </>
            )}
            {detail.isAdvance && (
              <span
                className={
                  isPrint
                    ? 'ml-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800'
                    : 'ml-2 inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300'
                }
              >
                Advance
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              isPrint
                ? 'inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600'
                : 'inline-flex items-center rounded-full border border-navy-border/80 bg-card/40 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted'
            }
          >
            {paymentMethodLabel(detail.paymentMethod)}
          </span>
          {!isPrint && hasWithdrawalInvoice(detail.invoiceUrl) && (
            <button
              type="button"
              onClick={() => {
                void openWithdrawalInvoice(detail.invoiceUrl).catch(() => {
                  toast.error('Could not open invoice');
                });
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-navy-border/80 px-2.5 py-1 text-xs text-brand hover:bg-brand/10"
            >
              <FileText size={14} />
              Invoice
            </button>
          )}
          {!isPrint && (detail.hasProof || detail.proofUrl) && (
            <button
              type="button"
              onClick={() => {
                const open = detail.proofUrl
                  ? openPayoutProof(detail.proofUrl)
                  : openPayoutProofById('withdrawal', detail.withdrawalId);
                void open.catch(() => {
                  toast.error('Could not open payment proof');
                });
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-navy-border/80 px-2.5 py-1 text-xs text-brand hover:bg-brand/10"
            >
              <ExternalLink size={14} />
              Proof
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs table-fixed">
          <colgroup>
            <col style={{ width: '32%' }} />
            <col style={{ width: '48%' }} />
            <col style={{ width: '20%' }} />
          </colgroup>
          <thead>
            <tr style={theadBg}>
              <th className={`${thClass} text-left`}>Component</th>
              <th className={`${thClass} text-left`}>Basis / Calculation</th>
              <th className={`${thClass} text-right`}>Amount (LKR)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const amountClass = isPrint
                ? row.tone === 'deduction'
                  ? 'text-rose-700 font-semibold'
                  : row.tone === 'net'
                    ? 'text-blue-800 font-extrabold'
                    : row.tone === 'emphasis'
                      ? 'text-slate-900 font-bold'
                      : 'text-slate-800 font-medium'
                : row.tone === 'deduction'
                  ? 'text-rose-300 font-semibold'
                  : row.tone === 'net'
                    ? 'text-brand font-extrabold'
                    : row.tone === 'emphasis'
                      ? 'text-fg font-bold'
                      : 'text-fg font-medium';

              const rowBorder = isPrint
                ? row.tone === 'net'
                  ? 'border-t-2 border-slate-400'
                  : 'border-t border-slate-100'
                : row.tone === 'net'
                  ? 'border-t-2 border-brand/40'
                  : 'border-t border-navy-border/40';

              const labelClass = isPrint
                ? row.tone === 'net' || row.tone === 'emphasis'
                  ? 'font-bold text-slate-900'
                  : 'font-medium text-slate-800'
                : row.tone === 'net' || row.tone === 'emphasis'
                  ? 'font-bold text-fg'
                  : 'font-medium text-fg';

              const basisClass = isPrint ? 'text-slate-500' : 'text-muted';

              return (
                <tr key={row.key} className={rowBorder}>
                  <td className={`px-3 py-2.5 ${labelClass}`}>{row.component}</td>
                  <td className={`px-3 py-2.5 text-[11px] leading-snug ${basisClass}`}>{row.basis}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${amountClass}`}>
                    {formatAmount(row)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {detail.remarks && (
        <p
          className={
            isPrint
              ? 'border-t border-slate-200 px-3.5 py-2.5 text-xs text-slate-500'
              : 'border-t border-navy-border/50 px-3.5 py-2.5 text-xs text-muted'
          }
        >
          Note: {detail.remarks}
        </p>
      )}
    </section>
  );
}
