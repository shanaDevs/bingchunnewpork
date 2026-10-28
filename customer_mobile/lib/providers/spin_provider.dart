import 'dart:async';
import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/spin.dart';
import '../services/api_client.dart';
import '../services/spin_storage.dart';
import 'auth_provider.dart';
import 'cart_provider.dart';
import 'fulfillment_provider.dart';

class SpinUiState {
  const SpinUiState({
    this.enabled = false,
    this.offers = const [],
    this.eligibility,
    this.claim,
    this.loading = false,
    this.spinning = false,
    this.rotation = 0,
    this.result,
    this.error,
    this.openRequestId = 0,
    this.hydrated = false,
  });

  final bool enabled;
  final List<SpinOffer> offers;
  final SpinEligibility? eligibility;
  final SpinClaim? claim;
  final bool loading;
  final bool spinning;
  final double rotation;
  final SpinPlayResult? result;
  final String? error;
  final int openRequestId;
  final bool hydrated;

  bool get canSpin {
    final e = eligibility;
    return enabled &&
        e != null &&
        e.shouldShowEntryPoints &&
        offers.length >= 2 &&
        claim == null;
  }

  /// Fail-closed visibility for every customer Spin & Win entry point.
  bool get canShowTrigger =>
      hydrated && !loading && !spinning && result == null && canSpin;

  int get spinAnimMs => eligibility?.spinAnimMs ?? 8000;

  SpinUiState copyWith({
    bool? enabled,
    List<SpinOffer>? offers,
    Object? eligibility = _unset,
    Object? claim = _unset,
    bool? loading,
    bool? spinning,
    double? rotation,
    Object? result = _unset,
    Object? error = _unset,
    int? openRequestId,
    bool? hydrated,
  }) {
    return SpinUiState(
      enabled: enabled ?? this.enabled,
      offers: offers ?? this.offers,
      eligibility: identical(eligibility, _unset)
          ? this.eligibility
          : eligibility as SpinEligibility?,
      claim: identical(claim, _unset) ? this.claim : claim as SpinClaim?,
      loading: loading ?? this.loading,
      spinning: spinning ?? this.spinning,
      rotation: rotation ?? this.rotation,
      result: identical(result, _unset)
          ? this.result
          : result as SpinPlayResult?,
      error: identical(error, _unset) ? this.error : error as String?,
      openRequestId: openRequestId ?? this.openRequestId,
      hydrated: hydrated ?? this.hydrated,
    );
  }
}

const Object _unset = Object();

final spinProvider = StateNotifierProvider<SpinNotifier, SpinUiState>((ref) {
  final notifier = SpinNotifier(ref.watch(apiClientProvider), ref);

  ref.listen<AuthState>(authProvider, (previous, next) {
    if (previous?.status != next.status) {
      unawaited(notifier.refresh());
    }
  });
  ref.listen<FulfillmentState>(fulfillmentProvider, (previous, next) {
    if (previous?.storeId != next.storeId) {
      unawaited(notifier.refresh());
    }
  });

  return notifier;
});

class SpinNotifier extends StateNotifier<SpinUiState> {
  SpinNotifier(this._api, this._ref) : super(const SpinUiState()) {
    Future.microtask(hydrate);
  }

  final ApiClient _api;
  final Ref _ref;
  final _random = Random();
  int _refreshGeneration = 0;

  Future<void> hydrate() async {
    final claim = await SpinStorage.getClaim();
    state = state.copyWith(claim: claim, hydrated: true);
    await refresh();
  }

  /// Web `requestOpenSpin` — increments so modal/peek listeners reopen.
  void requestOpen() {
    state = state.copyWith(openRequestId: state.openRequestId + 1);
  }

  void resetSession() {
    state = state.copyWith(
      spinning: false,
      rotation: 0,
      result: null,
      error: null,
    );
  }

