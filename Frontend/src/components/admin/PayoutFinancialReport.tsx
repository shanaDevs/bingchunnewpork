'use client';

import { hasAnyPositiveLkr, hasPositiveLkr } from '@/components/admin/settlementTypes';
import {
  resolveFinalNetPayoutPayLkr,
  type PayoutReportValues,
} from '@/components/admin/resolvePayoutReportValues';
import { finalLkr, plainAmount, signedAmount } from '@/components/admin/payoutFinancialReportFormatting';
import {
  CommissionInfoPopover,
  DiscountDetailsInfoPopover,
  NetBranchPayoutInfoPopover,
  NetPlatformAmountInfoPopover,
  OnlineWalletInfoPopover,
  RefundsInfoPopover,
  TotalSaleInfoPopover,
} from '@/components/admin/payoutFinancialReportInfoPopovers';
import {
  ReportRow,
  ReportSection,
  ReportSubtotalRow,
  ReportTotalRow,
} from '@/components/admin/payoutFinancialReportUi';
import {
  PAYOUT_FIRST_CYCLE_BODY,
  PAYOUT_FIRST_CYCLE_DEFERRED_SECTION,
  PAYOUT_FIRST_CYCLE_HEADLINE,
  PAYOUT_FIRST_ONLINE_COLLECTIONS_SECTION_HINT,
  PAYOUT_FIRST_ONLINE_COLLECTIONS_TITLE,
  PAYOUT_FIRST_ONLINE_COLLECTIONS_TOTAL_LABEL,
  PAYOUT_FIRST_ONLINE_DELIVERY_SUBTOTAL_LABEL,
  PAYOUT_FIRST_ONLINE_PICKUP_SUBTOTAL_LABEL,
} from '@/components/admin/payoutFirstCycleCopy';

type Props = {
  values: PayoutReportValues;
  className?: string;
};

export default function PayoutFinancialReport({ values, className = 'mb-4' }: Props) {
  const isFirstCyclePayout = values.cycleStage === 'FIRST';
  const hasRefundSection =
    !isFirstCyclePayout &&
    hasAnyPositiveLkr(
      values.nonReturningRefundsBranchLkr,
      values.nonReturningRefundsBranchGrossLkr,
      values.platformRefundsLkr,
      values.deliveryRefundsLkr,
      values.totalRefundAmountLkr,
      values.totalRefundAmountGrossLkr,
    );
  const hasNetPlatformBreakdown =
    !isFirstCyclePayout &&
    hasAnyPositiveLkr(
      values.commissionLkr,
      values.platformDiscountsReportLkr,
      values.loyaltyDiscountLkr,
    );
  const hasNetBranchBreakdown = hasAnyPositiveLkr(
    values.onlinePaymentsCollectedLkr,
    values.jasonDiscountsLkr,
    values.priorOnlineWalletAmountLkr,
    values.nonReturningRefundsBranchGrossLkr,
    values.netPlatformAmountLkr,
    values.gatewayLkr,
    values.cancelledByBranchGatewayFeeLkr,
  );

  return (
    <div
      className={`overflow-hidden rounded-xl border border-[#e2e8f0] bg-white dark:border-slate-700 dark:bg-slate-900 ${className}`}
    >
      {isFirstCyclePayout ? (
        <div className="border-b border-[#e2e8f0] bg-[#eff6ff] px-4 py-3 dark:border-slate-700 dark:bg-blue-950/30">
          <p className="text-[13px] font-bold text-[#1e40af] dark:text-blue-300">
            {PAYOUT_FIRST_CYCLE_HEADLINE}
          </p>
          <p className="mt-1.5 text-[12px] font-medium leading-relaxed text-[#475569] dark:text-slate-300">
            {PAYOUT_FIRST_CYCLE_BODY}
          </p>
        </div>
      ) : null}
      <ReportSection
        title="Total Sale"
        amount={plainAmount(values.grossLkr)}
        info={<TotalSaleInfoPopover values={values} />}
      />
      <ReportSection
        title={
          isFirstCyclePayout ? PAYOUT_FIRST_ONLINE_COLLECTIONS_TITLE : 'Online Wallet Amount'
        }
        amount={plainAmount(values.onlinePaymentsCollectedLkr)}
        info={<OnlineWalletInfoPopover values={values} />}
      />
      <ReportSection
        title="Commission"
        amount={isFirstCyclePayout ? '—' : plainAmount(values.commissionLkr)}
        info={<CommissionInfoPopover values={values} />}
      />

      {isFirstCyclePayout ? (
        <ReportSection title="Discounts & platform share" amount="—">
          <p className="text-[12px] font-medium leading-relaxed text-[#64748b] dark:text-slate-400">
            {PAYOUT_FIRST_CYCLE_DEFERRED_SECTION}
          </p>
        </ReportSection>
      ) : (
        <ReportSection
          title="Discounts"
          amount={plainAmount(values.totalProvidedDiscountsLkr)}
          info={<DiscountDetailsInfoPopover values={values} />}
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
      )}

      {hasRefundSection && (
        <ReportSection title="Refunds" info={<RefundsInfoPopover values={values} />}>
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

      <ReportSection
        title="Net Platform Amount"
        info={<NetPlatformAmountInfoPopover values={values} />}
      >
        {isFirstCyclePayout ? (
          <p className="text-[12px] font-medium leading-relaxed text-[#64748b] dark:text-slate-400">
            {PAYOUT_FIRST_CYCLE_DEFERRED_SECTION} Commission, platform discounts, and loyalty for
            the full cycle are reconciled in Payout 2.
          </p>
        ) : (
          <>
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
          </>
        )}
      </ReportSection>

      <ReportSection
        title="Net Branch Payout"
        info={<NetBranchPayoutInfoPopover values={values} />}
      >
        {hasNetBranchBreakdown && (
          <>
            {hasPositiveLkr(values.onlinePaymentsCollectedLkr) && (
              <ReportRow
                label={
                  isFirstCyclePayout
                    ? PAYOUT_FIRST_ONLINE_COLLECTIONS_TOTAL_LABEL
                    : 'Online Wallet Amount'
                }
                value={plainAmount(values.onlinePaymentsCollectedLkr)}
              />
            )}
            {!isFirstCyclePayout && hasPositiveLkr(values.priorOnlineWalletAmountLkr) && (
              <ReportRow
                label="- Online Wallet Amount (Payout 1)"
                value={signedAmount(values.priorOnlineWalletAmountLkr, '−')}
                valueTone="red"
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

      <ReportTotalRow
        label="Net payout (final pay amount)"
        value={finalLkr(resolveFinalNetPayoutPayLkr(values))}
      />
    </div>
  );
}
