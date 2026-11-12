'use client';

import { hasPositiveLkr } from '@/components/admin/settlementTypes';
import type { PayoutReportValues } from '@/components/admin/resolvePayoutReportValues';
import { plainAmount, signedAmount } from '@/components/admin/payoutFinancialReportFormatting';
import {
  InfoFormulaLine,
  InfoPopoverHeader,
  ReportGroupHeading,
  ReportRow,
  SectionInfoPopover,
} from '@/components/admin/payoutFinancialReportUi';
import {
  PAYOUT_FIRST_ONLINE_COLLECTIONS_SECTION_HINT,
  PAYOUT_FIRST_ONLINE_COLLECTIONS_TITLE,
  PAYOUT_FIRST_ONLINE_COLLECTIONS_TOTAL_LABEL,
  PAYOUT_FIRST_ONLINE_DELIVERY_SUBTOTAL_LABEL,
  PAYOUT_FIRST_ONLINE_PICKUP_SUBTOTAL_LABEL,
  PAYOUT_FIRST_CYCLE_COMMISSION_INFO_DESCRIPTION,
  PAYOUT_FIRST_CYCLE_DEFERRED_SECTION,
  PAYOUT_FIRST_CYCLE_NET_PLATFORM_INFO_DESCRIPTION,
} from '@/components/admin/payoutFirstCycleCopy';

export function DiscountDetailsInfoPopover({ values }: { values: PayoutReportValues }) {
  if (values.cycleStage === 'FIRST') {
    return (
      <SectionInfoPopover ariaLabel="Discounts & platform share — Payout 1">
        <InfoPopoverHeader
          title="Discounts & platform share"
          description={PAYOUT_FIRST_CYCLE_DEFERRED_SECTION}
        />
      </SectionInfoPopover>
    );
  }

  return (
    <SectionInfoPopover ariaLabel="Discount calculation details">
      <InfoPopoverHeader
        title="Discount calculation"
        description="Total Provided = promotion discounts (owned + shared) + loyalty + other untracked discounts."
      />
      <InfoFormulaLine>
        Total Provided = {plainAmount(values.totalProvidedDiscountsLkr)} (shown as Discounts)
      </InfoFormulaLine>

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
        <ReportRow
          label="Total by Cost Partner"
          value={plainAmount(values.costPartnerDiscountsTotalLkr)}
          bold
          hint="Branch + Platform + Jason"
        />
      </div>
    </SectionInfoPopover>
  );
}

export function TotalSaleInfoPopover({ values }: { values: PayoutReportValues }) {
  const subtotalLkr = values.subtotalBeforeDiscountLkr;
  const discountsLkr = values.totalProvidedDiscountsLkr;

  return (
    <SectionInfoPopover ariaLabel="Total Sale calculation details">
      <InfoPopoverHeader
        title="Total Sale"
        description="Gross order revenue for all sales channels in this payout period, before payout deductions."
      />
      <InfoFormulaLine>
        Total Sale = Subtotal − Discounts = {plainAmount(subtotalLkr)} − {plainAmount(discountsLkr)}{' '}
        = {plainAmount(values.grossLkr)}
      </InfoFormulaLine>
      <div className="space-y-2 border-t border-[#e2e8f0] pt-2.5 dark:border-slate-700">
        <ReportRow label="Subtotal" value={plainAmount(subtotalLkr)} />
        <ReportRow
          label="Discounts"
          value={plainAmount(discountsLkr)}
          hint="Same total as the Discounts section (promotions, loyalty, and other provided discounts)"
        />
        <ReportRow label="Total Sale" value={plainAmount(values.grossLkr)} bold />
      </div>
    </SectionInfoPopover>
  );
}

