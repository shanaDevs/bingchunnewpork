import {
  getEffectiveThresholds,
  isLowStockByOnlineQty,
  isOnlineOutOfStockByOnlineQty,
} from './batchStockEngine';
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

/** True when the branch row exists but stock was never configured or received. */
export function isNeverStockedAtBranch(row: MenuStockRow): boolean {
  const onHand = row.stock ?? row.weeklyRemainingQty ?? 0;
  if (onHand > 0) return false;
  if ((row.weeklyBaseQty ?? 0) > 0) return false;
  if ((row.weeklyTargetQty ?? 0) > 0) return false;
  if ((row.weeklyReceivedQty ?? 0) > 0) return false;
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
  if (!row) {
    return {
      quantity: 0,
      inStock: false,
      isLowStock: false,
      isOutOfStock: true,
    };
  }

  if (isNeverStockedAtBranch(row)) {
    return {
      quantity: 0,
      inStock: false,
      weeklyBaseQty: row.weeklyBaseQty,
      isLowStock: false,
      isOutOfStock: false,
      isComingSoon: true,
    };
  }

  const onHandPreview = row.stock ?? row.weeklyRemainingQty ?? 0;
  const thresholds = getEffectiveThresholds({
    lowStockThreshold: row.lowStockThreshold,
    onlineOutOfStockThreshold: row.onlineOutOfStockThreshold,
  });
  const onHand = onHandPreview;
  const counterAvailable = row.isAvailable ? Math.max(0, onHand - reservedQty) : 0;
  const onlineAvailable = row.isAvailable
    ? Math.max(0, counterAvailable - thresholds.onlineOutOfStockThreshold)
    : 0;
  const isOnlineOos = isOnlineOutOfStockByOnlineQty(onlineAvailable, thresholds);
  const outOfStock = !row.isAvailable || isOnlineOos;

  return {
    quantity: onlineAvailable,
    inStock: !outOfStock && onlineAvailable > 0,
    weeklyBaseQty: row.weeklyBaseQty,
    isLowStock: isLowStockByOnlineQty(onlineAvailable, thresholds, isOnlineOos),
    isOutOfStock: outOfStock,
    isComingSoon: false,
  };
}
