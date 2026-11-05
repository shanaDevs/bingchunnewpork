'use client';

import type { ReactNode } from 'react';
import {
  computePlatformProviderReceivableLkr,
  type PlatformProviderReceivableLkr,
  type PlatformProviderReceivableLkrInput,
} from '@bingchun/settlement';
import { formatMoneyAmount } from '@/lib/receipt';

export type { PlatformProviderReceivableLkr };

type Props = {
  /** Backend-locked receivable breakdown (LKR). When set, individual fee props are ignored. */
  breakdownLkr?: PlatformProviderReceivableLkr | null;
  commissionFeeLkr?: number;
  platformPaybackLkr?: number;
  loyaltyDiscountLkr?: number;
  sharedPromoPlatformLkr?: number;
  /** Normal order convenience fee for the period. */
  convenienceFeeLkr?: number;
  normalConvenienceFeeLkr?: number;
  completedRefundConvenienceFeeLkr?: number;
  rejectedRefundConvenienceFeeLkr?: number;
  /** Combined refund convenience fallback when split values are unavailable. */
  refundConvenienceFeeLkr?: number;
  gatewayRatePct?: number;
  /** When false, shared promo platform contribution is not deducted or shown. */
  paybackEnabled?: boolean;
  className?: string;
};

function moneyAmount(value: number): string {
  return formatMoneyAmount(value);
}

function finalLkr(value: number): string {
  return `LKR ${moneyAmount(value)}`;
}

type BreakdownTone = 'default' | 'red' | 'green';

function toneClass(tone: BreakdownTone): string {
  if (tone === 'red') return 'text-red-500';
  if (tone === 'green') return 'text-emerald-600 dark:text-emerald-400';
  return 'text-[#1e293b] dark:text-slate-100';
}

