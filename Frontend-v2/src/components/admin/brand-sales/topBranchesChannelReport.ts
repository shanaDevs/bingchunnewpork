import { branchTierLabel } from '@/components/admin/branchTableShared';
import { shortBranchName } from '@/lib/branchName';
import { formatMoneyAmount } from '@/lib/receipt';

export type BranchChannelMetric = {
  amount: number;
  orders: number;
};

export type TopBranchesChannelRow = {
  storeId: string;
  branchName: string;
  tier: 'top' | 'standard';
  totalOrders: number;
  grossSales: number;
  pickupCash: BranchChannelMetric;
  pickupCard: BranchChannelMetric;
  pickupOnline: BranchChannelMetric;
  deliveryOnline: BranchChannelMetric;
  totalDiscount: number;
  totalRefunds: number;
};

export type TopBranchesReportOptions = {
  showTierColumn: boolean;
  hideDeliveryOnline: boolean;
};

function moneyOrDash(value: number) {
  return value > 0 ? formatMoneyAmount(value) : '—';
}

export function topBranchesChannelColumns({
  showTierColumn,
  hideDeliveryOnline,
}: TopBranchesReportOptions): string[] {
  const columns = ['Branch Name'];
  if (showTierColumn) columns.push('Tier');
  columns.push('Total Orders', 'Sales (LKR)', 'Pickup Cash', 'Pickup Card', 'Pickup Online');
  if (!hideDeliveryOnline) columns.push('Delivery Online');
  columns.push('Discounts', 'Refunds');
  return columns;
}

export function topBranchesChannelCsvRow(
  row: TopBranchesChannelRow,
  options: TopBranchesReportOptions,
): Array<string | number> {
  const values: Array<string | number> = [shortBranchName(row.branchName)];
  if (options.showTierColumn) values.push(branchTierLabel(row.tier));
  values.push(
    row.totalOrders,
    Number(row.grossSales.toFixed(2)),
    Number(row.pickupCash.amount.toFixed(2)),
    Number(row.pickupCard.amount.toFixed(2)),
    Number(row.pickupOnline.amount.toFixed(2)),
  );
  if (!options.hideDeliveryOnline) values.push(Number(row.deliveryOnline.amount.toFixed(2)));
  values.push(Number(row.totalDiscount.toFixed(2)), Number(row.totalRefunds.toFixed(2)));
  return values;
}

export function topBranchesChannelPdfRow(
  row: TopBranchesChannelRow,
  options: TopBranchesReportOptions,
): { key: string; cells: string[] } {
  const cells = [shortBranchName(row.branchName)];
  if (options.showTierColumn) cells.push(branchTierLabel(row.tier));
  cells.push(
    String(row.totalOrders),
    formatMoneyAmount(row.grossSales),
    moneyOrDash(row.pickupCash.amount),
    moneyOrDash(row.pickupCard.amount),
    moneyOrDash(row.pickupOnline.amount),
  );
  if (!options.hideDeliveryOnline) cells.push(moneyOrDash(row.deliveryOnline.amount));
  cells.push(moneyOrDash(row.totalDiscount), moneyOrDash(row.totalRefunds));
  return { key: row.storeId, cells };
}