import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/api_client.dart';
import 'auth_provider.dart';

class WishlistState {
  final Set<String> productIds;
  final bool isLoading;
  final bool hasLoaded;
  final String? errorMessage;

  const WishlistState({
    this.productIds = const {},
    this.isLoading = false,
    this.hasLoaded = false,
    this.errorMessage,
  });

  bool contains(String productId) => productIds.contains(productId);

  WishlistState copyWith({
    Set<String>? productIds,
    bool? isLoading,
    bool? hasLoaded,
    String? errorMessage,
  }) {
    return WishlistState(
      productIds: productIds ?? this.productIds,
      isLoading: isLoading ?? this.isLoading,
      hasLoaded: hasLoaded ?? this.hasLoaded,
      errorMessage: errorMessage,
    );
  }
}

final wishlistProvider = StateNotifierProvider<WishlistNotifier, WishlistState>((ref) {
  final api = ref.watch(apiClientProvider);
  final notifier = WishlistNotifier(api, ref);

  ref.listen<AuthState>(authProvider, (previous, next) {
    if (next.status == AuthStatus.authenticated &&
        previous?.status != AuthStatus.authenticated) {
      notifier.fetchIds();
    } else if (next.status == AuthStatus.unauthenticated) {
      notifier.clearLocal();
    }
  }, fireImmediately: true);

  return notifier;
});

class WishlistNotifier extends StateNotifier<WishlistState> {
  WishlistNotifier(this._api, this._ref) : super(const WishlistState());

  final ApiClient _api;
  final Ref _ref;

  void clearLocal() {
    state = const WishlistState(hasLoaded: true);
  }

  Future<void> fetchIds() async {
    final auth = _ref.read(authProvider);
    if (auth.status != AuthStatus.authenticated) {
      clearLocal();
      return;
    }

    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final ids = await _api.get<List<String>>(
        '/wishlist/ids',
        listParser: (list) => list.map((e) => e.toString()).toList(),
      );
      state = WishlistState(
        productIds: ids.toSet(),
        hasLoaded: true,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        hasLoaded: true,
        errorMessage: e.toString(),
      );
    }
  }

  /// Returns false when guest must sign in first.
  Future<bool> toggle(String productId) async {
    final auth = _ref.read(authProvider);
    if (auth.status != AuthStatus.authenticated) {
      return false;
    }

    final wasWishlisted = state.productIds.contains(productId);
    final next = Set<String>.from(state.productIds);
    if (wasWishlisted) {
      next.remove(productId);
    } else {
      next.add(productId);
    }
    state = state.copyWith(productIds: next);

    try {
      if (wasWishlisted) {
        await _api.delete<void>('/wishlist/$productId');
      } else {
        await _api.post<void>('/wishlist/$productId', {});
      }
      return true;
    } catch (e) {
      final rollback = Set<String>.from(state.productIds);
      if (wasWishlisted) {
        rollback.add(productId);
      } else {
        rollback.remove(productId);
      }
      state = state.copyWith(productIds: rollback, errorMessage: e.toString());
      rethrow;
    }
  }
}
