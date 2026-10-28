import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'auth_provider.dart';
import '../services/api_client.dart';

class FulfillmentState {
  final String? orderMode; // 'DELIVERY' or 'TAKEAWAY'
  final String? storeId;
  final String? storeName;
  final String? deliveryZoneId;
  final int deliveryFee;
  final String? deliveryAddress;
  final double? lat;
  final double? lng;
  final int estimatedMinutes;
  final bool isInitialized;
  /// True after secure-storage cache has been read (or failed).
  final bool isHydrated;

  FulfillmentState({
    this.orderMode,
    this.storeId,
    this.storeName,
    this.deliveryZoneId,
    this.deliveryFee = 0,
    this.deliveryAddress,
    this.lat,
    this.lng,
    this.estimatedMinutes = 30,
    this.isInitialized = false,
    this.isHydrated = false,
  });

  factory FulfillmentState.initial({bool isHydrated = false}) =>
      FulfillmentState(isHydrated: isHydrated);

  /// Method + branch (or delivery address/store) have been chosen.
  bool get hasCompletedSetup {
    final id = storeId;
    return isInitialized &&
        orderMode != null &&
        orderMode!.isNotEmpty &&
        id != null &&
        id.isNotEmpty;
  }

  FulfillmentState copyWith({
    String? orderMode,
    String? storeId,
    String? storeName,
    String? deliveryZoneId,
    int? deliveryFee,
    String? deliveryAddress,
    double? lat,
    double? lng,
    int? estimatedMinutes,
    bool? isInitialized,
    bool? isHydrated,
  }) {
    return FulfillmentState(
      orderMode: orderMode ?? this.orderMode,
      storeId: storeId ?? this.storeId,
      storeName: storeName ?? this.storeName,
      deliveryZoneId: deliveryZoneId ?? this.deliveryZoneId,
      deliveryFee: deliveryFee ?? this.deliveryFee,
      deliveryAddress: deliveryAddress ?? this.deliveryAddress,
      lat: lat ?? this.lat,
      lng: lng ?? this.lng,
      estimatedMinutes: estimatedMinutes ?? this.estimatedMinutes,
      isInitialized: isInitialized ?? this.isInitialized,
      isHydrated: isHydrated ?? this.isHydrated,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      if (orderMode != null) 'orderMode': orderMode,
      if (storeId != null) 'storeId': storeId,
      if (storeName != null) 'storeName': storeName,
      if (deliveryZoneId != null) 'deliveryZoneId': deliveryZoneId,
      'deliveryFee': deliveryFee,
      if (deliveryAddress != null) 'deliveryAddress': deliveryAddress,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      'estimatedMinutes': estimatedMinutes,
      'isInitialized': isInitialized,
    };
  }

  factory FulfillmentState.fromJson(Map<String, dynamic> json) {
    return FulfillmentState(
      orderMode: json['orderMode'] as String?,
      storeId: json['storeId'] as String?,
      storeName: json['storeName'] as String?,
      deliveryZoneId: json['deliveryZoneId'] as String?,
      deliveryFee: json['deliveryFee'] as int? ?? 0,
      deliveryAddress: json['deliveryAddress'] as String?,
      lat: json['lat'] as double?,
      lng: json['lng'] as double?,
      estimatedMinutes: json['estimatedMinutes'] as int? ?? 30,
      isInitialized: json['isInitialized'] as bool? ?? false,
    );
  }
}

final fulfillmentProvider = StateNotifierProvider<FulfillmentNotifier, FulfillmentState>((ref) {
  final api = ref.watch(apiClientProvider);
  final notifier = FulfillmentNotifier(api);
  ref.listen<AuthState>(authProvider, (previous, next) {
    if (next.status == AuthStatus.unauthenticated &&
        previous?.status == AuthStatus.authenticated) {
      notifier.clear();
    }
  });
  return notifier;
});

class FulfillmentNotifier extends StateNotifier<FulfillmentState> {
  final ApiClient _api;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  static const _cacheKey = 'bc_fulfillment_setup';

  FulfillmentNotifier(this._api) : super(FulfillmentState.initial()) {
    _loadFromCache();
  }

  Future<void> _loadFromCache() async {
    try {
      final cached = await _storage.read(key: _cacheKey);
      if (cached != null) {
        state = FulfillmentState.fromJson(jsonDecode(cached) as Map<String, dynamic>)
            .copyWith(isHydrated: true);
      } else {
        state = FulfillmentState.initial(isHydrated: true);
      }
    } catch (_) {
      state = FulfillmentState.initial(isHydrated: true);
    }
  }

  Future<void> _saveToCache() async {
    try {
      await _storage.write(key: _cacheKey, value: jsonEncode(state.toJson()));
    } catch (_) {}
  }

  Future<bool> setTakeaway(String storeId, String storeName) async {
    state = FulfillmentState(
      orderMode: 'TAKEAWAY',
      storeId: storeId,
      storeName: storeName,
      isInitialized: true,
      isHydrated: true,
    );
    await _saveToCache();
    return true;
  }

  Future<Map<String, dynamic>?> validateAndSetDelivery({
    required String address,
    double? lat,
    double? lng,
    String? storeId,
  }) async {
    try {
      final body = {
        'address': address,
        if (lat != null) 'lat': lat,
        if (lng != null) 'lng': lng,
        if (storeId != null) 'storeId': storeId,
      };

      final data = await _api.post<Map<String, dynamic>>('/stores/validate-delivery', body, requireAuth: false);
      final eligible = data['eligible'] as bool? ?? false;

      if (!eligible) {
        return {
          'eligible': false,
          'message': data['message'] as String? ?? 'Delivery is not eligible for this address',
        };
      }

      final store = data['store'] as Map<String, dynamic>;
      final zone = data['zone'] as Map<String, dynamic>;

      state = FulfillmentState(
        orderMode: 'DELIVERY',
        storeId: store['id'] as String,
        storeName: store['name'] as String,
        deliveryZoneId: zone['id'] as String,
        deliveryFee: zone['fee'] as int? ?? 0,
        deliveryAddress: address,
        lat: lat,
        lng: lng,
        estimatedMinutes: data['estimatedMinutes'] as int? ?? 35,
        isInitialized: true,
        isHydrated: true,
      );

      await _saveToCache();
      return {'eligible': true};
    } catch (e) {
      return {
        'eligible': false,
        'message': e.toString(),
      };
    }
  }

  Future<void> clear() async {
    await _storage.delete(key: _cacheKey);
    state = FulfillmentState.initial(isHydrated: true);
  }
}
