class JobSummary {
  final String id;
  final String title;
  final String status;
  final DateTime scheduledAt;
  final DateTime? assignedAt;
  final String storeName;
  final String storeCity;
  final int orderCount;
  final bool isMine;

  const JobSummary({
    required this.id,
    required this.title,
    required this.status,
    required this.scheduledAt,
    this.assignedAt,
    required this.storeName,
    required this.storeCity,
    required this.orderCount,
    required this.isMine,
  });

  factory JobSummary.fromJson(Map<String, dynamic> json) {
    return JobSummary(
      id: json['id'] as String,
      title: json['title'] as String,
      status: json['status'] as String,
      scheduledAt: DateTime.parse(json['scheduledAt'] as String),
      assignedAt: json['assignedAt'] != null ? DateTime.parse(json['assignedAt'] as String) : null,
      storeName: json['storeName'] as String,
      storeCity: json['storeCity'] as String,
      orderCount: json['orderCount'] as int,
      isMine: json['isMine'] as bool? ?? false,
    );
  }
}

class JobStore {
  final String id;
  final String name;
  final String addressLine;
  final String city;
  final double lat;
  final double lng;

  const JobStore({
    required this.id,
    required this.name,
    required this.addressLine,
    required this.city,
    required this.lat,
    required this.lng,
  });

  factory JobStore.fromJson(Map<String, dynamic> json) {
    return JobStore(
      id: json['id'] as String,
      name: json['name'] as String,
      addressLine: json['addressLine'] as String,
      city: json['city'] as String,
      lat: (json['lat'] as num).toDouble(),
      lng: (json['lng'] as num).toDouble(),
    );
  }
}

class JobOrderItem {
  final String productName;
  final int quantity;
  final int totalPrice;

  const JobOrderItem({
    required this.productName,
    required this.quantity,
    required this.totalPrice,
  });

  factory JobOrderItem.fromJson(Map<String, dynamic> json) {
    return JobOrderItem(
      productName: json['productName'] as String,
      quantity: json['quantity'] as int,
      totalPrice: json['totalPrice'] as int,
    );
  }
}

class JobOrder {
  final String orderId;
  final String orderNumber;
  final int sequence;
  final String status;
  final String paymentMethod;
  final String paymentStatus;
  final int total;
  final int deliveryFee;
  final int estimatedMinutes;
  final String? notes;
  final String customerName;
  final String customerPhone;
  final String addressLine;
  final String city;
  final String district;
  final double? lat;
  final double? lng;
  final List<JobOrderItem> items;

  const JobOrder({
    required this.orderId,
    required this.orderNumber,
    required this.sequence,
    required this.status,
    required this.paymentMethod,
    required this.paymentStatus,
    required this.total,
    required this.deliveryFee,
    required this.estimatedMinutes,
    this.notes,
    required this.customerName,
    required this.customerPhone,
    required this.addressLine,
    required this.city,
    required this.district,
    this.lat,
    this.lng,
    required this.items,
  });

  factory JobOrder.fromJson(Map<String, dynamic> json) {
    return JobOrder(
      orderId: json['orderId'] as String,
      orderNumber: json['orderNumber'] as String,
      sequence: json['sequence'] as int,
      status: json['status'] as String,
      paymentMethod: json['paymentMethod'] as String,
      paymentStatus: json['paymentStatus'] as String,
      total: json['total'] as int,
      deliveryFee: json['deliveryFee'] as int,
      estimatedMinutes: json['estimatedMinutes'] as int,
      notes: json['notes'] as String?,
      customerName: json['customerName'] as String,
      customerPhone: json['customerPhone'] as String,
      addressLine: json['addressLine'] as String,
      city: json['city'] as String,
      district: json['district'] as String,
      lat: (json['lat'] as num?)?.toDouble(),
      lng: (json['lng'] as num?)?.toDouble(),
      items: (json['items'] as List<dynamic>)
          .map((e) => JobOrderItem.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  String get fullAddress {
    final parts = [addressLine, city, district].where((p) => p.isNotEmpty);
    return parts.join(', ');
  }

  bool get isDelivered => status == 'DELIVERED';
  bool get isPending => status != 'DELIVERED' && status != 'CANCELLED';
}

class DeliveryJobDetail {
  final String id;
  final String title;
  final String status;
  final DateTime scheduledAt;
  final DateTime? assignedAt;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final JobStore store;
  final int orderCount;
  final int deliveredCount;
  final List<JobOrder> orders;
  final bool pickedUp;

  const DeliveryJobDetail({
    required this.id,
    required this.title,
    required this.status,
    required this.scheduledAt,
    this.assignedAt,
    this.startedAt,
    this.completedAt,
    required this.store,
    required this.orderCount,
    required this.deliveredCount,
    required this.orders,
    this.pickedUp = false,
  });

  factory DeliveryJobDetail.fromJson(Map<String, dynamic> json) {
    return DeliveryJobDetail(
      id: json['id'] as String,
      title: json['title'] as String,
      status: json['status'] as String,
      scheduledAt: DateTime.parse(json['scheduledAt'] as String),
      assignedAt: json['assignedAt'] != null ? DateTime.parse(json['assignedAt'] as String) : null,
      startedAt: json['startedAt'] != null ? DateTime.parse(json['startedAt'] as String) : null,
      completedAt: json['completedAt'] != null ? DateTime.parse(json['completedAt'] as String) : null,
      store: JobStore.fromJson(json['store'] as Map<String, dynamic>),
      orderCount: json['orderCount'] as int,
      deliveredCount: json['deliveredCount'] as int,
      orders: (json['orders'] as List<dynamic>)
          .map((e) => JobOrder.fromJson(e as Map<String, dynamic>))
          .toList(),
      pickedUp: json['pickedUp'] as bool? ?? false,
    );
  }

  bool get canAssign => status == 'SCHEDULED';
  bool get needsPickup => status == 'ASSIGNED' && !pickedUp;
  bool get canStart => status == 'ASSIGNED' && pickedUp;
  bool get headingToStore => needsPickup;
  bool get isActive => status == 'ASSIGNED' || status == 'QUEUED' || status == 'IN_PROGRESS';
  bool get canComplete => status == 'IN_PROGRESS' && deliveredCount == orderCount;
  bool get allDelivered => deliveredCount == orderCount && orderCount > 0;

  DeliveryJobDetail copyWith({
    int? deliveredCount,
    List<JobOrder>? orders,
    bool? pickedUp,
    String? status,
  }) {
    return DeliveryJobDetail(
      id: id,
      title: title,
      status: status ?? this.status,
      scheduledAt: scheduledAt,
      assignedAt: assignedAt,
      startedAt: startedAt,
      completedAt: completedAt,
      store: store,
      orderCount: orderCount,
      deliveredCount: deliveredCount ?? this.deliveredCount,
      orders: orders ?? this.orders,
      pickedUp: pickedUp ?? this.pickedUp,
    );
  }
}