export function OnlineWalletInfoPopover({ values }: { values: PayoutReportValues }) {
  const pickupNetLkr = values.onlinePickupNetLkr;
  const deliveryNetLkr = values.onlineDeliveryNetLkr;
  const isFirstCyclePayout = values.cycleStage === 'FIRST';

  if (isFirstCyclePayout) {
    return (
      <SectionInfoPopover ariaLabel="Online order subtotal calculation details">
        <InfoPopoverHeader
          title={PAYOUT_FIRST_ONLINE_COLLECTIONS_TITLE}
          description={PAYOUT_FIRST_ONLINE_COLLECTIONS_SECTION_HINT}
        />
        <InfoFormulaLine>
          {PAYOUT_FIRST_ONLINE_COLLECTIONS_TOTAL_LABEL} = {PAYOUT_FIRST_ONLINE_PICKUP_SUBTOTAL_LABEL}{' '}
          + {PAYOUT_FIRST_ONLINE_DELIVERY_SUBTOTAL_LABEL} = {plainAmount(pickupNetLkr)} +{' '}
          {plainAmount(deliveryNetLkr)} = {plainAmount(values.onlinePaymentsCollectedLkr)}
        </InfoFormulaLine>
        <div className="space-y-2 border-t border-[#e2e8f0] pt-2.5 dark:border-slate-700">
          <ReportRow
            label={PAYOUT_FIRST_ONLINE_PICKUP_SUBTOTAL_LABEL}
            value={plainAmount(pickupNetLkr)}
          />
          <ReportRow
            label={PAYOUT_FIRST_ONLINE_DELIVERY_SUBTOTAL_LABEL}
            value={plainAmount(deliveryNetLkr)}
          />
          <ReportRow
            label={PAYOUT_FIRST_ONLINE_COLLECTIONS_TOTAL_LABEL}
            value={plainAmount(values.onlinePaymentsCollectedLkr)}
            bold
          />
        </div>
      </SectionInfoPopover>
    );
  }

  return (
    <SectionInfoPopover ariaLabel="Online Wallet Amount calculation details">
      <InfoPopoverHeader
        title="Online Wallet Amount"
        description="Total online payments from pickup and delivery orders. Gateway fees and your branch payout are calculated from this amount."
      />
      <InfoFormulaLine>
        Online Wallet Amount = Net Amount Pickup Online + Net Amount Delivery Online ={' '}
        {plainAmount(pickupNetLkr)} + {plainAmount(deliveryNetLkr)} ={' '}
        {plainAmount(values.onlinePaymentsCollectedLkr)}
      </InfoFormulaLine>
      <div className="space-y-2 border-t border-[#e2e8f0] pt-2.5 dark:border-slate-700">
        <ReportRow label="Net Amount Pickup Online" value={plainAmount(pickupNetLkr)} />
        <ReportRow label="Net Amount Delivery Online" value={plainAmount(deliveryNetLkr)} />
        <ReportRow label="Online Wallet Amount" value={plainAmount(values.onlinePaymentsCollectedLkr)} bold />
      </div>
    </SectionInfoPopover>
  );
}

export function CommissionInfoPopover({ values }: { values: PayoutReportValues }) {
  if (values.cycleStage === 'FIRST') {
    return (
      <SectionInfoPopover ariaLabel="Commission — Payout 1">
        <InfoPopoverHeader
          title="Commission"
          description={PAYOUT_FIRST_CYCLE_COMMISSION_INFO_DESCRIPTION}
        />
      </SectionInfoPopover>
    );
  }

  const totalSaleLkr = values.grossLkr;
  const ratePct = values.applicableSlabCommissionRatePct;
  const monthlyBaseHint =
    values.slabMonthlyBaseLkr != null && values.slabMonthlyBaseLkr >= 0
      ? `Based on month-to-date sales of LKR ${plainAmount(values.slabMonthlyBaseLkr)}`
      : 'Based on your monthly sales and commission tier';

  return (
    <SectionInfoPopover ariaLabel="Commission calculation details">
      <InfoPopoverHeader
        title="Commission"
        description="Slab commission for the period. Platform-owned promo payback and discount offsets are applied in Net Platform Amount, not here."
      />
      <InfoFormulaLine>
        Commission = Total Sale × Commission Rate = {plainAmount(totalSaleLkr)} ×{' '}
        {ratePct != null ? `${ratePct}%` : '—'}
      </InfoFormulaLine>
      <div className="space-y-2 border-t border-[#e2e8f0] pt-2.5 dark:border-slate-700">
        <ReportRow label="Total Sale" value={plainAmount(totalSaleLkr)} />
        <ReportRow
          label="Commission rate"
          value={ratePct != null ? `${ratePct}%` : '—'}
          hint={monthlyBaseHint}
        />
        <ReportRow label="Commission" value={plainAmount(values.commissionLkr)} bold />
      </div>
    </SectionInfoPopover>
  );
}

