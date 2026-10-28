import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/api_client.dart';
import '../utils/loyalty_utils.dart';
import 'auth_provider.dart';

const Object _unset = Object();

class LoyaltyState {
  final LoyaltySummary? summary;
  final bool isLoading;
  final String? errorMessage;

  const LoyaltyState({this.summary, this.isLoading = false, this.errorMessage});

  factory LoyaltyState.initial() => const LoyaltyState();

  LoyaltyState copyWith({
    Object? summary = _unset,
    bool? isLoading,
    Object? errorMessage = _unset,
  }) {
    return LoyaltyState(
      summary: identical(summary, _unset)
          ? this.summary
          : summary as LoyaltySummary?,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: identical(errorMessage, _unset)
          ? this.errorMessage
          : errorMessage as String?,
    );
  }
}

final loyaltyProvider = StateNotifierProvider<LoyaltyNotifier, LoyaltyState>((
  ref,
) {
  final api = ref.watch(apiClientProvider);
  final notifier = LoyaltyNotifier(api, ref);

  ref.listen<AuthState>(authProvider, (previous, next) {
    if (next.status == AuthStatus.authenticated) {
      notifier.fetchSummary();
    } else if (next.status == AuthStatus.unauthenticated) {
      notifier.clear();
    }
  }, fireImmediately: true);

  return notifier;
});

class LoyaltyNotifier extends StateNotifier<LoyaltyState> {
  final ApiClient _api;
  final Ref _ref;

  LoyaltyNotifier(this._api, this._ref) : super(LoyaltyState.initial());

  void clear() {
    state = LoyaltyState.initial();
  }

  Future<void> fetchSummary() async {
    final auth = _ref.read(authProvider);
    if (auth.status != AuthStatus.authenticated) {
      clear();
      return;
    }

    state = state.copyWith(isLoading: true, errorMessage: null);
    try {
      final data = await _api.get<Map<String, dynamic>>('/loyalty/summary');
      state = state.copyWith(
        summary: LoyaltySummary.fromJson(data),
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, errorMessage: e.toString());
    }
  }
}
