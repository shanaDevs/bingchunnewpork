'use client';

import {
  LKR_EPSILON,
  SETTLEMENT_CHANNELS,
  sumAllDiscounts,
  sumAllSubtotalBeforeDiscount,
  sumChannelBreakdownOrderCount,
  sumChannelConvenienceFees,
  sumChannelRevenueSubtotals,
  type SettlementBreakdown,
} from '@/components/admin/settlementTypes';
import { formatMoneyAmount } from '@/lib/receipt';

type Props = {
  breakdown: SettlementBreakdown;
  className?: string;
  /** Optional heading override (e.g. live channel activity on approval). */
  title?: string;
};

function amount(lkr: number): string {
  return formatMoneyAmount(lkr);
}

function amountOrZero(lkr: number): string {
  return amount(lkr > 0 ? lkr : 0);
}

function discountCell(lkr: number): { text: string; discounted: boolean } {
  const discounted = lkr > LKR_EPSILON;
  return {
    text: discounted ? `− ${amount(lkr)}` : amount(0),
    discounted,
  };
}

export default function ChannelSalesTable({
  breakdown,
  className = 'mb-4',
  title = 'Sales by channel',
}: Props) {
  const totalOrders = sumChannelBreakdownOrderCount(breakdown);
  const totalSubtotal = sumAllSubtotalBeforeDiscount(breakdown);
  const totalDiscounts = sumAllDiscounts(breakdown);
  const totalNetAmount = sumChannelRevenueSubtotals(breakdown);
  const totalConvenienceFee = sumChannelConvenienceFees(breakdown);
  const totalDeliveryFee = breakdown.deliveryOnline.deliveryFeeTotal ?? 0;
  const totalDiscountCell = discountCell(totalDiscounts);

  return (
    <div className={className}>
      <p className="mb-3 text-[14px] font-bold text-[#1e293b] dark:text-slate-100">
        {title}
      </p>
      <div className="overflow-hidden rounded-lg border border-[#e2e8f0] dark:border-slate-700 bg-[#f8fafc] dark:bg-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left text-[13px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-[#e2e8f0] dark:border-slate-700 bg-[#eff6ff] dark:bg-blue-950/40 text-[#1e293b] dark:text-slate-200">
                <th className="px-5 py-3 font-semibold">Channel</th>
                <th className="px-5 py-3 font-semibold text-center">Orders</th>
                <th className="px-5 py-3 font-semibold text-right">Subtotal (LKR)</th>
                <th className="px-5 py-3 font-semibold text-right">Discounts (LKR)</th>
                <th className="px-5 py-3 font-semibold text-right">Net Amount (LKR)</th>
                <th className="px-5 py-3 font-semibold text-right">Convenience fee (LKR)</th>
                <th className="px-5 py-3 font-semibold text-right">Delivery fee (LKR)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e2e8f0] dark:divide-slate-700 bg-white dark:bg-slate-900">
              {SETTLEMENT_CHANNELS.map(({ key, label }) => {
                const row = breakdown[key];
                const subtotalBeforeDiscount = row.subtotalBeforeDiscount ?? row.revenueSubtotal;
                const rowDiscount = discountCell(row.discountTotal ?? 0);
                const convenienceFee = row.convenientFeeTotal ?? 0;
                const deliveryFee = row.deliveryFeeTotal ?? 0;

                return (
                  <tr key={key} className="text-[#1e293b] dark:text-slate-100">
                    <td className="px-5 py-3.5 font-medium">{label}</td>
                    <td className="px-5 py-3.5 text-center font-bold">{row.orderCount}</td>
                    <td className="px-5 py-3.5 text-right font-bold">
                      {amountOrZero(subtotalBeforeDiscount)}
                    </td>
                    <td
                      className={`px-5 py-3.5 text-right font-bold ${rowDiscount.discounted ? 'text-red-500' : ''}`}
                    >
                      {rowDiscount.text}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold">
                      {amountOrZero(row.revenueSubtotal)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold">
                      {amountOrZero(convenienceFee)}
                    </td>
                    <td className="px-5 py-3.5 text-right font-bold">
                      {key === 'deliveryOnline' ? amountOrZero(deliveryFee) : '–'}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-[#cbd5e1] bg-[#f8fafc] text-[#1e293b] dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100">
                <td className="px-5 py-3.5 font-bold">Total</td>
                <td className="px-5 py-3.5 text-center font-bold">{totalOrders}</td>
                <td className="px-5 py-3.5 text-right font-bold">
                  {amountOrZero(totalSubtotal)}
                </td>
                <td
                  className={`px-5 py-3.5 text-right font-bold ${totalDiscountCell.discounted ? 'text-red-500' : ''}`}
                >
                  {totalDiscountCell.text}
                </td>
                <td className="px-5 py-3.5 text-right font-bold">
                  {amountOrZero(totalNetAmount)}
                </td>
                <td className="px-5 py-3.5 text-right font-bold">
                  {amountOrZero(totalConvenienceFee)}
                </td>
                <td className="px-5 py-3.5 text-right font-bold">
                  {amountOrZero(totalDeliveryFee)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
