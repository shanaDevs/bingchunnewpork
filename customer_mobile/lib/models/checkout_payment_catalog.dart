import '../utils/checkout_fees.dart';

class CheckoutPaymentMethod {
  final String id;
  final String label;
  final String? icon;

  const CheckoutPaymentMethod({
    required this.id,
    required this.label,
    this.icon,
  });

  factory CheckoutPaymentMethod.fromJson(Map<String, dynamic> json) {
    return CheckoutPaymentMethod(
      id: (json['id'] as String? ?? '').toUpperCase(),
      label: (json['label'] as String?)?.trim().isNotEmpty == true
          ? json['label'] as String
          : _fallbackLabel(json['id'] as String?),
      icon: json['icon'] as String?,
    );
  }

  static String _fallbackLabel(String? id) {
    switch ((id ?? '').toUpperCase()) {
      case 'PAYHERE':
      case 'CARD':
        return 'Pay Online';
      case 'CASH_AT_COUNTER':
        return 'Cash at Counter';
      default:
        return id ?? 'Payment';
    }
  }

  bool get isOnline => id == 'PAYHERE' || id == 'CARD';
}

class CheckoutPaymentCatalog {
  final List<CheckoutPaymentMethod> methods;
  final String activeOnlineGateway; // PAYHERE | WEBXPAY
  final bool onlineGatewayConfigured;
  final ConvenienceFeeRates feeRates;
  final int pickupOnlinePaymentThreshold;

  const CheckoutPaymentCatalog({
    required this.methods,
    this.activeOnlineGateway = 'PAYHERE',
    this.onlineGatewayConfigured = true,
    this.feeRates = ConvenienceFeeRates.defaults,
    this.pickupOnlinePaymentThreshold = 1000,
  });

  factory CheckoutPaymentCatalog.fromJson(Map<String, dynamic> json) {
    final rawMethods = json['methods'] as List<dynamic>? ?? const [];
    final methods = rawMethods
        .whereType<Map>()
        .map((m) => CheckoutPaymentMethod.fromJson(Map<String, dynamic>.from(m)))
        .where((m) => m.id.isNotEmpty)
        .toList();

    final gateway = (json['activeOnlineGateway'] as String? ?? 'PAYHERE').toUpperCase();
    return CheckoutPaymentCatalog(
      methods: methods,
      activeOnlineGateway: gateway == 'WEBXPAY' ? 'WEBXPAY' : 'PAYHERE',
      onlineGatewayConfigured: json['onlineGatewayConfigured'] as bool? ?? true,
      feeRates: resolveCheckoutConvenienceRates(
        convenientFeeRate: (json['convenientFeeRate'] as num?)?.toDouble(),
        pickupConvenientFeeRate: (json['pickupConvenientFeeRate'] as num?)?.toDouble(),
        deliveryConvenientFeeRate: (json['deliveryConvenientFeeRate'] as num?)?.toDouble(),
      ),
      pickupOnlinePaymentThreshold:
          (json['pickupOnlinePaymentThreshold'] as num?)?.toInt() ?? 1000,
    );
  }

  static const empty = CheckoutPaymentCatalog(methods: []);
}
