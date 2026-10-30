import '../entities/order.dart';

/// Port of the web AdminTakeawayQueuePanel rules.

/// Statuses a queued takeaway order can be in, in kitchen order.
const takeawayQueueStatuses = [OrderStatus.received, OrderStatus.preparing, OrderStatus.ready];

/// The queue only moves forward: Received → Preparing → Ready.
bool isQueueStatusDisabled(String current, String option) {
  final from = takeawayQueueStatuses.indexOf(current);
  final to = takeawayQueueStatuses.indexOf(option);
  return to < (from < 0 ? 0 : from);
}

enum QueueSort { queue, orderedAsc, orderedDesc }

/// Queue order as the server sends it, or by ordered time.
List<OrderSummary> sortQueue(List<OrderSummary> orders, QueueSort sort) {
  if (sort == QueueSort.queue) return orders;
  final sorted = [...orders]..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  return sort == QueueSort.orderedDesc ? sorted.reversed.toList() : sorted;
}

/// Ids after swapping [index] with its neighbour, or null at either end.
List<String>? moveInQueue(List<OrderSummary> queue, int index, int direction) {
  final next = index + direction;
  if (next < 0 || next >= queue.length) return null;
  final ids = [for (final o in queue) o.id];
  final t = ids[index];
  ids[index] = ids[next];
  ids[next] = t;
  return ids;
}

int queueItemCount(OrderSummary o) => o.items.fold(0, (n, i) => n + i.quantity);
