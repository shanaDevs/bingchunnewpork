import '../config/api_config.dart';

class OrderItem {
  final String id;
  final String productId;
  final String productName;
  final String size;
  final int quantity;
  final int unitPrice;
  final int totalPrice;
  final List<String> toppings;
  final String? imageUrl;

  OrderItem({
    required this.id,
    required this.productId,
    required this.productName,
    required this.size,
    required this.quantity,
    required this.unitPrice,
    required this.totalPrice,
    required this.toppings,
    String? imageUrl,
  }) : imageUrl = ApiConfig.resolveAssetUrl(imageUrl);

  factory OrderItem.fromJson(Map<String, dynamic> json) {
    final List<String> parsedToppings = [];
    if (json['toppings'] != null) {
      for (final dynamic t in json['toppings']) {
        if (t is Map<String, dynamic>) {
          parsedToppings.add(t['toppingName'] as String? ?? (t['topping']?['name'] as String? ?? ''));
        }
      }
    }

    return OrderItem(
      id: json['id'] as String? ?? '',
      productId: json['productId'] as String? ?? '',
      productName: json['productName'] as String? ?? '',
      size: json['size'] as String? ?? 'REGULAR',
      quantity: json['quantity'] as int? ?? 1,
      unitPrice: json['unitPrice'] as int? ?? 0,
      totalPrice: json['totalPrice'] as int? ?? 0,
      toppings: parsedToppings.where((t) => t.isNotEmpty).toList(),
      imageUrl: _resolveItemImageUrl(json),
    );
  }

  static String? _resolveItemImageUrl(Map<String, dynamic> json) {
    final direct = json['imageUrl'] as String?;
    if (direct != null && direct.isNotEmpty) return direct;

    final product = json['product'];
    if (product is Map<String, dynamic>) {
      final fromProduct = product['imageUrl'] as String?;
      if (fromProduct != null && fromProduct.isNotEmpty) return fromProduct;
    }

    return null;
  }
}

class Order {
  final String id;
  final String orderNumber;
  final String status;
  final String orderMode;
  final String paymentMethod;
  final String paymentStatus;
  final int subtotal;
  final int deliveryFee;
  final int convenientFee;
  final int discount;
  final int total;
  final String? promoCode;
  final String? qrCode;
  final String? pickupTime;
  final int? queuePosition;
  final int estimatedMinutes;
  final String? deliveryAddressLine;
  final String? deliveryCity;
  final double? deliveryLat;
  final double? deliveryLng;
  final String? storeName;
  final String? storeAddressLine;
  final double? storeLat;
  final double? storeLng;
  final String? customerName;
  final String? customerPhone;
  final int loyaltyDiscount;
  final DateTime createdAt;
  final List<OrderItem> items;
  final double? driverLat;
  final double? driverLng;
  final double? driverHeading;
  final String? deliveryPhase;

  Order({
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.orderMode,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.subtotal,
    required this.deliveryFee,
    this.convenientFee = 0,
    required this.discount,
    required this.total,
    this.promoCode,
    this.qrCode,
    this.pickupTime,
    this.queuePosition,
    required this.estimatedMinutes,
    this.deliveryAddressLine,
    this.deliveryCity,
    this.deliveryLat,
    this.deliveryLng,
    this.storeName,
    this.storeAddressLine,
    this.storeLat,
    this.storeLng,
    this.customerName,
    this.customerPhone,
    this.loyaltyDiscount = 0,
    required this.createdAt,
    required this.items,
    this.driverLat,
    this.driverLng,
    this.driverHeading,
    this.deliveryPhase,
  });

