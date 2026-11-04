import '../../core/runtime_config.dart';
import '../../domain/entities/admin_notification.dart';
import '../../domain/entities/admin_session.dart';
import '../../domain/entities/dashboard.dart';
import '../../domain/entities/menu.dart';
import '../../domain/entities/order.dart';
import '../json.dart';

/// JSON → domain entity mappers. Every field is read tolerantly (see json.dart).

AdminSession sessionFromJson(Json j) => AdminSession(
  id: str(j, 'id'),
  name: str(j, 'name'),
  email: str(j, 'email'),
  role: str(j, 'role'),
  storeId: strOrNull(j, 'storeId'),
  storeName: strOrNull(j, 'storeName'),
  storeCity: strOrNull(j, 'storeCity'),
  deliveryEnabled: boolOrNull(j, 'deliveryEnabled'),
);

Json sessionToJson(AdminSession s) => {
  'id': s.id,
  'name': s.name,
  'email': s.email,
  'role': s.role,
  'storeId': s.storeId,
  'storeName': s.storeName,
  'storeCity': s.storeCity,
  'deliveryEnabled': s.deliveryEnabled,
};

MenuCategory categoryFromJson(Json j) => MenuCategory(id: str(j, 'id'), name: str(j, 'name'), slug: str(j, 'slug'));

Topping toppingFromJson(Json j) => Topping(
  id: str(j, 'id'),
  name: str(j, 'name'),
  extraPrice: dbl(j, 'extraPrice'),
  isAvailable: boolOf(j, 'isAvailable', true),
);

Product productFromJson(Json j) => Product(
  id: str(j, 'id'),
  categoryId: str(j, 'categoryId'),
  name: str(j, 'name'),
  basePrice: dbl(j, 'basePrice'),
  description: strOrNull(j, 'description'),
  imageUrl: AppConfig.resolveAssetUrl(strOrNull(j, 'imageUrl')),
  tag: strOrNull(j, 'tag'),
  categoryName: strOrNull(objOrNull(j, 'category') ?? const {}, 'name'),
  // Product toppings arrive wrapped: `[{ topping: {...} }]`.
  toppings: listOf(j, 'toppings', (t) => toppingFromJson(objOrNull(t, 'topping') ?? t)),
  isOutOfStock: boolOf(j, 'isOutOfStock'),
);

StoreOption storeFromJson(Json j) => StoreOption(id: str(j, 'id'), name: str(j, 'name'));

CashierOption cashierFromJson(Json j) => CashierOption(id: str(j, 'id'), name: str(j, 'name'));

OrderLine _lineFromJson(Json j) => OrderLine(
  id: str(j, 'id'),
  productName: str(j, 'productName'),
  quantity: intOf(j, 'quantity', 1),
  unitPrice: dbl(j, 'unitPrice'),
  totalPrice: dbl(j, 'totalPrice'),
  size: str(j, 'size', 'REGULAR'),
  imageUrl: AppConfig.resolveAssetUrl(strOrNull(objOrNull(j, 'product') ?? const {}, 'imageUrl')),
  toppings: listOf(j, 'toppings', (t) => str(t, 'toppingName', str(t, 'name'))),
);

StatusEvent _eventFromJson(Json j) => StatusEvent(
  id: str(j, 'id'),
  status: str(j, 'status'),
  note: strOrNull(j, 'note'),
  actorName: strOrNull(j, 'actorName'),
  createdAt: dateOrNull(j, 'createdAt'),
);

OrderSummary orderSummaryFromJson(Json j) => orderDetailFromJson(j);

OrderDetail orderDetailFromJson(Json j) {
  final user = objOrNull(j, 'user') ?? const <String, dynamic>{};
  final store = objOrNull(j, 'store') ?? const <String, dynamic>{};
  final address = objOrNull(j, 'address') ?? const <String, dynamic>{};
  return OrderDetail(
    id: str(j, 'id'),
    orderNumber: str(j, 'orderNumber'),
    orderMode: str(j, 'orderMode', OrderMode.takeaway),
    status: str(j, 'status', OrderStatus.received),
    total: dbl(j, 'total'),
    createdAt: dateOrNull(j, 'createdAt') ?? DateTime.now(),
    paymentMethod: str(j, 'paymentMethod'),
    paymentStatus: str(j, 'paymentStatus'),
    channel: strOrNull(j, 'channel'),
    canCancel: boolOf(j, 'canCancel'),
    cancelWindowEndsAt: dateOrNull(j, 'cancelWindowEndsAt'),
    cancelReason: strOrNull(j, 'cancelReason'),
    cancelledBy: strOrNull(j, 'cancelledBy'),
    guestName: strOrNull(j, 'guestName'),
    guestPhone: strOrNull(j, 'guestPhone'),
    userName: strOrNull(user, 'name'),
    userPhone: strOrNull(user, 'phone'),
    processedByName: strOrNull(j, 'processedByName'),
    statusEvents: listOf(j, 'statusEvents', _eventFromJson),
    items: listOf(j, 'items', _lineFromJson),
    queuePosition: intOrNull(j, 'queuePosition'),
    pickupTime: strOrNull(j, 'pickupTime'),
    scheduledPickupAt: dateOrNull(j, 'scheduledPickupAt'),
    storeName: strOrNull(store, 'name'),
    storeId: strOrNull(store, 'id') ?? strOrNull(j, 'storeId'),
    deliveryAddressLine: strOrNull(address, 'addressLine') ?? strOrNull(j, 'deliveryAddressLine'),
    deliveryCity: strOrNull(address, 'city') ?? strOrNull(j, 'deliveryCity'),
    deliveryLat: dblOrNull(j, 'deliveryLat') ?? dblOrNull(address, 'lat'),
    deliveryLng: dblOrNull(j, 'deliveryLng') ?? dblOrNull(address, 'lng'),
    subtotal: dbl(j, 'subtotal'),
    convenientFee: dbl(j, 'convenientFee'),
    deliveryFee: dbl(j, 'deliveryFee'),
    discount: dbl(j, 'discount'),
    loyaltyDiscount: dbl(j, 'loyaltyDiscount'),
    promoCode: strOrNull(j, 'promoCode'),
    prepaidAmount: dblOrNull(j, 'prepaidAmount'),
    balanceDue: dblOrNull(j, 'balanceDue'),
    canEdit: boolOrNull(j, 'canEdit'),
    canAddItems: boolOrNull(j, 'canAddItems'),
    editMode: strOrNull(j, 'editMode'),
  );
}

