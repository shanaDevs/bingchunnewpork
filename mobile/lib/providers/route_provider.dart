import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/dev_config.dart';
import '../data/mock_delivery_route.dart';
import '../models/delivery_route.dart';
import '../services/api_client.dart';
import '../services/route_service.dart';
import 'auth_provider.dart';

final routeServiceProvider = Provider<RouteService>((ref) {
  return RouteService(auth: ref.watch(authServiceProvider));
});

class RouteState {
  final bool loading;
  final DeliveryRoute? route;
  final String? error;

  const RouteState({this.loading = false, this.route, this.error});

  RouteState copyWith({
    bool? loading,
    DeliveryRoute? route,
    String? error,
    bool clearRoute = false,
    bool clearError = false,
  }) {
    return RouteState(
      loading: loading ?? this.loading,
      route: clearRoute ? null : (route ?? this.route),
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class RouteNotifier extends StateNotifier<RouteState> {
  RouteNotifier(this._routes) : super(const RouteState());

  final RouteService _routes;

  Future<void> load() async {
    state = state.copyWith(loading: true, clearError: true);
    if (kUiPreviewMode) {
      await Future<void>.delayed(const Duration(milliseconds: 450));
      state = RouteState(route: mockDeliveryRoute());
      return;
    }
    try {
      final route = await _routes.fetchOptimizedRoute();
      state = RouteState(route: route);
    } on ApiException catch (e) {
      state = RouteState(error: e.message);
    } catch (_) {
      state = const RouteState(error: 'Failed to load route');
    }
  }
}

final routeProvider = StateNotifierProvider<RouteNotifier, RouteState>((ref) {
  return RouteNotifier(ref.watch(routeServiceProvider));
});
