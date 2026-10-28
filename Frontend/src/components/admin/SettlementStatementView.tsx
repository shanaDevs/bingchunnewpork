'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Printer, X } from 'lucide-react';

import { formatCommissionRate } from '@/components/admin/commissionUtils';
import AdminPrintCanvas, { printAdminReport } from '@/components/admin/AdminPrintCanvas';
import AdminPrintReport from '@/components/admin/AdminPrintReport';
import SettlementBreakdownCards, {
  settlementServiceProviderTotal,
  sumSettlementOrderCount,
} from '@/components/admin/SettlementBreakdownCards';
import {
  normalizeSettlementBreakdown,
  SETTLEMENT_CHANNELS,
  hasWithdrawalInvoice,
  settlementStatusLabel,
  type SettlementStatement,
} from '@/components/admin/settlementTypes';
import {
  openCommissionSettlementReceipt,
  openPayoutProof,
  openWithdrawalInvoice,
} from '@/lib/adminProtectedFile';
import { formatMoney, formatMoneyAmount } from '@/lib/receipt';
import toast from 'react-hot-toast';

type Props = {
  statement: SettlementStatement | null;
  onClose: () => void;
};

function formatPeriod(from: string, to: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString('en-LK', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

function StatementDocument({ statement }: { statement: SettlementStatement }) {
  const breakdown = normalizeSettlementBreakdown(statement.breakdown);
  const totalOwed = settlementServiceProviderTotal(
    breakdown,
    statement.totalCommission,
  );
  const rows = SETTLEMENT_CHANNELS.map(({ key, label }) => {
    const row = breakdown[key];
    return {
      key,
      cells: [
        label,
        String(row.orderCount),
        formatMoneyAmount(row.revenueSubtotal),
        `${formatMoneyAmount(row.commission)}${row.rate > 0 ? ` @ ${formatCommissionRate(row.rate)}` : ''}`,
        (row.convenientFeeTotal ?? 0) > 0.001 ? formatMoneyAmount(row.convenientFeeTotal ?? 0) : '—',
      ],
    };
  });

  return (
    <AdminPrintReport
      title="Service Provider Commission Settlement"
      reference={statement.statementRef}
      dateLabel={new Date(statement.submittedAt).toLocaleString('en-LK', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })}
      periodLabel={`Billing period: ${formatPeriod(statement.period.from, statement.period.to)}`}
      summaryStats={[
        { label: 'Branch', value: statement.storeName },
        { label: 'Payment Method', value: statement.paymentMethod },
        { label: 'Status', value: settlementStatusLabel(statement.status) },
      ]}
      columns={['Channel', 'Orders', 'Gross Sales', 'Commission (Rate)', 'Convenience Fee']}
      rows={rows}
      totals={[
        { label: 'Total commission', value: formatMoney(statement.totalCommission) },
        {
          label: 'Total amount due',
          value: formatMoney(totalOwed),
          grand: true,
        },
      ]}
      footer="Bing Chun · Service provider commission settlement"
      alignRightFromColumn={1}
    />
  );
}

export default function SettlementStatementView({ statement, onClose }: Props) {
  const [portalReady, setPortalReady] = useState(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!statement) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [statement]);

  if (!portalReady || !statement) return null;

  const breakdown = normalizeSettlementBreakdown(statement.breakdown);
  const hasReceipt = Boolean(statement.hasReceipt ?? statement.receiptUrl);
  const orderCount = sumSettlementOrderCount(breakdown);

  const openReceipt = () => {
    const open = statement.receiptUrl
      ? openPayoutProof(statement.receiptUrl)
      : openCommissionSettlementReceipt(statement.id);
    void open.catch(() => {
      toast.error('Could not open payment receipt');
    });
  };

  const openInvoice = () => {
    void openWithdrawalInvoice(statement.invoiceUrl).catch(() => {
      toast.error('Could not open invoice');
    });
  };

  return createPortal(
    <>
      <AnimatePresence>
        <motion.div
          key="settlement-statement-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1300] bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden
        />
        <motion.div
          key="settlement-statement-dialog"
          role="dialog"
          aria-modal
          aria-label="Settlement breakdown"
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          className="fixed inset-0 z-[1301] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <div
            className="card flex max-h-[min(92vh,900px)] w-full max-w-4xl flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-navy-border)] px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 rounded-full bg-emerald-500/15 p-2 text-emerald-400">
                  <CheckCircle2 size={22} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-[var(--color-text)]">
                    Settlement Breakdown
                  </h2>
                  <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
                    {formatPeriod(statement.period.from, statement.period.to)} ·{' '}
                    {settlementStatusLabel(statement.status)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-[var(--color-text-muted)] hover:bg-[var(--color-input-bg)]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="mb-4 rounded-xl border border-[var(--color-navy-border)] bg-[var(--color-input-bg)]/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                      Statement Reference
                    </p>
                    <p className="mt-1 font-mono text-base font-bold text-[var(--color-text)]">
                      {statement.statementRef}
                    </p>
                  </div>
                  <div className="text-right text-sm text-[var(--color-text-muted)]">
                    <p>{statement.storeName}</p>
                    <p className="mt-1">{statement.paymentMethod}</p>
                    <p className="mt-1">
                      Settled{' '}
                      {new Date(statement.submittedAt).toLocaleDateString('en-LK', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
              </div>

              <SettlementBreakdownCards
                breakdown={breakdown}
                totalCommission={statement.totalCommission}
                orderCount={orderCount}
              />

              {(hasWithdrawalInvoice(statement.invoiceUrl) || hasReceipt) && (
                <div className="mt-4 flex flex-wrap gap-3">
                  {hasWithdrawalInvoice(statement.invoiceUrl) && (
                    <button
                      type="button"
                      onClick={openInvoice}
                      className="rounded-lg border border-[var(--color-navy-border)] px-3 py-2 text-sm font-medium text-[var(--color-brand)] hover:bg-[var(--color-input-bg)]"
                    >
                      View invoice PDF
                    </button>
                  )}
                  {hasReceipt && (
                    <button
                      type="button"
                      onClick={openReceipt}
                      className="rounded-lg border border-[var(--color-navy-border)] px-3 py-2 text-sm font-medium text-[var(--color-brand)] hover:bg-[var(--color-input-bg)]"
                    >
                      View receipt
                    </button>
                  )}
                </div>
              )}

            </div>

            <div className="no-print flex items-center justify-end gap-2 border-t border-[var(--color-navy-border)] px-5 py-4">
              <button
                type="button"
                onClick={() => printAdminReport('full')}
                className="payment-history-header__btn payment-history-header__btn--ghost"
              >
                <Printer size={15} />
                Print
              </button>
              <button
                type="button"
                onClick={onClose}
                className="payment-history-header__btn payment-history-header__btn--primary"
              >
                Close
              </button>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      <AdminPrintCanvas variant="full">
        <StatementDocument statement={statement} />
      </AdminPrintCanvas>
    </>,
    document.body,
  );
}
