import { channelAvailabilityFromOnHand, getEffectiveThresholds } from './batchStockEngine';
import type { StoreProductRow } from './storeInventory';

export type BranchStockMeta = {
  quantity: number;
  inStock: boolean;
  weeklyBaseQty?: number;
  isLowStock?: boolean;
  isOutOfStock?: boolean;
  isComingSoon?: boolean;
};

export type MenuStockRow = Pick<
  StoreProductRow,
  'stock' | 'weeklyBaseQty' | 'weeklyRemainingQty' | 'isAvailable'
> & {
  weeklyTargetQty?: number;
  weeklyReceivedQty?: number;
  totalBatchCount?: number;
  lowStockThreshold?: number | null;
  onlineOutOfStockThreshold?: number | null;
};

export function menuRowOnHand(row: MenuStockRow): number {
  return row.stock ?? row.weeklyRemainingQty ?? 0;
}

export type MenuStockBatchMeta = {
  totalBatchCount: number;
  weeklyReceivedQty?: number;
};

export type MenuStockRowInput = Pick<
  StoreProductRow,
  | 'stock'
  | 'weeklyBaseQty'
  | 'weeklyRemainingQty'
  | 'weeklyTargetQty'
  | 'isAvailable'
  | 'lowStockThreshold'
  | 'onlineOutOfStockThreshold'
>;

export function toMenuStockRow(
  row: MenuStockRowInput,
  batchMeta?: Pick<MenuStockBatchMeta, 'totalBatchCount' | 'weeklyReceivedQty'>,
): MenuStockRow {
  return {
    stock: row.stock,
    weeklyBaseQty: row.weeklyBaseQty,
    weeklyRemainingQty: row.weeklyRemainingQty,
    weeklyTargetQty: row.weeklyTargetQty ?? 0,
    isAvailable: row.isAvailable,
    lowStockThreshold: row.lowStockThreshold,
    onlineOutOfStockThreshold: row.onlineOutOfStockThreshold,
    totalBatchCount: batchMeta?.totalBatchCount ?? 0,
    weeklyReceivedQty: batchMeta?.weeklyReceivedQty ?? 0,
  };
}

/** Store product list/embed rows may omit `stock`; on-hand preview matches admin list. */
export function toMenuStockRowFromOptionalStock(
  row: Omit<MenuStockRowInput, 'stock'> & { stock?: number },
): MenuStockRow {
  return toMenuStockRow({
    stock: row.stock ?? row.weeklyRemainingQty,
    weeklyBaseQty: row.weeklyBaseQty,
    weeklyRemainingQty: row.weeklyRemainingQty,
    weeklyTargetQty: row.weeklyTargetQty ?? 0,
    isAvailable: row.isAvailable,
    lowStockThreshold: row.lowStockThreshold,
    onlineOutOfStockThreshold: row.onlineOutOfStockThreshold,
  });
}

export function branchStockFromStoreProductInput(
  row: MenuStockRowInput | null | undefined,
  batchMeta?: Pick<MenuStockBatchMeta, 'totalBatchCount' | 'weeklyReceivedQty'>,
  reservedQty = 0,
): BranchStockMeta {
  return branchStockFromRow(row ? toMenuStockRow(row, batchMeta) : undefined, reservedQty);
}

export function branchStockFromOptionalStockSummary(
  row: Omit<MenuStockRowInput, 'stock'> & { stock?: number },
): BranchStockMeta {
  return branchStockFromRow(toMenuStockRowFromOptionalStock(row));
}

const missingRowBranchStock: BranchStockMeta = {
  quantity: 0,
  inStock: false,
  isLowStock: false,
  isOutOfStock: true,
};

function comingSoonBranchStock(row: MenuStockRow): BranchStockMeta {
  return {
    quantity: 0,
    inStock: false,
    weeklyBaseQty: row.weeklyBaseQty,
    isLowStock: false,
    isOutOfStock: false,
    isComingSoon: true,
  };
}

/** True when the branch row exists but no stock batch was ever received (Coming Soon online). */
export function isNeverStockedAtBranch(row: MenuStockRow): boolean {
  const onHand = menuRowOnHand(row);
  if (onHand > 0) return false;
  // Weekly target/base are planning fields — only batch history means stock was received.
  if ((row.totalBatchCount ?? 0) > 0) return false;
  return true;
}

/**
 * Customer-facing branch stock — same formula as admin/checkout:
 * onlineAvailable = max(0, (onHand - reserved) - product OOS threshold).
 */
export function branchStockFromRow(
  row: MenuStockRow | undefined,
  reservedQty = 0,
): BranchStockMeta {
  if (!row) return missingRowBranchStock;

  if (isNeverStockedAtBranch(row)) return comingSoonBranchStock(row);

  const thresholds = getEffectiveThresholds({
    lowStockThreshold: row.lowStockThreshold,
    onlineOutOfStockThreshold: row.onlineOutOfStockThreshold,
  });
  const { onlineAvailable, isOnlineOutOfStock, isLowStock } = channelAvailabilityFromOnHand(
    menuRowOnHand(row),
    reservedQty,
    row.isAvailable,
    thresholds,
  );
  const outOfStock = !row.isAvailable || isOnlineOutOfStock;

  return {
    quantity: onlineAvailable,
    inStock: !outOfStock && onlineAvailable > 0,
    weeklyBaseQty: row.weeklyBaseQty,
    isLowStock,
    isOutOfStock: outOfStock,
    isComingSoon: false,
  };
}