  Future<void> refresh() async {
    final generation = ++_refreshGeneration;
    state = state.copyWith(loading: true, error: null);
    try {
      final storeId = _ref.read(fulfillmentProvider).storeId;
      final guestKey = await SpinStorage.getGuestKey();
      final offersQs = storeId != null && storeId.isNotEmpty
          ? '?storeId=${Uri.encodeComponent(storeId)}'
          : '';
      final eligParams = <String, String>{'guestKey': guestKey};
      if (storeId != null && storeId.isNotEmpty) {
        eligParams['storeId'] = storeId;
      }
      final eligQs =
          '?${eligParams.entries.map((e) => '${e.key}=${Uri.encodeComponent(e.value)}').join('&')}';

      final catalog = await _api.get<Map<String, dynamic>>(
        '/spin/offers$offersQs',
        requireAuth: false,
        parser: (json) => json,
      );
      final eligibility = await _api.get<SpinEligibility>(
        '/spin/eligibility$eligQs',
        requireAuth: true,
        parser: SpinEligibility.fromJson,
      );
      final serverClaim = await _api.get<SpinClaim?>(
        '/spin/my-claim$eligQs',
        requireAuth: true,
        fullParser: (payload) {
          final data = payload['data'];
          if (data is Map<String, dynamic>) {
            return SpinClaim.fromJson(data);
          }
          if (data is Map) {
            return SpinClaim.fromJson(Map<String, dynamic>.from(data));
          }
          return null;
        },
      );
      if (generation != _refreshGeneration) return;

      if (eligibility.enabled && eligibility.canSpin) {
        await SpinStorage.clearConsumed();
      }

      final rawOffers = catalog['offers'];
      final offers = <SpinOffer>[];
      if (rawOffers is List) {
        for (final row in rawOffers) {
          if (row is Map) {
            try {
              final offer = SpinOffer.fromJson(Map<String, dynamic>.from(row));
              if (offer.isConfigured) offers.add(offer);
            } catch (_) {
              // Ignore malformed wheel rows; fewer than two fails closed.
            }
          }
        }
        offers.sort((a, b) => a.sortOrder.compareTo(b.sortOrder));
        final seen = <String>{};
        offers.retainWhere((offer) {
          final key =
              '${offer.sortOrder}|${offer.offerType}|${offer.label.trim().toLowerCase()}|${offer.discountValue}|${offer.giftProductId ?? ''}';
          if (seen.contains(key)) return false;
          seen.add(key);
          return true;
        });
      }

      final activeClaim = serverClaim?.isUsable == true ? serverClaim : null;
      if (activeClaim != null) {
        await SpinStorage.saveClaim(activeClaim);
      } else {
        await SpinStorage.clearClaim();
      }
      if (generation != _refreshGeneration) return;

      state = state.copyWith(
        loading: false,
        enabled: catalog['enabled'] == true,
        offers: offers,
        eligibility: eligibility,
        claim: activeClaim,
        hydrated: true,
      );
    } catch (e) {
      if (generation != _refreshGeneration) return;
      state = state.copyWith(
        loading: false,
        enabled: false,
        offers: const [],
        eligibility: null,
        error: e is ApiException ? e.message : e.toString(),
      );
    }
  }

  Future<void> dismissForToday() async {
    await SpinStorage.markPopupShown(
      state.eligibility?.nextSpinAt?.millisecondsSinceEpoch,
    );
    resetSession();
  }

  Future<void> markConsumedFromEligibility() async {
    final until = state.eligibility?.nextSpinAt?.millisecondsSinceEpoch;
    await SpinStorage.markConsumed(until);
  }