export function RefundsInfoPopover({ values }: { values: PayoutReportValues }) {
  return (
    <SectionInfoPopover ariaLabel="Refunds calculation details">
      <InfoPopoverHeader
        title="Refunds"
        description="Refund-related amounts recorded in the period. Non-returning branch refunds can increase the net branch payout; platform and delivery refund lines are informational totals."
      />
      <div className="space-y-2">
        {hasPositiveLkr(values.nonReturningRefundsBranchGrossLkr) ? (
          <ReportRow
            label="Non-returning refunds (Branch)"
            value={plainAmount(values.nonReturningRefundsBranchGrossLkr)}
          />
        ) : null}
        {hasPositiveLkr(values.platformRefundsLkr) ? (
          <ReportRow label="Platform Refunds" value={plainAmount(values.platformRefundsLkr)} />
        ) : null}
        {hasPositiveLkr(values.deliveryRefundsLkr) ? (
          <ReportRow label="Delivery Refunds" value={plainAmount(values.deliveryRefundsLkr)} />
        ) : null}
        {hasPositiveLkr(values.totalRefundAmountGrossLkr) ? (
          <>
            <InfoFormulaLine>
              Total Refund Amount = Branch non-returning + Platform + Delivery ={' '}
              {plainAmount(values.totalRefundAmountGrossLkr)}
            </InfoFormulaLine>
            <ReportRow
              label="Total Refund Amount"
              value={plainAmount(values.totalRefundAmountGrossLkr)}
              bold
            />
          </>
        ) : null}
      </div>
    </SectionInfoPopover>
  );
}

export function NetPlatformAmountInfoPopover({ values }: { values: PayoutReportValues }) {
  if (values.cycleStage === 'FIRST') {
    return (
      <SectionInfoPopover ariaLabel="Net Platform Amount — Payout 1">
        <InfoPopoverHeader
          title="Net Platform Amount"
          description={PAYOUT_FIRST_CYCLE_NET_PLATFORM_INFO_DESCRIPTION}
        />
      </SectionInfoPopover>
    );
  }

  const parts: string[] = [plainAmount(values.commissionLkr)];
  if (hasPositiveLkr(values.platformDiscountsReportLkr)) {
    parts.push(`− ${plainAmount(values.platformDiscountsReportLkr)}`);
  }
  if (hasPositiveLkr(values.loyaltyDiscountLkr)) {
    parts.push(`− ${plainAmount(values.loyaltyDiscountLkr)}`);
  }
  parts.push(`= ${plainAmount(values.netPlatformAmountLkr)}`);

  return (
    <SectionInfoPopover ariaLabel="Net Platform Amount calculation details">
      <InfoPopoverHeader
        title="Net Platform Amount"
        description="Commission after platform-funded discounts and loyalty. Customer convenience fees stay with the platform and are not deducted from branch earnings here."
      />
      <InfoFormulaLine>Net Platform Amount = {parts.join(' ')}</InfoFormulaLine>
      <div className="space-y-2 border-t border-[#e2e8f0] pt-2.5 dark:border-slate-700">
        <ReportRow label="Commission" value={plainAmount(values.commissionLkr)} />
        {hasPositiveLkr(values.platformDiscountsReportLkr) ? (
          <ReportRow
            label="− Platform Discounts"
            value={signedAmount(values.platformDiscountsReportLkr, '−')}
            valueTone="red"
            hint="max(platform-owned promo, payback) + shared platform share when payback enabled"
          />
        ) : null}
        {hasPositiveLkr(values.loyaltyDiscountLkr) ? (
          <ReportRow
            label="− Loyalty Points by Platform"
            value={signedAmount(values.loyaltyDiscountLkr, '−')}
            valueTone="red"
          />
        ) : null}
        <ReportRow label="Net Platform Amount" value={plainAmount(values.netPlatformAmountLkr)} bold />
      </div>
    </SectionInfoPopover>
  );
}
