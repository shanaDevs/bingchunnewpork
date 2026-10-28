'use client';

import type { ReactNode } from 'react';
import { formatMoneyAmount } from '@/lib/receipt';
import { hasPositiveLkr } from '@/components/admin/settlementTypes';
import {
  resolvePayoutReportValues,
  type PayoutBreakdownDisplayInput,
  type PayoutReportValues,
} from '@/components/admin/resolvePayoutReportValues';

type Props = PayoutBreakdownDisplayInput & {
  /** Precomputed report values — skips a second resolve when the parent already has them. */
  values?: PayoutReportValues | null;
  /** When false, hides the commission breakdown card (calculations unchanged). */
  showCommissionSection?: boolean;
  className?: string;
};

function moneyAmount(value: number): string {
  return formatMoneyAmount(value);
}

function finalLkr(value: number): string {
  return `LKR ${formatMoneyAmount(value)}`;
}

type BreakdownTone = 'default' | 'red' | 'orange' | 'green';

function toneClass(tone: BreakdownTone): string {
  if (tone === 'red') return 'text-red-500';
  if (tone === 'orange') return 'text-orange-500';
  if (tone === 'green') return 'text-emerald-600 dark:text-emerald-400';
  return 'text-[#1e293b] dark:text-slate-100';
}

function BreakdownRow({
  label,
  value,
  bold = false,
  tone = 'default',
  labelTone,
  valueTone,
  hint,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: BreakdownTone;
  labelTone?: BreakdownTone;
  valueTone?: BreakdownTone;
  hint?: string;
}) {
  return (
    <div>
      <div
        className={`flex items-start justify-between gap-3 text-[13px] leading-relaxed ${bold ? 'font-bold' : 'font-medium'}`}
      >
        <span className={`min-w-0 ${toneClass(labelTone ?? tone)}`}>{label}</span>
        <span className={`shrink-0 tabular-nums ${toneClass(valueTone ?? tone)}`}>{value}</span>
      </div>
      {hint && (
        <p className="mt-1.5 text-[10px] font-medium leading-relaxed text-[#64748b] dark:text-slate-400">
          {hint}
        </p>
      )}
    </div>
  );
}

