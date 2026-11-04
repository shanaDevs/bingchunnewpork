/// Port of the web lib/deliverySelection.ts — which READY delivery orders can
/// go into one rider's run without passing the cups-per-rider limit.
library;

/// Web `DEFAULT_MAX_CUPS_PER_RIDER`, used until `/settings/app` answers.
const defaultMaxCupsPerRider = 20;

/// Selected orders keyed by order id → cups.
typedef DeliverySelection = Map<String, ({String orderNumber, int cups})>;

int orderCupCount(Iterable<int> quantities) => quantities.fold(0, (n, q) => n + q);

int selectionTotalCups(DeliverySelection s) => s.values.fold(0, (n, e) => n + e.cups);

/// Whether a selection can become one delivery job. A single order over the
/// limit is still allowed (it can't be split).
bool isValidDeliveryGroup(int cups, int orderCount, [int maxCups = defaultMaxCupsPerRider]) {
  if (orderCount == 0) return false;
  if (cups <= maxCups) return true;
  return orderCount == 1;
}

/// Whether adding [candidateCups] keeps the selection within the rider limit.
/// [newTotal] is the cup count the selection would reach (for the error toast).
({bool ok, int newTotal}) canAddOrderToSelection(
  DeliverySelection selection,
  int candidateCups, [
  int maxCups = defaultMaxCupsPerRider,
]) {
  final newTotal = selectionTotalCups(selection) + candidateCups;
  if (newTotal <= maxCups) return (ok: true, newTotal: newTotal);
  if (selection.isEmpty && candidateCups > maxCups) return (ok: true, newTotal: newTotal);
  return (ok: false, newTotal: newTotal);
}

/// Web `groupLimitMessage`: true when the selection is over the limit.
bool groupOverLimit(int cups, int orderCount, [int maxCups = defaultMaxCupsPerRider]) =>
    orderCount > 0 && !isValidDeliveryGroup(cups, orderCount, maxCups);

/// Web run title: "Delivery · 3 orders (12 cups)".
String deliveryGroupTitle(int orders, int cups) =>
    'Delivery · $orders order${orders == 1 ? '' : 's'} ($cups cup${cups == 1 ? '' : 's'})';
