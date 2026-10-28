'use client';

import { type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { formatMoneyAmount } from '@/lib/receipt';
import { hasAnyPositiveLkr, hasPositiveLkr } from '@/components/admin/settlementTypes';
import type { PayoutReportValues } from '@/components/admin/resolvePayoutReportValues';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';

type Props = {
  values: PayoutReportValues;
  className?: string;
};

type RowTone = 'default' | 'red';
type Indent = 0 | 1 | 2;

function toneClass(tone: RowTone): string {
  if (tone === 'red') return 'text-red-500';
  return 'text-[#1e293b] dark:text-slate-100';
}

function finalLkr(value: number): string {
  return `LKR ${formatMoneyAmount(value)}`;
}

function plainAmount(value: number): string {
  return formatMoneyAmount(value);
}

function signedAmount(value: number, sign: '+' | '−'): string {
  return `${sign} ${plainAmount(value)}`;
}

function ReportRow({
  label,
  value,
  bold = false,
  indent = 0,
  valueTone = 'default',
  hint,
}: {
  label: string;
  value: string;
  bold?: boolean;
  indent?: Indent;
  valueTone?: RowTone;
  hint?: string;
}) {
  const indentClass = indent === 2 ? 'pl-8' : indent === 1 ? 'pl-4' : '';
  return (
    <div
      className={`flex items-start justify-between gap-3 text-[13px] leading-relaxed ${bold ? 'font-bold' : 'font-medium'} ${indentClass}`}
    >
      <div className="min-w-0">
        <span className="text-[#475569] dark:text-slate-300">{label}</span>
        {hint ? (
          <p className="mt-0.5 text-[10px] font-medium leading-relaxed text-[#94a3b8] dark:text-slate-500">
            {hint}
          </p>
        ) : null}
      </div>
      <span className={`shrink-0 tabular-nums ${toneClass(valueTone)}`}>{value}</span>
    </div>
  );
}

function ReportGroupHeading({ children }: { children: ReactNode }) {
  return (
    <p className="pl-4 pt-1 text-[13px] font-medium text-[#475569] dark:text-slate-300">
      {children}
    </p>
  );
}

function ReportSubtotalRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-t border-[#e2e8f0] pt-3 dark:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] font-bold text-[#1e293b] dark:text-slate-100">{label}</p>
        <p className="shrink-0 text-[13px] font-bold tabular-nums text-[#1e293b] dark:text-slate-100">
          {value}
        </p>
      </div>
    </div>
  );
}

function ReportSection({
  title,
  amount,
  titleAccessory,
  children,
}: {
  title: string;
  amount?: string;
  titleAccessory?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-[#e2e8f0] px-5 py-4 last:border-b-0 dark:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="text-[14px] font-bold text-[#1e293b] dark:text-slate-100">{title}</p>
          {titleAccessory}
        </div>
        {amount != null && (
          <p className="shrink-0 text-[14px] font-bold tabular-nums text-[#1e293b] dark:text-slate-100">
            {amount}
          </p>
        )}
      </div>
      {children ? <div className="mt-3 space-y-2.5">{children}</div> : null}
    </div>
  );
}

function ReportTotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t-2 border-[#2563eb]/30 bg-[#eff6ff]/40 px-5 py-5 dark:border-blue-500/30 dark:bg-blue-950/20">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[16px] font-bold text-[#2563eb]">{label}</p>
        <p className="text-[22px] font-bold tabular-nums text-[#2563eb]">{value}</p>
      </div>
    </div>
  );
}