  factory Order.fromJson(Map<String, dynamic> json) {
    final List<OrderItem> parsedItems = [];
    if (json['items'] != null) {
      for (final dynamic item in json['items']) {
        parsedItems.add(OrderItem.fromJson(item as Map<String, dynamic>));
      }
    }

    return Order(
      id: json['id'] as String,
      orderNumber: json['orderNumber'] as String,
      status: json['status'] as String,
      orderMode: json['orderMode'] as String,
      paymentMethod: json['paymentMethod'] as String,
      paymentStatus: json['paymentStatus'] as String,
      subtotal: json['subtotal'] as int? ?? 0,
      deliveryFee: json['deliveryFee'] as int? ?? 0,
      convenientFee: json['convenientFee'] as int? ?? 0,
      discount: json['discount'] as int? ?? 0,
      total: json['total'] as int? ?? 0,
      promoCode: json['promoCode'] as String?,
      qrCode: json['qrCode'] as String?,
      pickupTime: json['pickupTime'] as String?,
      queuePosition: json['queuePosition'] as int?,
      estimatedMinutes: json['estimatedMinutes'] as int? ?? 30,
      deliveryAddressLine: json['deliveryAddressLine'] as String? ??
          (json['address'] is Map ? (json['address'] as Map)['addressLine'] as String? : null),
      deliveryCity: json['deliveryCity'] as String? ??
          (json['address'] is Map ? (json['address'] as Map)['city'] as String? : null),
      deliveryLat: json['deliveryLat'] != null ? (json['deliveryLat'] as num).toDouble() : null,
      deliveryLng: json['deliveryLng'] != null ? (json['deliveryLng'] as num).toDouble() : null,
      storeName: json['store'] is Map ? (json['store'] as Map)['name'] as String? : null,
      storeAddressLine: json['store'] is Map ? (json['store'] as Map)['addressLine'] as String? : null,
      storeLat: json['store'] is Map && (json['store'] as Map)['lat'] != null
          ? ((json['store'] as Map)['lat'] as num).toDouble()
          : null,
      storeLng: json['store'] is Map && (json['store'] as Map)['lng'] != null
          ? ((json['store'] as Map)['lng'] as num).toDouble()
          : null,
      customerName: json['guestName'] as String?,
      customerPhone: json['guestPhone'] as String?,
      loyaltyDiscount: json['loyaltyDiscount'] as int? ?? 0,
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt'] as String)
          : DateTime.now(),
      items: parsedItems,
      driverLat: _nestedDouble(json['driverLocation'], 'lat') ??
          (json['driverLat'] is num ? (json['driverLat'] as num).toDouble() : null),
      driverLng: _nestedDouble(json['driverLocation'], 'lng') ??
          (json['driverLng'] is num ? (json['driverLng'] as num).toDouble() : null),
      driverHeading: _nestedDouble(json['driverLocation'], 'heading'),
      deliveryPhase: json['deliveryPhase'] as String?,
    );
  }

  static double? _nestedDouble(dynamic map, String key) {
    if (map is! Map) return null;
    final value = map[key];
    if (value is num) return value.toDouble();
    if (value is String) return double.tryParse(value);
    return null;
  }

  String get statusDisplay {
    switch (status) {
      case 'RECEIVED': return 'Order Placed';
      case 'PREPARING': return 'Preparing';
      case 'READY': return 'Ready for Pickup';
      case 'OUT_FOR_DELIVERY': return 'Out for Delivery';
      case 'DELIVERED': return 'Delivered';
      case 'CANCELLED': return 'Cancelled';
      default: return status;
    }
  }

  bool get isActive => status != 'DELIVERED' && status != 'CANCELLED';

  Order copyWith({
    String? status,
    int? queuePosition,
    String? pickupTime,
    int? estimatedMinutes,
    String? qrCode,
  }) {
    return Order(
      id: id,
      orderNumber: orderNumber,
      status: status ?? this.status,
      orderMode: orderMode,
      paymentMethod: paymentMethod,
      paymentStatus: paymentStatus,
      subtotal: subtotal,
      deliveryFee: deliveryFee,
      convenientFee: convenientFee,
      discount: discount,
      total: total,
      promoCode: promoCode,
      qrCode: qrCode ?? this.qrCode,
      pickupTime: pickupTime ?? this.pickupTime,
      queuePosition: queuePosition ?? this.queuePosition,
      estimatedMinutes: estimatedMinutes ?? this.estimatedMinutes,
      deliveryAddressLine: deliveryAddressLine,
      deliveryCity: deliveryCity,
      deliveryLat: deliveryLat,
      deliveryLng: deliveryLng,
      storeName: storeName,
      storeAddressLine: storeAddressLine,
      storeLat: storeLat,
      storeLng: storeLng,
      customerName: customerName,
      customerPhone: customerPhone,
      loyaltyDiscount: loyaltyDiscount,
      createdAt: createdAt,
      items: items,
      driverLat: driverLat,
      driverLng: driverLng,
      driverHeading: driverHeading,
      deliveryPhase: deliveryPhase,
    );
  }

  int get itemCount => items.fold<int>(0, (sum, item) => sum + item.quantity);

  String? get heroImageUrl =>
      items.isNotEmpty ? items.first.imageUrl : null;
}
