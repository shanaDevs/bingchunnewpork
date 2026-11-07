'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { FileDown, X } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { branchDisplayName } from '@/components/admin/reports/reportUtils';
import { promoStatusLabel } from '@/lib/promotionAdminLabels';
import type { PromoStore } from '@/lib/promotionBranches';
import {
  buildPromotionReportPrintArgsFromPromo,
  formatBranchAvailabilityDetail,
} from '@/lib/promotionReportFromPromo';
import { printPromotionReport } from '@/lib/promotionReportPrint';
import {
  contributionSourceLabel,
  criteriaLabel,
  parseBranchShareSplits,
  PROMOTION_CONTRIBUTION_SOURCE_OPTIONS,
  PROMOTION_OWNERSHIP_OPTIONS,
  defaultBranchShareSplit,
} from '@/lib/promotionCriteria';
import { buildSharedBranchShareRows } from '@/lib/promotionBranches';
import {
  parsePromoJsonField,
  parsePromoStringArray,
  parsePromoUsageLimits,
  type AdminPromoRow,
} from '@/lib/promotionFormUtils';
import type { PromotionKind, PromotionRules } from '@/lib/promotionTypes';
import { formatPromotionBenefit, formatUsageLimits, kindLabel } from '@/lib/promotionTypes';

type Props = {
  open: boolean;
  onClose: () => void;
  promo: AdminPromoRow | null;
  stores: PromoStore[];
};