function DiscountDetailsHoverCard({ values }: { values: PayoutReportValues }) {
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={100}
        closeDelay={200}
        aria-label="Discount calculation details"
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[#2563eb] transition-colors hover:bg-[#2563eb]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/40"
        render={<button type="button" />}
      >
        <Info className="size-4" aria-hidden />
      </HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        sideOffset={12}
        positionerClassName="z-[10050]"
        className="z-[10050] w-[min(32rem,calc(100vw-3rem))] max-h-[min(28rem,75vh)] space-y-2.5 overflow-y-auto p-4"
      >
        <div>
          <p className="text-[13px] font-bold text-[#1e293b] dark:text-slate-100">
            Discount calculation
          </p>
          <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#64748b] dark:text-slate-400">
            Total Provided = promotion discounts (owned + shared) + loyalty + other
            untracked discounts.
          </p>
        </div>

        <div className="space-y-2 border-t border-[#e2e8f0] pt-2.5 dark:border-slate-700">
          <ReportRow
            label="Branch-owned Promotion Discounts"
            value={plainAmount(values.branchOwnedPromoDiscountsLkr)}
          />
          <ReportRow
            label="Platform-owned Promotion Discounts"
            value={plainAmount(values.platformOwnedPromoDiscountsLkr)}
          />
          <ReportGroupHeading>Shared Promotion Discounts</ReportGroupHeading>
          <ReportRow
            label="Branch Contribution"
            value={plainAmount(values.branchDiscountsLkr)}
            indent={1}
          />
          <ReportRow
            label="Platform Contribution"
            value={plainAmount(values.platformDiscountsLkr)}
            indent={1}
          />
          <ReportRow
            label="Jason Contribution"
            value={plainAmount(values.jasonDiscountsLkr)}
            indent={1}
          />
          <ReportRow
            label="Total Shared Promotion Discounts"
            value={plainAmount(values.totalSharedPromoDiscountsLkr)}
            bold
            indent={1}
          />
          <ReportRow
            label="Total Promotion Discounts"
            value={plainAmount(values.totalPromotionDiscountsLkr)}
            bold
            hint="Owned branch + owned platform + shared total"
          />
          <ReportRow
            label="Loyalty Points by Platform"
            value={plainAmount(values.loyaltyDiscountLkr)}
          />
          <ReportRow
            label="Other Discounts (not in promotion records)"
            value={plainAmount(values.untrackedDiscountsLkr)}
            hint="Total provided − promotion totals − loyalty"
          />
          <ReportRow
            label="Total Provided Discounts"
            value={plainAmount(values.totalProvidedDiscountsLkr)}
            bold
          />
        </div>

        <div className="space-y-1.5 border-t border-[#e2e8f0] pt-2.5 dark:border-slate-700">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8] dark:text-slate-500">
            Cost partner rollup
          </p>
          <ReportRow
            label="Branch"
            value={plainAmount(values.costPartnerBranchDiscountsLkr)}
            hint="Owned branch + shared branch"
          />
          <ReportRow
            label="Platform"
            value={plainAmount(values.costPartnerPlatformDiscountsLkr)}
            hint="Owned platform + shared platform + loyalty"
          />
          <ReportRow
            label="Jason"
            value={plainAmount(values.costPartnerJasonDiscountsLkr)}
            hint="Shared Jason contribution"
          />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export default function PayoutFinancialReport({ values, className = 'mb-4' }: Props) {
  const hasRefundSection = hasAnyPositiveLkr(
    values.nonReturningRefundsBranchLkr,
    values.nonReturningRefundsBranchGrossLkr,
    values.platformRefundsLkr,
    values.deliveryRefundsLkr,
    values.totalRefundAmountLkr,
    values.totalRefundAmountGrossLkr,
  );
  const hasNetPlatformBreakdown = hasAnyPositiveLkr(
    values.commissionLkr,
    values.platformDiscountsReportLkr,
    values.loyaltyDiscountLkr,
  );
  const hasNetBranchBreakdown = hasAnyPositiveLkr(
    values.onlinePaymentsCollectedLkr,
    values.jasonDiscountsLkr,
    values.nonReturningRefundsBranchGrossLkr,
    values.netPlatformAmountLkr,
    values.gatewayLkr,
    values.cancelledByBranchGatewayFeeLkr,
  );

  return (
    <div
      className={`overflow-hidden rounded-xl border border-[#e2e8f0] bg-white dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      <ReportSection title="Total Sale" amount={plainAmount(values.grossLkr)} />
      <ReportSection
        title="Online Wallet Amount"
        amount={plainAmount(values.onlinePaymentsCollectedLkr)}
      />
      <ReportSection title="Commission" amount={plainAmount(values.commissionLkr)} />

      <ReportSection
        title="Discounts"
        amount={plainAmount(values.totalProvidedDiscountsLkr)}
        titleAccessory={<DiscountDetailsHoverCard values={values} />}
      >
        <ReportRow
          label="Branch"
          value={plainAmount(values.costPartnerBranchDiscountsLkr)}
          indent={1}
        />
        <ReportRow
          label="Platform"
          value={plainAmount(values.costPartnerPlatformDiscountsLkr)}
          indent={1}
        />
        <ReportRow
          label="Jason"
          value={plainAmount(values.costPartnerJasonDiscountsLkr)}
          indent={1}
        />
        <ReportRow
          label="Total by Cost Partner"
          value={plainAmount(values.costPartnerDiscountsTotalLkr)}
          indent={1}
          bold
        />
      </ReportSection>

      {hasRefundSection && (
        <ReportSection title="Refunds">
          {hasPositiveLkr(values.nonReturningRefundsBranchGrossLkr) && (
            <ReportRow
              label="Non-returning refunds (Branch)"
              value={plainAmount(values.nonReturningRefundsBranchGrossLkr)}
              indent={1}
            />
          )}
          {hasPositiveLkr(values.platformRefundsLkr) && (
            <ReportRow
              label="Platform Refunds"
              value={plainAmount(values.platformRefundsLkr)}
              indent={1}
            />
          )}
          {hasPositiveLkr(values.deliveryRefundsLkr) && (
            <ReportRow
              label="Delivery Refunds"
              value={plainAmount(values.deliveryRefundsLkr)}
              indent={1}
            />
          )}
          {hasPositiveLkr(values.totalRefundAmountGrossLkr) && (
            <ReportRow
              label="Total Refund Amount"
              value={plainAmount(values.totalRefundAmountGrossLkr)}
              indent={1}
              bold
            />
          )}
        </ReportSection>
      )}

      <ReportSection title="Net Platform Amount">
        {hasNetPlatformBreakdown && (
          <>
            {hasPositiveLkr(values.commissionLkr) && (
              <ReportRow label="Commission" value={plainAmount(values.commissionLkr)} indent={1} />
            )}
            {hasPositiveLkr(values.platformDiscountsReportLkr) && (
              <ReportRow
                label="- Platform Discounts"
                value={signedAmount(values.platformDiscountsReportLkr, '−')}
                indent={1}
                valueTone="red"
              />
            )}
            {hasPositiveLkr(values.loyaltyDiscountLkr) && (
              <ReportRow
                label="- Loyalty Points by Platform"
                value={signedAmount(values.loyaltyDiscountLkr, '−')}
                indent={1}
                valueTone="red"
              />
            )}
          </>
        )}
        <ReportSubtotalRow
          label="Net Platform Amount"
          value={plainAmount(values.netPlatformAmountLkr)}
        />
      </ReportSection>

      <ReportSection title="Net Branch Payout">
        {hasNetBranchBreakdown && (
          <>
            {hasPositiveLkr(values.onlinePaymentsCollectedLkr) && (
              <ReportRow
                label="Online Wallet Amount"
                value={plainAmount(values.onlinePaymentsCollectedLkr)}
              />
            )}
            {hasPositiveLkr(values.jasonDiscountsLkr) && (
              <ReportRow
                label="+ Jason Discounts"
                value={signedAmount(values.jasonDiscountsLkr, '+')}
              />
            )}
            {hasPositiveLkr(values.nonReturningRefundsBranchGrossLkr) && (
              <ReportRow
                label="+ Non-returning refunds (Branch)"
                value={signedAmount(values.nonReturningRefundsBranchGrossLkr, '+')}
              />
            )}
            {hasPositiveLkr(values.netPlatformAmountLkr) && (
              <ReportRow
                label="- Net Platform Amount"
                value={signedAmount(values.netPlatformAmountLkr, '−')}
                valueTone="red"
              />
            )}
            {hasPositiveLkr(values.gatewayLkr) && (
              <ReportRow
                label={`- Payment Gateway Fee ${values.gatewayRatePct}%`}
                value={signedAmount(values.gatewayLkr, '−')}
                valueTone="red"
              />
            )}
            {hasPositiveLkr(values.cancelledByBranchGatewayFeeLkr) && (
              <ReportRow
                label="- Bank penalty (branch cancellation)"
                value={signedAmount(values.cancelledByBranchGatewayFeeLkr, '−')}
                valueTone="red"
                hint={
                  values.cancelledByBranchOrderCount > 0
                    ? `LKR 150 × ${values.cancelledByBranchOrderCount} order${
                        values.cancelledByBranchOrderCount === 1 ? '' : 's'
                      }`
                    : 'LKR 150 per branch-cancelled paid order (refund completed)'
                }
              />
            )}
          </>
        )}
      </ReportSection>

      {hasPositiveLkr(values.sharedPromoJasonLkr) && (
        <ReportRow
          label="+ Jason promo top-up"
          value={finalLkr(values.sharedPromoJasonLkr)}
        />
      )}
      <ReportTotalRow
        label="Net payout (final pay amount)"
        value={finalLkr(
          values.branchNetPayoutLkr +
            (hasPositiveLkr(values.sharedPromoJasonLkr) ? values.sharedPromoJasonLkr : 0),
        )}
      />
    </div>
  );
}
