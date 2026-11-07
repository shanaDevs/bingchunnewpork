/// New-order / staff alert, from the socket (`storeNewOrder`, `adminNotification`)
/// or the `/admin/notifications` fallback poll.
class AdminNotice {
  const AdminNotice({
    required this.type,
    required this.title,
    required this.message,
    required this.receivedAt,
    this.id,
    this.orderId,
    this.orderNumber,
    this.orderMode,
    this.customerName,
    this.itemCount,
    this.total,
    this.queuePosition,
    this.storeId,
    this.read = false,
  });

  final String? id;
  final String type;
  final String title;
  final String message;
  final DateTime receivedAt;
  final String? orderId;
  final String? orderNumber;
  final String? orderMode;
  final String? customerName;
  final int? itemCount;
  final double? total;
  final int? queuePosition;
  final String? storeId;
  final bool read;

  bool get isNewOrder => type == 'NEW_ORDER';

  /// Same order announced twice (socket + poll) collapses to one alert.
  String get dedupeKey => orderId ?? orderNumber ?? id ?? '$type-${receivedAt.millisecondsSinceEpoch}';

  AdminNotice markRead() => AdminNotice(
    id: id,
    type: type,
    title: title,
    message: message,
    receivedAt: receivedAt,
    orderId: orderId,
    orderNumber: orderNumber,
    orderMode: orderMode,
    customerName: customerName,
    itemCount: itemCount,
    total: total,
    queuePosition: queuePosition,
    storeId: storeId,
    read: true,
  );
}
