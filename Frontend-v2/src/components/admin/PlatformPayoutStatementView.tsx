'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Building2, X } from 'lucide-react';
import toast from 'react-hot-toast';

import PlatformProviderReceivable from '@/components/admin/PlatformProviderReceivable';
import { settlementStatusLabel } from '@/components/admin/settlementTypes';
import type { PlatformPayoutStatement } from '@/lib/platformPayoutStatement';
import {
  openCommissionSettlementReceipt,
  openPayoutProofById,
  openPlatformProviderSettlementInvoice,
  openWithdrawalInvoice,
} from '@/lib/adminProtectedFile';
import { platformPayoutInvoiceSettlementId } from '@/lib/platformPayoutInvoice';
import { formatMoney } from '@/lib/receipt';

type Props = {
  statement: PlatformPayoutStatement | null;
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

function invoiceTargets(statement: PlatformPayoutStatement) {
  const settlementId = platformPayoutInvoiceSettlementId({
    id: statement.id,
    platformInvoiceUrl: statement.platformInvoiceUrl,
  });
  const platformInvoiceUrl = statement.platformInvoiceUrl?.trim() ?? '';
  const canOpenInvoice = Boolean(platformInvoiceUrl || settlementId);
  return { settlementId, platformInvoiceUrl, canOpenInvoice };
}

async function openPlatformStatementInvoice(statement: PlatformPayoutStatement): Promise<void> {
  const { settlementId, platformInvoiceUrl } = invoiceTargets(statement);
  if (platformInvoiceUrl) {
    await openWithdrawalInvoice(platformInvoiceUrl);
    return;
  }
  if (settlementId) {
    await openPlatformProviderSettlementInvoice(settlementId);
    return;
  }
  throw new Error('No invoice available');
}

const NO_RECEIPT_MESSAGE = 'No payment receipt was uploaded for this payout.';

async function openPlatformStatementReceipt(statement: PlatformPayoutStatement): Promise<void> {
  if (!statement.hasReceipt) {
    throw new Error(NO_RECEIPT_MESSAGE);
  }
  const settlementId = invoiceTargets(statement).settlementId;
  if (settlementId) {
    try {
      await openCommissionSettlementReceipt(settlementId);
      return;
    } catch {
      /* platform payment proof may be on the branch withdrawal */
    }
  }
  const withdrawalId = statement.storeWithdrawalId?.trim();
  if (withdrawalId) {
    await openPayoutProofById('withdrawal', withdrawalId, { storeId: statement.storeId });
    return;
  }
  throw new Error(NO_RECEIPT_MESSAGE);
}

export default function PlatformPayoutStatementView({ statement, onClose }: Props) {
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

  const { canOpenInvoice } = invoiceTargets(statement);
  const canOpenReceipt = statement.hasReceipt === true;

  return createPortal(
    <>
      <AnimatePresence>
        <motion.div
          key="platform-payout-statement-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[1300] bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden
        />
        <motion.div
          key="platform-payout-statement-dialog"
          role="dialog"
          aria-modal
          aria-label="Platform payout breakdown"
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          className="fixed inset-0 z-[1301] flex items-center justify-center p-4"
          onClick={onClose}
        >
          <div
            className="card flex max-h-[min(92vh,900px)] w-full max-w-3xl flex-col overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-navy-border)] px-5 py-4">
              <div className="flex min-w-0 items-start gap-3">
                <div className="mt-0.5 rounded-full bg-[var(--color-brand-subtle)] p-2 text-[var(--color-brand)]">
                  <Building2 size={22} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-[var(--color-text)]">
                    Platform Payout Breakdown
                  </h2>
                  <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">
                    {formatPeriod(statement.period.from, statement.period.to)} ·{' '}
                    {settlementStatusLabel(statement.status as 'VERIFIED')}
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
                      Paid{' '}
                      {new Date(statement.submittedAt).toLocaleDateString('en-LK', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </p>
                  </div>
                </div>
                <div className="mt-4 border-t border-[var(--color-navy-border)] pt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                    Total platform provider receivable
                  </p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-brand)]">
                    {formatMoney(statement.platformReceivable)}
                  </p>
                </div>
              </div>

              <PlatformProviderReceivable
                breakdownLkr={statement.platformProviderReceivable.lkr}
                paybackEnabled={statement.platformDiscountPaybackEnabled}
                sharedPromoPlatformLkr={statement.sharedPromoPlatformLkr}
              />

              <div className="mt-4 flex flex-wrap gap-3">
                {canOpenInvoice ? (
                  <button
                    type="button"
                    onClick={() => {
                      void openPlatformStatementInvoice(statement).catch(() => {
                        toast.error('Could not open invoice');
                      });
                    }}
                    className="rounded-lg border border-[var(--color-navy-border)] px-3 py-2 text-sm font-medium text-[var(--color-brand)] hover:bg-[var(--color-input-bg)]"
                  >
                    View platform invoice PDF
                  </button>
                ) : null}
                {canOpenReceipt ? (
                  <button
                    type="button"
                    onClick={() => {
                      void openPlatformStatementReceipt(statement).catch((err) => {
                        toast.error(err instanceof Error ? err.message : 'Could not open payment receipt');
                      });
                    }}
                    className="rounded-lg border border-[var(--color-navy-border)] px-3 py-2 text-sm font-medium text-[var(--color-brand)] hover:bg-[var(--color-input-bg)]"
                  >
                    View receipt
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-end border-t border-[var(--color-navy-border)] px-5 py-4">
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
    </>,
    document.body,
  );
}
