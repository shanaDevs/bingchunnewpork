export const DEFAULT_MAX_CUPS_PER_RIDER = 20;

/** @deprecated Use DEFAULT_MAX_CUPS_PER_RIDER or settings value from API */
export const MAX_CUPS_PER_RIDER = DEFAULT_MAX_CUPS_PER_RIDER;

export type DeliverySelectionEntry = {
  orderNumber: string;
  cups: number;
};

export type DeliverySelectionMap = Record<string, DeliverySelectionEntry>;

export function orderCupCount(items: { quantity: number }[] | undefined): number {
  return (items ?? []).reduce((n, i) => n + i.quantity, 0);
}

export function selectionTotalCups(selection: DeliverySelectionMap): number {
  return Object.values(selection).reduce((sum, entry) => sum + entry.cups, 0);
}

export function selectionOrderCount(selection: DeliverySelectionMap): number {
  return Object.keys(selection).length;
}

/** Whether a selection can become one delivery job. */
export function isValidDeliveryGroup(
  cups: number,
  orderCount: number,
  maxCups = DEFAULT_MAX_CUPS_PER_RIDER,
): boolean {
  if (orderCount === 0) return false;
  if (cups <= maxCups) return true;
  return orderCount === 1;
}

/** Whether adding an order to the current selection stays within rider cup limits. */
export function canAddOrderToSelection(
  selection: DeliverySelectionMap,
  candidateCups: number,
  maxCups = DEFAULT_MAX_CUPS_PER_RIDER,
): { ok: boolean; message?: string } {
  const selectedCount = selectionOrderCount(selection);
  const selectedCups = selectionTotalCups(selection);
  const newTotal = selectedCups + candidateCups;

  if (newTotal <= maxCups) return { ok: true };
  if (selectedCount === 0 && candidateCups > maxCups) return { ok: true };

  return {
    ok: false,
    message: `Max ${maxCups} cups per rider per group (${newTotal} cups if added)`,
  };
}

export function groupLimitMessage(
  cups: number,
  orderCount: number,
  maxCups = DEFAULT_MAX_CUPS_PER_RIDER,
): string | null {
  if (orderCount === 0) return null;
  if (isValidDeliveryGroup(cups, orderCount, maxCups)) return null;
  return `This group has ${cups} cups — each rider can carry at most ${maxCups} cups. Remove orders to continue.`;
}