function formatDateTime(raw?: string | null): string {
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString('en-LK', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ownershipLabel(raw: string | null | undefined): string {
  const upper = String(raw ?? '').trim().toUpperCase();
  const opt = PROMOTION_OWNERSHIP_OPTIONS.find((o) => o.value === upper);
  return opt?.label ?? (upper || '—');
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="promo-report-sheet__row">
      <span className="promo-report-sheet__label">{label}</span>
      <span className="promo-report-sheet__value">{value}</span>
    </div>
  );
}

export default function PromotionReportSheet({ open, onClose, promo, stores }: Props) {
  const dateLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-LK', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
    [open],
  );

  const printArgs = useMemo(() => {
    if (!promo) return null;
    return buildPromotionReportPrintArgsFromPromo(promo, stores, dateLabel);
  }, [promo, stores, dateLabel]);

  if (!promo) {
    return (
      <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <SheetContent side="right" className="hidden" />
      </Sheet>
    );
  }

  const status = promoStatusLabel(promo);
  const storeIds = parsePromoStringArray(promo.storeIds);
  const ownership = String(promo.ownership ?? '').trim().toUpperCase();
  const isShared = ownership === 'SHARED';
  const splits = parseBranchShareSplits(
    parsePromoJsonField(promo.branchShareSplits, promo.branchShareSplits),
  );
  const fallback = defaultBranchShareSplit(
    promo.branchSharePct != null ? Math.round(Number(promo.branchSharePct)) : '',
    promo.platformSharePct != null ? Math.round(Number(promo.platformSharePct)) : '',
  );
  const tableStoreIds = storeIds.length > 0 ? storeIds : Object.keys(splits);
  const shareRows = isShared
    ? buildSharedBranchShareRows(tableStoreIds, splits, stores, fallback, branchDisplayName)
    : [];
  const contributionSource = promo.contributionSource === 'PLATFORM' ? 'PLATFORM' : 'JASON';
  const contributionOpt = PROMOTION_CONTRIBUTION_SOURCE_OPTIONS.find((o) => o.value === contributionSource);
  const kind = promo.promotionKind as PromotionKind | null | undefined;
  const criteria = parsePromoStringArray(promo.criteria).map((key) => criteriaLabel(key));

  const title = promo.title?.trim() || promo.code;
  const rules = (promo.promotionRules ?? {}) as PromotionRules;
  const benefit = kind
    ? formatPromotionBenefit(kind, rules, promo.discountValue)
    : promo.discountType === 'PERCENTAGE'
      ? `${promo.discountValue}%`
      : `LKR ${promo.discountValue}`;

  function handleExportPdf() {
    if (!printArgs) return;
    printPromotionReport(printArgs);
  }

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="promo-report-sheet w-full max-w-[min(42rem,92vw)] p-0 gap-0 bg-slate-50 text-slate-900 overflow-hidden flex flex-col h-full data-[side=right]:w-[min(42rem,92vw)] data-[side=right]:max-w-[min(42rem,92vw)]"
      >
        <SheetHeader className="border-b border-slate-200 bg-white px-4 py-3 pr-12 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-slate-900">Promotion details</SheetTitle>
              <SheetDescription className="text-slate-500">
                {title} · {promo.code}
              </SheetDescription>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          <div className="rounded-2xl border border-slate-200 bg-[#faf9f6] shadow-sm overflow-hidden relative pt-[3px] before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-[#307ef2]">
            <header className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative h-10 w-10 shrink-0">
                  <Image src="/brand/logo.avif" alt="Bing Chun" fill sizes="40px" className="object-contain" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#0f1428]">Bing Chun Delivery</p>
                  <p className="text-[10px] text-slate-500">Sri Lanka</p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="font-serif text-2xl leading-none text-[#0f1428]">Details</p>
                <p className="text-[11px] text-slate-500 mt-1">Date {dateLabel}</p>
                <p className="text-[11px] text-slate-500">Ref {promo.code}</p>
              </div>
            </header>

            <div className="px-5 pb-5 space-y-4 text-sm">
              <section>
                <h4 className="promo-report-sheet__section-title">Promotion</h4>
                <p className="font-semibold text-[#0f1428] mt-1">{title}</p>
                <DetailRow label="Promo code" value={promo.code} />
                <DetailRow label="Status" value={status} />
                {kind && <DetailRow label="Type" value={kindLabel(kind)} />}
                <DetailRow label="Benefit" value={benefit} />
              </section>

              <section>
                <h4 className="promo-report-sheet__section-title">Schedule &amp; visibility</h4>
                <DetailRow
                  label="Starts"
                  value={promo.startsAt ? formatDateTime(promo.startsAt) : 'Immediately'}
                />
                <DetailRow label="Ends" value={promo.expiresAt ? formatDateTime(promo.expiresAt) : '—'} />
                <DetailRow
                  label="Home page"
                  value={promo.showOnHome !== false ? 'Shown' : 'Hidden'}
                />
              </section>

              <section>
                <h4 className="promo-report-sheet__section-title">Usage</h4>
                <DetailRow
                  label="Redemptions"
                  value={formatUsageLimits(
                    parsePromoUsageLimits(promo.usageLimits, promo.maxUses),
                    promo.usedCount,
                  )}
                />
              </section>

              <section>
                <h4 className="promo-report-sheet__section-title">Ownership &amp; contribution</h4>
                <DetailRow label="Ownership" value={ownershipLabel(promo.ownership)} />
                {isShared && contributionOpt && (
                  <DetailRow label="Contribution parties" value={contributionOpt.label} />
                )}
                <DetailRow
                  label="Branch availability"
                  value={formatBranchAvailabilityDetail(storeIds, stores)}
                />
              </section>

              {isShared && shareRows.length > 0 && (
                <section>
                  <h4 className="promo-report-sheet__section-title">Per-branch cost sharing</h4>
                  <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full min-w-[280px] border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-800 text-white">
                          <th className="px-3 py-2 text-left font-semibold">Branch</th>
                          <th className="px-3 py-2 text-right font-semibold">Branch %</th>
                          <th className="px-3 py-2 text-right font-semibold">
                            {contributionSourceLabel(contributionSource)} %
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {shareRows.map((row, index) => (
                          <tr
                            key={row.storeId}
                            className={index % 2 === 1 ? 'bg-slate-50' : 'bg-white'}
                          >
                            <td className="px-3 py-2 text-slate-800">{row.branchName}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{row.branchSharePct}%</td>
                            <td className="px-3 py-2 text-right tabular-nums">{row.platformSharePct}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <section>
                <h4 className="promo-report-sheet__section-title">Targeting tags</h4>
                {criteria.length === 0 ? (
                  <p className="text-slate-500 mt-1">—</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {criteria.map((tag) => (
                      <span key={tag} className="promo-report-sheet__chip">{tag}</span>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>

        <SheetFooter className="border-t border-slate-200 bg-white px-4 py-3 flex-row justify-end gap-2">
          <button type="button" className="btn-outline px-4 py-2 text-sm" onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5"
            onClick={handleExportPdf}
          >
            <FileDown size={14} aria-hidden />
            Export PDF
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
