import type { PromotionRules } from '@/lib/promotionTypes';
import type { BranchShareSplit } from '@/lib/promotionCriteria';

export interface PromoProductStoreRow {
  storeId: string;
  isAvailable?: boolean;
}

export interface PromoProductWithStores {
  id: string;
  storeProducts?: PromoProductStoreRow[];
}

export interface PromoStore {
  id: string;
  name: string;
}

/** Extract product IDs referenced in promotion rules (mirrors backend getPromotedProductIds). */
export function getPromotedProductIdsFromRules(rules: PromotionRules): string[] {
  const ids = new Set<string>();

  for (const key of ['selectedProducts', 'comboProducts'] as const) {
    const arr = rules[key];
    if (Array.isArray(arr)) {
      for (const p of arr) {
        if (p?.id) ids.add(p.id);
      }
    }
  }

  if (rules.giftProduct?.id) ids.add(rules.giftProduct.id);
  if (rules.productId) ids.add(rules.productId);
  if (rules.giftProductId) ids.add(rules.giftProductId);

  return [...ids];
}

function branchIdsForProduct(
  productId: string,
  products: PromoProductWithStores[],
): Set<string> {
  const product = products.find((p) => p.id === productId);
  if (!product?.storeProducts?.length) return new Set<string>();

  return new Set(
    product.storeProducts
      .filter((sp) => sp.isAvailable !== false)
      .map((sp) => sp.storeId),
  );
}

/** Branches that carry all referenced products; falls back to all stores when no product IDs. */
export function getEligibleBranchIds(
  productIds: string[],
  products: PromoProductWithStores[],
  allStoreIds: string[],
): string[] {
  if (productIds.length === 0) return allStoreIds;

  let intersection: Set<string> | null = null;
  for (const productId of productIds) {
    const branchSet = branchIdsForProduct(productId, products);
    if (intersection === null) {
      intersection = branchSet;
    } else {
      intersection = new Set<string>([...intersection].filter((id: string) => branchSet.has(id)));
    }
  }

  const eligible = intersection ? [...intersection] : [];
  return eligible.length > 0 ? eligible : allStoreIds;
}

export function formatBranchSelectionLabel(
  storeIds: string[],
  stores: PromoStore[],
  formatName: (name: string) => string = (n) => n,
): string {
  if (!storeIds.length) return 'All branches';
  if (storeIds.length === 1) {
    const store = stores.find((s) => s.id === storeIds[0]);
    return store ? formatName(store.name) : '1 branch';
  }
  return `${storeIds.length} branches`;
}

export interface SharedBranchShareRow {
  storeId: string;
  branchName: string;
  branchSharePct: number;
  platformSharePct: number;
  totalPct: number;
}

export function buildSharedBranchShareRows(
  storeIds: string[],
  branchShareSplits: Record<string, BranchShareSplit>,
  stores: PromoStore[],
  fallbackSplit: BranchShareSplit,
  formatName: (name: string) => string = (n) => n,
): SharedBranchShareRow[] {
  return storeIds.map((storeId) => {
    const store = stores.find((s) => s.id === storeId);
    const split = branchShareSplits[storeId] ?? fallbackSplit;
    return {
      storeId,
      branchName: store ? formatName(store.name) : storeId,
      branchSharePct: split.branchSharePct,
      platformSharePct: split.platformSharePct,
      totalPct: split.branchSharePct + split.platformSharePct,
    };
  });
}