function BreakdownCard({
  title,
  subtitle,
  children,
  className = '',
  contentClassName = 'space-y-3',
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div
      className={`flex flex-col rounded-xl border border-[#e2e8f0] bg-white p-5 dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      <p className="text-[13px] font-bold text-[#1e293b] dark:text-slate-100">{title}</p>
      <p className="mt-0.5 mb-4 text-[11px] font-medium text-[#64748b] dark:text-slate-400">{subtitle}</p>
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

function RefundColumn({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 px-1">
      <p className="mb-3 text-[12px] font-bold text-[#1e293b] dark:text-slate-100">{heading}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function RefundPanel({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] p-4 dark:border-slate-700 dark:bg-slate-800/50">
      <p className="mb-3 text-[12px] font-bold text-[#1e293b] dark:text-slate-100">{heading}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function payoutSectionLayout(showCommissionSection: boolean, showSharedPromo: boolean) {
  const cardCount = (showCommissionSection ? 3 : 2) + (showSharedPromo ? 1 : 0);
  const topGridCols =
    cardCount >= 4
      ? 'lg:grid-cols-2 xl:grid-cols-4'
      : cardCount === 3
        ? 'lg:grid-cols-3'
        : 'lg:grid-cols-2 items-start';
  return {
    topGridCols,
    sharedPromoStep: showCommissionSection ? 4 : 3,
    refundStep: showCommissionSection ? (showSharedPromo ? 5 : 4) : 2,
  };
}

function contributionLabel(label: string, pct: number | null | undefined): string {
  return pct != null ? `${label} (${pct}%)` : label;
}

export default function ApprovePayoutBreakdown({
  showCommissionSection = true,
  className = 'mb-5',
  values: valuesProp,
  ...reportInput
}: Props) {
  const { periodBreakdownLkr, slabRatePct, sharedPromo = null } = reportInput;
  const values = valuesProp ?? resolvePayoutReportValues(reportInput);

  if (!values) {
    if (periodBreakdownLkr) {
      return (
        <div className={`text-[14px] text-[#64748b] dark:text-slate-400 ${className}`}>
          Summary unavailable
        </div>
      );
    }
    return null;
  }

  const {
    grossLkr,
    subtotalBeforeDiscountLkr: resolvedSubtotalBeforeDiscount,
    totalDiscountLkr: resolvedTotalDiscount,
    onlinePaymentsCollectedLkr: resolvedOnlineCollected,
    commissionLkr,
    commissionPaybackLkr,
    sharedPromoPlatformLkr,
    sharedPromoJasonLkr,
    sharedPromoTotalLkr,
    loyaltyDiscountLkr: loyaltyDeductionLkr,
    refundConvenienceFeeLkr,
    rejectedRefundConvenienceFeeLkr,
    netPlatformCommissionLkr,
    netPlatformCommissionForPayoutLkr,
    gatewayLkr,
    gatewayRatePct: resolvedGatewayRatePct,
    gatewayHint,
    branchNetPayoutLkr,
    cancelledByBranchGatewayFeeLkr,
    cancelledByBranchOrderCount,
    customerLateCancelSubtotalLkr,
    customerLateCancelGatewayDeductionLkr,
    customerLateCancelNetAmountLkr,
    rejectedRefundSubtotalLkr,
    rejectedRefundGatewayDeductionLkr,
    rejectedRefundNetAmountLkr,
    showSharedPromo,
    showBranchRefunds,
    showCustomerRefunds,
    showRejectedRefunds,
    showRefundSection,
    showPaybackDetails,
  } = values;

  const { topGridCols, sharedPromoStep, refundStep } = payoutSectionLayout(
    showCommissionSection,
    showSharedPromo,
  );

  const slabLabel = slabRatePct != null ? `${slabRatePct}%` : 'active slab rate';

  const branchRefundRow = showBranchRefunds ? (
    <BreakdownRow
      label={`Gateway fee · ${cancelledByBranchOrderCount} order${cancelledByBranchOrderCount === 1 ? '' : 's'}`}
      value={`- ${finalLkr(cancelledByBranchGatewayFeeLkr)}`}
      valueTone="red"
      hint="Gateway charges for branch-cancelled orders"
    />
  ) : (
    <p className="text-[12px] font-medium text-[#64748b] dark:text-slate-400">None</p>
  );

  const customerRefundRows = showCustomerRefunds ? (
    <>
      <BreakdownRow
        label="Non-returning subtotal"
        value={`+ ${moneyAmount(customerLateCancelSubtotalLkr)}`}
      />
      <BreakdownRow
        label={`Gateway deduction (${resolvedGatewayRatePct}%)`}
        value={`- ${moneyAmount(customerLateCancelGatewayDeductionLkr)}`}
        valueTone="red"
      />
      <div className="border-t border-[#e2e8f0] pt-3 dark:border-slate-700">
        <BreakdownRow
          label="Net recovery added to payout"
          value={`+ ${finalLkr(customerLateCancelNetAmountLkr)}`}
          bold
        />
      </div>
    </>
  ) : (
    <p className="text-[12px] font-medium text-[#64748b] dark:text-slate-400">None</p>
  );

  const rejectedRefundRows = showRejectedRefunds ? (
    <>
      <BreakdownRow
        label="Non-returning subtotal"
        value={`+ ${moneyAmount(rejectedRefundSubtotalLkr)}`}
      />
      <BreakdownRow
        label={`Gateway deduction (${resolvedGatewayRatePct}%)`}
        value={`- ${moneyAmount(rejectedRefundGatewayDeductionLkr)}`}
        valueTone="red"
      />
      <div className="border-t border-[#e2e8f0] pt-3 dark:border-slate-700">
        <BreakdownRow
          label="Net recovery added to payout"
          value={`+ ${finalLkr(rejectedRefundNetAmountLkr)}`}
          bold
        />
      </div>
    </>
  ) : (
    <p className="text-[12px] font-medium text-[#64748b] dark:text-slate-400">None</p>
  );

  const rejectedRefundHeading = 'Rejected refunds (within-window & branch)';

  const refundAdjustmentsContent = showCommissionSection ? (
    <div className="flex flex-col gap-6 md:flex-row md:gap-8">
      <RefundColumn heading="Branch-initiated cancellations">{branchRefundRow}</RefundColumn>

      <div className="hidden w-px shrink-0 self-stretch bg-[#e2e8f0] dark:bg-slate-700 md:block" />

      <RefundColumn heading="Customer late cancellations">{customerRefundRows}</RefundColumn>

      <div className="hidden w-px shrink-0 self-stretch bg-[#e2e8f0] dark:bg-slate-700 md:block" />

      <RefundColumn heading={rejectedRefundHeading}>{rejectedRefundRows}</RefundColumn>
    </div>
  ) : (
    <div className="space-y-3">
      <RefundPanel heading="Branch-initiated cancellations">{branchRefundRow}</RefundPanel>
      <RefundPanel heading="Customer late cancellations">{customerRefundRows}</RefundPanel>
      <RefundPanel heading={rejectedRefundHeading}>{rejectedRefundRows}</RefundPanel>
    </div>
  );

  return (
    <div className={`payout-breakdown space-y-4 ${className}`}>
      <div className={`grid grid-cols-1 gap-4 ${topGridCols}`}>
        <BreakdownCard
          title="1 · Sales"
          subtitle="Sales after promotion"
          contentClassName={showCommissionSection ? 'space-y-3' : 'space-y-4'}
        >
          <BreakdownRow
            label="Item subtotal"
            value={moneyAmount(resolvedSubtotalBeforeDiscount || grossLkr)}
          />
          {resolvedTotalDiscount > 0.001 && (
            <BreakdownRow
              label="- Discounts"
              value={moneyAmount(resolvedTotalDiscount)}
              labelTone="red"
              valueTone="red"
            />
          )}
          <div className={showCommissionSection ? undefined : 'space-y-4'}>
            <div
              className={`border-t border-[#e2e8f0] dark:border-slate-700 ${showCommissionSection ? 'pt-3' : 'pt-4'}`}
            >
              <BreakdownRow label="Gross sales" value={finalLkr(grossLkr)} bold />
            </div>
            {!showCommissionSection && (
              <div className="border-t border-[#e2e8f0] pt-4 dark:border-slate-700">
                <BreakdownRow
                  label="Payment gateway deduction"
                  value={`- ${finalLkr(gatewayLkr)}`}
                  valueTone="red"
                  hint={gatewayHint}
                />
              </div>
            )}
          </div>
        </BreakdownCard>

        {showCommissionSection && (
          <BreakdownCard title="2 · Commission" subtitle={`${slabLabel} of gross sales`}>
            <BreakdownRow label="Branch commission" value={moneyAmount(commissionLkr)} />
            {showPaybackDetails ? (
              <BreakdownRow
                label="Platform discount payback"
                value={moneyAmount(commissionPaybackLkr)}
                valueTone="red"
              />
            ) : (
              <div>
                <div className="flex items-start justify-between gap-3 text-[13px] font-medium leading-relaxed line-through text-[#94a3b8] dark:text-slate-500">
                  <span className="min-w-0">Platform discount payback</span>
                  <span className="shrink-0 tabular-nums">{moneyAmount(commissionPaybackLkr)}</span>
                </div>
                <p className="mt-1.5 text-[10px] font-medium leading-relaxed text-[#64748b] dark:text-slate-400">
                  Platform discount payback is not enabled for this branch.
                </p>
              </div>
            )}
            {hasPositiveLkr(sharedPromoPlatformLkr) && (
              <BreakdownRow
                label="Shared promo platform contribution"
                value={moneyAmount(sharedPromoPlatformLkr)}
                valueTone="red"
              />
            )}
            {hasPositiveLkr(loyaltyDeductionLkr) && (
              <BreakdownRow
                label="Loyalty discount deduction"
                value={moneyAmount(loyaltyDeductionLkr)}
                valueTone="red"
              />
            )}
            {hasPositiveLkr(refundConvenienceFeeLkr) && (
              <BreakdownRow
                label="Completed refund convenience fee"
                value={moneyAmount(refundConvenienceFeeLkr)}
                valueTone="green"
              />
            )}
            {hasPositiveLkr(rejectedRefundConvenienceFeeLkr) && (
              <BreakdownRow
                label="Rejected refund convenience fee"
                value={moneyAmount(rejectedRefundConvenienceFeeLkr)}
                valueTone="green"
              />
            )}
            <div className="border-t border-[#e2e8f0] pt-3 dark:border-slate-700">
              <BreakdownRow
                label="Net platform earnings"
                value={finalLkr(netPlatformCommissionLkr)}
                bold
              />
            </div>
          </BreakdownCard>
        )}

        {showCommissionSection ? (
          <BreakdownCard title="3 · Fees" subtitle="Charges applied to payout">
            <BreakdownRow
              label="Payment gateway deduction"
              value={`- ${finalLkr(gatewayLkr)}`}
              valueTone="red"
              hint={gatewayHint}
            />
          </BreakdownCard>
        ) : (
          <BreakdownCard
            title="2 · Refund adjustments"
            subtitle="Cancellation deductions and customer recovery"
          >
            {refundAdjustmentsContent}
          </BreakdownCard>
        )}

        {showSharedPromo && (
          <BreakdownCard
            title={`${sharedPromoStep} · Shared promotions`}
            subtitle="Cost sharing for shared promos"
          >
            <BreakdownRow label="Total shared promo discount" value={finalLkr(sharedPromoTotalLkr)} />
            <BreakdownRow
              label={contributionLabel('Branch contribution', sharedPromo?.branchContributionPct)}
              value={finalLkr(sharedPromo?.branchContributionLkr ?? 0)}
            />
            {hasPositiveLkr(sharedPromoPlatformLkr) && (
              <BreakdownRow
                label={contributionLabel('Platform contribution', sharedPromo?.platformContributionPct)}
                value={finalLkr(sharedPromoPlatformLkr)}
              />
            )}
            {hasPositiveLkr(sharedPromoJasonLkr) && (
              <BreakdownRow
                label={contributionLabel('Jason contribution', sharedPromo?.jasonContributionPct)}
                value={finalLkr(sharedPromoJasonLkr)}
                valueTone="green"
              />
            )}
          </BreakdownCard>
        )}
      </div>

      {showCommissionSection && showRefundSection && (
        <BreakdownCard
          title={`${refundStep} · Refund adjustments`}
          subtitle="Cancellation deductions and customer recovery"
        >
          {refundAdjustmentsContent}
        </BreakdownCard>
      )}

      <div className="overflow-x-auto rounded-xl border border-[#e2e8f0] bg-white px-5 py-4 dark:border-slate-700 dark:bg-slate-900 lg:px-6">
        <div className="flex min-w-max flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="shrink-0">
            <p className="text-[14px] font-bold text-[#2563eb]">Net payout</p>
            <p className="text-[11px] font-medium text-[#64748b] dark:text-slate-400">
              Final pay amount for this period
            </p>
          </div>

          <div className="flex items-center gap-3 text-[13px] font-bold lg:gap-4">
            <div className="text-center">
              <p className="tabular-nums text-[#1e293b] dark:text-slate-100">
                {moneyAmount(resolvedOnlineCollected)}
              </p>
              <p className="text-[10px] font-medium text-[#1e293b] dark:text-slate-100">Online collected</p>
            </div>
            {netPlatformCommissionForPayoutLkr < -0.001 ? (
              <>
                <span className="font-normal text-[#94a3b8]">+</span>
                <div className="text-center">
                  <p className="tabular-nums text-emerald-600 dark:text-emerald-400">
                    {moneyAmount(Math.abs(netPlatformCommissionForPayoutLkr))}
                  </p>
                  <p className="text-[10px] font-medium text-[#1e293b] dark:text-slate-100">
                    Net platform commission
                  </p>
                </div>
              </>
            ) : (
              <>
                <span className="font-normal text-[#94a3b8]">−</span>
                <div className="text-center">
                  <p className="tabular-nums text-red-500">
                    {moneyAmount(netPlatformCommissionForPayoutLkr)}
                  </p>
                  <p className="text-[10px] font-medium text-[#1e293b] dark:text-slate-100">
                    Net platform commission
                  </p>
                </div>
              </>
            )}
            <span className="font-normal text-[#94a3b8]">−</span>
            <div className="text-center">
              <p className="tabular-nums text-red-500">{moneyAmount(gatewayLkr)}</p>
              <p className="text-[10px] font-medium text-[#1e293b] dark:text-slate-100">Gateway fee</p>
            </div>
            {cancelledByBranchGatewayFeeLkr > 0.001 && (
              <>
                <span className="font-normal text-[#94a3b8]">−</span>
                <div className="text-center">
                  <p className="tabular-nums text-[#1e293b] dark:text-slate-100">
                    {moneyAmount(cancelledByBranchGatewayFeeLkr)}
                  </p>
                  <p className="text-[10px] font-medium text-[#1e293b] dark:text-slate-100">Branch cancellations</p>
                </div>
              </>
            )}
            {customerLateCancelNetAmountLkr > 0.001 && (
              <>
                <span className="font-normal text-[#94a3b8]">+</span>
                <div className="text-center">
                  <p className="tabular-nums text-[#1e293b] dark:text-slate-100">
                    {moneyAmount(customerLateCancelNetAmountLkr)}
                  </p>
                  <p className="text-[10px] font-medium text-[#1e293b] dark:text-slate-100">Customer recovery</p>
                </div>
              </>
            )}
            {rejectedRefundNetAmountLkr > 0.001 && (
              <>
                <span className="font-normal text-[#94a3b8]">+</span>
                <div className="text-center">
                  <p className="tabular-nums text-[#1e293b] dark:text-slate-100">
                    {moneyAmount(rejectedRefundNetAmountLkr)}
                  </p>
                  <p className="text-[10px] font-medium text-[#1e293b] dark:text-slate-100">Rejected refund</p>
                </div>
              </>
            )}
            {hasPositiveLkr(sharedPromoJasonLkr) && (
              <>
                <span className="font-normal text-[#94a3b8]">+</span>
                <div className="text-center">
                  <p className="tabular-nums text-emerald-600 dark:text-emerald-400">
                    {moneyAmount(sharedPromoJasonLkr)}
                  </p>
                  <p className="text-[10px] font-medium text-[#1e293b] dark:text-slate-100">
                    Jason promo top-up
                  </p>
                </div>
              </>
            )}
            <span className="text-[16px] font-normal text-[#2563eb]">=</span>
            <p className="text-[22px] font-bold tabular-nums text-[#2563eb]">
              {finalLkr(
                branchNetPayoutLkr +
                  (hasPositiveLkr(sharedPromoJasonLkr) ? sharedPromoJasonLkr : 0),
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