OrderConversation conversationFromJson(Json j) {
  final meta = objOrNull(j, 'channelMeta') ?? const <String, dynamic>{};
  return OrderConversation(
    channel: str(j, 'channel'),
    username: strOrNull(meta, 'username'),
    phone: strOrNull(meta, 'phone'),
    messages: listOf(
      j,
      'messages',
      (m) => ConversationMessage(
        id: str(m, 'id'),
        inbound: str(m, 'direction') == 'INBOUND',
        body: strOrNull(m, 'bodyText'),
        createdAt: dateOrNull(m, 'createdAt'),
      ),
    ),
  );
}

DashboardStats dashboardFromJson(Json j) {
  final channels = objOrNull(j, 'revenueChannels') ?? const <String, dynamic>{};
  return DashboardStats(
    periodOrders: intOf(j, 'periodOrders'),
    periodCups: intOf(j, 'periodCups'),
    cancelledOrders: intOf(j, 'cancelledOrders'),
    periodRevenue: dbl(j, 'periodRevenue'),
    periodRefundAmount: dbl(j, 'periodRefundAmount'),
    // Wallet balance is stored in cents (web fmtWallet divides by 100).
    onlineWalletBalance: dbl(j, 'onlineWalletBalance') / 100,
    pickupCash: dbl(channels, 'pickupCash'),
    pickupCard: dbl(channels, 'pickupCard'),
    pickupOnline: dbl(channels, 'pickupOnline'),
    deliveryOnline: dbl(channels, 'deliveryCard'),
    peakHours: listOf(
      j,
      'peakHours',
      (h) => HourPoint(
        hour: intOf(h, 'hour'),
        label: str(h, 'label'),
        orders: intOf(h, 'orders'),
        revenue: dbl(h, 'revenue'),
      ),
    ),
    monthlyOverview: listOf(
      j,
      'monthlyOverview',
      (m) => MonthPoint(
        month: str(m, 'month'),
        revenue: dbl(m, 'revenue'),
        outflow: dbl(m, 'outflow'),
        orders: intOf(m, 'orders'),
      ),
    ),
    topProducts: listOf(
      j,
      'topProducts',
      (p) => TopProduct(
        productName: str(p, 'productName'),
        quantity: intOf(p, 'quantity'),
        revenue: dbl(p, 'revenue'),
        imageUrl: AppConfig.resolveAssetUrl(strOrNull(p, 'imageUrl')),
      ),
    ),
    recentOrders: listOf(j, 'recentOrders', orderSummaryFromJson),
    needsAttention: listOf(
      j,
      'needsAttention',
      (a) => AttentionItem(type: str(a, 'type'), label: str(a, 'label'), count: intOf(a, 'count')),
    ),
  );
}

/// Stored notifications only keep title + message; recover the order number
/// and mode the same way the web provider does.
String? _orderNumberFromMessage(String message) =>
    RegExp(r'placed order ([^\s·]+)').firstMatch(message)?.group(1)?.trim();

String? _orderModeFromTitle(String title) {
  if (RegExp('delivery', caseSensitive: false).hasMatch(title)) return OrderMode.delivery;
  if (RegExp('takeaway|pickup', caseSensitive: false).hasMatch(title)) return OrderMode.takeaway;
  return null;
}

AdminNotice noticeFromJson(Json j, {String? forceType}) => AdminNotice(
  id: strOrNull(j, 'id'),
  type: forceType ?? str(j, 'type', 'NEW_ORDER'),
  title: str(j, 'title'),
  message: str(j, 'message'),
  receivedAt: dateOrNull(j, 'createdAt') ?? DateTime.now(),
  orderId: strOrNull(j, 'orderId'),
  orderNumber: strOrNull(j, 'orderNumber') ?? _orderNumberFromMessage(str(j, 'message')),
  orderMode: strOrNull(j, 'orderMode') ?? _orderModeFromTitle(str(j, 'title')),
  customerName: strOrNull(j, 'customerName'),
  itemCount: intOrNull(j, 'itemCount'),
  total: dblOrNull(j, 'total'),
  queuePosition: intOrNull(j, 'queuePosition'),
  storeId: strOrNull(j, 'storeId'),
  read: boolOf(j, 'read'),
);
