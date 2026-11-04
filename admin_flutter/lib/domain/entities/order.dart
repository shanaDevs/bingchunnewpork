/// Order shapes returned by `/orders` (list rows) and `/orders/:key` (detail).
/// Field names follow the web `Order` type so the rules in order_rules.dart read the same.
abstract final class OrderStatus {
  static const received = 'RECEIVED';
  static const preparing = 'PREPARING';
  static const ready = 'READY';
  static const outForDelivery = 'OUT_FOR_DELIVERY';
  static const delivered = 'DELIVERED';
  static const cancelled = 'CANCELLED';

  /// The three queue tabs on the Orders screen.
  static const queue = [received, preparing, ready];
}

abstract final class OrderMode {
  static const takeaway = 'TAKEAWAY';
  static const delivery = 'DELIVERY';
}

abstract final class PaymentMethod {
  static const cashAtCounter = 'CASH_AT_COUNTER';
  static const card = 'CARD';
  static const payhere = 'PAYHERE';
  static const loyaltyPoints = 'LOYALTY_POINTS';
}

class OrderLine {
  const OrderLine({
    required this.id,
    required this.productName,
    required this.quantity,
    required this.unitPrice,
    required this.totalPrice,
    this.size = 'REGULAR',
    this.imageUrl,
    this.toppings = const [],
  });

  final String id;
  final String productName;
  final int quantity;
  final double unitPrice;
  final double totalPrice;
  final String size;
  final String? imageUrl;
  final List<String> toppings;
}

class StatusEvent {
  const StatusEvent({required this.id, required this.status, this.note, this.actorName, this.createdAt});
  final String id;
  final String status;
  final String? note;
  final String? actorName;
  final DateTime? createdAt;
}

/// Row on the Orders list (and dashboard recent orders).
class OrderSummary {
  const OrderSummary({
    required this.id,
    required this.orderNumber,
    required this.orderMode,
    required this.status,
    required this.total,
    required this.createdAt,
    required this.paymentMethod,
    required this.paymentStatus,
    this.channel,
    this.canCancel = false,
    this.cancelWindowEndsAt,
    this.cancelReason,
    this.cancelledBy,
    this.guestName,
    this.guestPhone,
    this.userName,
    this.userPhone,
    this.processedByName,
    this.statusEvents = const [],
    this.items = const [],
    this.queuePosition,
    this.pickupTime,
    this.scheduledPickupAt,
    this.storeName,
    this.deliveryAddressLine,
  });

  final String id;
  final String orderNumber;
  final String orderMode;
  final String status;
  final double total;
  final DateTime createdAt;
  final String paymentMethod;
  final String paymentStatus;
  final String? channel;
  final bool canCancel;
  final DateTime? cancelWindowEndsAt;
  final String? cancelReason;
  final String? cancelledBy;
  final String? guestName;
  final String? guestPhone;
  final String? userName;
  final String? userPhone;
  final String? processedByName;
  final List<StatusEvent> statusEvents;
  final List<OrderLine> items;
  final int? queuePosition;
  final String? pickupTime;
  final DateTime? scheduledPickupAt;
  final String? storeName;
  final String? deliveryAddressLine;

  bool get isDelivery => orderMode == OrderMode.delivery;
  bool get isCancelled => status == OrderStatus.cancelled;
}

/// Full order from `/orders/:key`.
class OrderDetail extends OrderSummary {
  const OrderDetail({
    required super.id,
    required super.orderNumber,
    required super.orderMode,
    required super.status,
    required super.total,
    required super.createdAt,
    required super.paymentMethod,
    required super.paymentStatus,
    super.channel,
    super.canCancel,
    super.cancelWindowEndsAt,
    super.cancelReason,
    super.cancelledBy,
    super.guestName,
    super.guestPhone,
    super.userName,
    super.userPhone,
    super.processedByName,
    super.statusEvents,
    super.items,
    super.queuePosition,
    super.pickupTime,
    super.scheduledPickupAt,
    super.storeName,
    super.deliveryAddressLine,
    this.storeId,
    this.subtotal = 0,
    this.convenientFee = 0,
    this.deliveryFee = 0,
    this.discount = 0,
    this.loyaltyDiscount = 0,
    this.promoCode,
    this.prepaidAmount,
    this.balanceDue,
    this.canEdit,
    this.canAddItems,
    this.editMode,
    this.deliveryCity,
    this.deliveryLat,
    this.deliveryLng,
  });

  final String? storeId;
  final double subtotal;
  final double convenientFee;
  final double deliveryFee;
  final double discount;
  final double loyaltyDiscount;
  final String? promoCode;
  final double? prepaidAmount;

  /// Server-computed balance still owed at the counter (items added after online payment).
  final double? balanceDue;

  /// Server edit permissions; when absent the web defaults in order_rules.dart apply.
  final bool? canEdit;
  final bool? canAddItems;
  final String? editMode;
  final String? deliveryCity;
  final double? deliveryLat;
  final double? deliveryLng;
}

class ConversationMessage {
  const ConversationMessage({required this.id, required this.inbound, this.body, this.createdAt});
  final String id;
  final bool inbound;
  final String? body;
  final DateTime? createdAt;
}

/// WhatsApp / Telegram thread attached to a messaging-channel order.
class OrderConversation {
  const OrderConversation({required this.channel, this.username, this.phone, this.messages = const []});
  final String channel;
  final String? username;
  final String? phone;
  final List<ConversationMessage> messages;
}

/// One page of a paginated list plus the server's `meta`.
class Paged<T> {
  const Paged({required this.items, required this.total, required this.page, required this.pages});
  final List<T> items;
  final int total;
  final int page;
  final int pages;

  bool get hasMore => page < pages;
}