function BreakdownRow({
  label,
  value,
  bold = false,
  valueTone = 'default',
  operator,
  hint,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueTone?: BreakdownTone;
  operator?: '+' | '−';
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-3 text-[13px]">
      <span
        className={`min-w-0 flex-1 ${bold ? 'font-bold text-[#1e293b] dark:text-slate-100' : 'text-[#64748b] dark:text-slate-400'}`}
      >
        {operator ? (
          <>
            <span className="mr-1.5 font-bold tabular-nums text-[#94a3b8]">{operator}</span>
            {label}
          </>
        ) : (
          label
        )}
      </span>
      <span
        className={`shrink-0 tabular-nums ${bold ? 'font-bold' : 'font-semibold'} ${toneClass(valueTone)}`}
      >
        {value}
      </span>
      </div>
      {hint ? (
        <p className="text-[10px] font-medium leading-relaxed text-[#64748b] dark:text-slate-400">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function BreakdownSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="border-t border-[#e2e8f0] px-5 py-4 first:border-t-0 dark:border-slate-700 lg:px-6">
      <p className="mb-3 text-[12px] font-bold text-[#1e293b] dark:text-slate-100">{title}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function buildPreviewInput(props: Props): PlatformProviderReceivableLkrInput {
  return {
    commissionFeeLkr: props.commissionFeeLkr ?? 0,
    platformPaybackLkr: props.platformPaybackLkr,
    loyaltyDiscountLkr: props.loyaltyDiscountLkr,
    sharedPromoPlatformLkr: props.sharedPromoPlatformLkr,
    convenienceFeeLkr: props.convenienceFeeLkr,
    normalConvenienceFeeLkr: props.normalConvenienceFeeLkr,
    completedRefundConvenienceFeeLkr: props.completedRefundConvenienceFeeLkr,
    rejectedRefundConvenienceFeeLkr: props.rejectedRefundConvenienceFeeLkr,
    refundConvenienceFeeLkr: props.refundConvenienceFeeLkr,
    gatewayRatePct: props.gatewayRatePct ?? 1.9,
    paybackEnabled: props.paybackEnabled,
  };
}

function lockedLkrToInput(
  locked: PlatformProviderReceivableLkr,
  paybackEnabled: boolean | undefined,
  sharedPromoPlatformLkr?: number,
): PlatformProviderReceivableLkrInput {
  return {
    commissionFeeLkr: locked.commissionFeeLkr,
    platformPaybackLkr: locked.platformPaybackLkr,
    loyaltyDiscountLkr: locked.loyaltyDiscountLkr,
    sharedPromoPlatformLkr: sharedPromoPlatformLkr ?? locked.sharedPromoPlatformLkr,
    normalConvenienceFeeLkr: locked.normalConvenienceFeeLkr,
    completedRefundConvenienceFeeLkr: locked.completedRefundConvenienceFeeLkr,
    rejectedRefundConvenienceFeeLkr: locked.rejectedRefundConvenienceFeeLkr,
    gatewayRatePct: locked.gatewayRatePct,
    paybackEnabled,
  };
}

export default function PlatformProviderReceivable({
  breakdownLkr = null,
  commissionFeeLkr = 0,
  platformPaybackLkr = 0,
  loyaltyDiscountLkr = 0,
  sharedPromoPlatformLkr = 0,
  convenienceFeeLkr = 0,
  normalConvenienceFeeLkr,
  completedRefundConvenienceFeeLkr,
  rejectedRefundConvenienceFeeLkr,
  refundConvenienceFeeLkr,
  gatewayRatePct = 1.9,
  paybackEnabled,
  className = 'mb-5',
}: Props) {
  const resolvedPaybackEnabled =
    paybackEnabled ?? (breakdownLkr ? breakdownLkr.platformPaybackLkr > 0.001 : true);

  let breakdown: PlatformProviderReceivableLkr;
  if (breakdownLkr) {
    if (paybackEnabled != null) {
      breakdown = computePlatformProviderReceivableLkr(
        lockedLkrToInput(breakdownLkr, paybackEnabled, sharedPromoPlatformLkr),
      );
    } else {
      breakdown = breakdownLkr;
    }
  } else {
    breakdown = computePlatformProviderReceivableLkr(
      buildPreviewInput({
        commissionFeeLkr,
        platformPaybackLkr,
        loyaltyDiscountLkr,
        sharedPromoPlatformLkr,
        convenienceFeeLkr,
        normalConvenienceFeeLkr,
        completedRefundConvenienceFeeLkr,
        rejectedRefundConvenienceFeeLkr,
        refundConvenienceFeeLkr,
        gatewayRatePct,
        paybackEnabled: resolvedPaybackEnabled,
      }),
    );
  }
  const displayGatewayRatePct = breakdown.gatewayRatePct ?? gatewayRatePct;
  const sppcNotDeducted = !resolvedPaybackEnabled && breakdown.sharedPromoPlatformLkr > 0.001;

  return (
    <div className={`platform-provider-receivable space-y-4 ${className}`}>
      <div>
        <h3 className="text-[15px] font-bold text-[#1e293b] dark:text-slate-100">
          Platform provider receivable
        </h3>
        <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-[#64748b] dark:text-slate-400">
          Complete platform provider calculation from locked payout snapshot — refund convenience
          fees are platform income and are not deducted from branch payout.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#e2e8f0] bg-white dark:border-slate-700 dark:bg-slate-900">
        <BreakdownSection title="1 · Net platform commission">
          <BreakdownRow label="Branch commission" value={finalLkr(breakdown.commissionFeeLkr)} />
          <BreakdownRow
            label="Platform discount payback"
            value={finalLkr(breakdown.platformPaybackLkr)}
            valueTone="red"
            operator="−"
          />
          <BreakdownRow
            label="Loyalty discount deduction"
            value={finalLkr(breakdown.loyaltyDiscountLkr)}
            valueTone="red"
            operator="−"
          />
          <BreakdownRow
            label="Shared promo platform contribution"
            value={finalLkr(breakdown.sharedPromoPlatformLkr)}
            valueTone={sppcNotDeducted ? 'default' : 'red'}
            operator={sppcNotDeducted ? undefined : '−'}
            hint={
              sppcNotDeducted
                ? 'Not deducted — Platform Discount Payback is disabled for this branch.'
                : undefined
            }
          />
          <div className="border-t border-[#e2e8f0] pt-3 dark:border-slate-700">
            <BreakdownRow
              label="Net platform commission"
              value={finalLkr(breakdown.netPlatformCommissionLkr)}
              bold
            />
          </div>
        </BreakdownSection>

        <BreakdownSection title="2 · Net platform earnings">
          <BreakdownRow
            label="Net platform commission"
            value={finalLkr(breakdown.netPlatformCommissionLkr)}
          />
          <BreakdownRow
            label="Completed refund convenience fee"
            value={finalLkr(breakdown.completedRefundConvenienceFeeLkr)}
            valueTone="green"
            operator="+"
          />
          <BreakdownRow
            label="Rejected refund convenience fee"
            value={finalLkr(breakdown.rejectedRefundConvenienceFeeLkr)}
            valueTone="green"
            operator="+"
          />
          <div className="border-t border-[#e2e8f0] pt-3 dark:border-slate-700">
            <BreakdownRow
              label="Net platform earnings"
              value={finalLkr(breakdown.netPlatformEarningsLkr)}
              bold
            />
          </div>
        </BreakdownSection>

        <BreakdownSection title="3 · Eligible platform provider amount">
          <BreakdownRow
            label="Net platform earnings"
            value={finalLkr(breakdown.netPlatformEarningsLkr)}
          />
          <BreakdownRow
            label="Normal order convenience fee"
            value={finalLkr(breakdown.normalConvenienceFeeLkr)}
            valueTone="green"
            operator="+"
          />
          <div className="border-t border-[#e2e8f0] pt-3 dark:border-slate-700">
            <BreakdownRow
              label="Eligible platform provider amount"
              value={finalLkr(breakdown.eligibleProviderAmountLkr)}
              bold
            />
          </div>
        </BreakdownSection>

        <div className="border-t border-[#e2e8f0] px-5 py-4 dark:border-slate-700 lg:px-6">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[13px] font-bold text-[#1e293b] dark:text-slate-100">
                Gateway deduction ({displayGatewayRatePct}%)
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-[#64748b] dark:text-slate-400">
                {moneyAmount(breakdown.eligibleProviderAmountLkr)} × {displayGatewayRatePct}%
              </p>
            </div>
            <p className="shrink-0 text-[20px] font-bold tabular-nums text-red-500 sm:text-[22px]">
              − {finalLkr(breakdown.gatewayDeductionLkr)}
            </p>
          </div>
        </div>

        <div className="border-t border-[#e2e8f0] bg-[#eff6ff] px-5 py-4 dark:border-slate-700 dark:bg-blue-950/30 lg:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[14px] font-bold text-[#1e293b] dark:text-slate-100">
                Total platform provider receivable
              </p>
              <p className="mt-0.5 text-[11px] font-medium text-[#64748b] dark:text-slate-400">
                {moneyAmount(breakdown.eligibleProviderAmountLkr)} −{' '}
                {moneyAmount(breakdown.gatewayDeductionLkr)}
              </p>
            </div>
            <p className="text-[24px] font-bold tabular-nums text-[#2563eb] dark:text-blue-400">
              {finalLkr(breakdown.totalPlatformProviderReceivableLkr)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