  Future<SpinPlayResult?> play() async {
    if (state.spinning || state.result != null) return null;

    // Refresh every server-owned rule and active claim immediately before play.
    await refresh();
    if (state.spinning || state.result != null) return null;

    final eligibility = state.eligibility;
    if (eligibility == null) {
      state = state.copyWith(
        error: state.error ?? 'Could not verify spin eligibility',
      );
      return null;
    }
    if (!state.enabled || !eligibility.enabled || !eligibility.canSpin) {
      final msg = SpinStorage.formatCooldownMessage(
        eligibility.nextSpinAt,
        eligibility.reason,
      );
      state = state.copyWith(error: msg);
      return null;
    }

    if (state.claim != null) {
      state = state.copyWith(
        error: 'Use your current spin reward before spinning again',
      );
      return null;
    }

    if (await SpinStorage.isConsumedLocally()) {
      final msg = SpinStorage.formatCooldownMessage(
        eligibility.nextSpinAt,
        eligibility.reason,
      );
      state = state.copyWith(error: msg);
      return null;
    }

    state = state.copyWith(spinning: true, error: null);

    try {
      final guestKey = await SpinStorage.getGuestKey();
      final storeId = _ref.read(fulfillmentProvider).storeId;
      final play = await _api.post<SpinPlayResult>(
        '/spin/play',
        {
          'guestKey': guestKey,
          if (storeId != null && storeId.isNotEmpty) 'storeId': storeId,
        },
        requireAuth: true,
        parser: SpinPlayResult.fromJson,
      );

      final windowHours = eligibility.spinWindowHours;
      final parsed = eligibility.nextSpinAt?.millisecondsSinceEpoch;
      final until =
          (parsed != null && parsed > DateTime.now().millisecondsSinceEpoch)
          ? parsed
          : DateTime.now()
                .add(Duration(hours: windowHours))
                .millisecondsSinceEpoch;
      await SpinStorage.markConsumed(until);

      // Optimistic eligibility lock (web persistSpinUsed).
      final allowed = eligibility.spinsAllowed;
      final used = (eligibility.spinsUsed + (eligibility.canSpin ? 1 : 0))
          .clamp(0, allowed);
      state = state.copyWith(
        eligibility: SpinEligibility(
          enabled: eligibility.enabled,
          canSpin: false,
          reason: eligibility.reason,
          nextSpinAt:
              eligibility.nextSpinAt ??
              DateTime.fromMillisecondsSinceEpoch(until),
          spinsUsed: used == 0 ? 1 : used,
          spinsAllowed: allowed,
          spinsRemaining: 0,
          spinDurationSeconds: eligibility.spinDurationSeconds,
          spinWindowHours: eligibility.spinWindowHours,
        ),
      );

      if (play.alreadyClaimed) {
        final claim = play.toClaim();
        if (claim != null) {
          await SpinStorage.saveClaim(claim);
          state = state.copyWith(claim: claim, result: play, spinning: false);
          await _applyClaimToCart(claim);
        } else {
          state = state.copyWith(result: play, spinning: false);
        }
        return play;
      }

      final count = state.offers.length;
      final index = play.offerIndex >= 0 && play.offerIndex < count
          ? play.offerIndex
          : 0;
      final extraTurns = 5 + _random.nextInt(3);
      final next = SpinWheelMath.nextRotation(
        currentRotation: state.rotation,
        index: index,
        count: count,
        extraTurns: extraTurns,
      );
      state = state.copyWith(rotation: next);
      return play;
    } catch (e) {
      state = state.copyWith(spinning: false);
      final msg = e is ApiException ? e.message : e.toString();
      state = state.copyWith(error: msg);
      if (e is ApiException && e.status == 429) {
        await markConsumedFromEligibility();
      }
      rethrow;
    }
  }

  Future<void> completeSpin(SpinPlayResult play) async {
    final claim = play.toClaim();
    if (claim != null) {
      await SpinStorage.saveClaim(claim);
      await _applyClaimToCart(claim);
    }
    state = state.copyWith(
      spinning: false,
      result: play,
      claim: claim ?? state.claim,
    );
    await refresh();
  }

  Future<void> _applyClaimToCart(SpinClaim claim) async {
    try {
      await _ref.read(cartProvider.notifier).applyPromoCode(claim.claimCode);
    } catch (_) {
      _ref.read(cartProvider.notifier).setPromoCode(claim.claimCode);
    }
  }
}
