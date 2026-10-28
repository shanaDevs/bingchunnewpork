import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../utils/loyalty_utils.dart';
import 'loyalty_provider.dart';

/// Keys for measuring cup FAB and bottom-nav Rewards icon (loyalty float path).
final floatingCupFabKey = GlobalKey(debugLabel: 'floatingCupFab');
final bottomNavRewardsKey = GlobalKey(debugLabel: 'bottomNavRewards');

class LoyaltyFloatParticle {
  final int id;
  final String direction; // 'add' | 'remove'
  final int pointsEarned;
  final int pointsDelta;
  final int subtotal;
  final int minOrderToEarn;
  final Offset from;
  final Offset to;

  const LoyaltyFloatParticle({
    required this.id,
    required this.direction,
    required this.pointsEarned,
    required this.pointsDelta,
    required this.subtotal,
    required this.minOrderToEarn,
    required this.from,
    required this.to,
  });

  bool get isAdd => direction == 'add';
}

class LoyaltyFloatState {
  final List<LoyaltyFloatParticle> particles;
  final int rewardsPulseToken;
  final int? flashPoints;
  final int? flashDelta;
  final String? flashDirection;

  const LoyaltyFloatState({
    this.particles = const [],
    this.rewardsPulseToken = 0,
    this.flashPoints,
    this.flashDelta,
    this.flashDirection,
  });

  LoyaltyFloatState copyWith({
    List<LoyaltyFloatParticle>? particles,
    int? rewardsPulseToken,
    int? flashPoints,
    int? flashDelta,
    String? flashDirection,
    bool clearFlash = false,
  }) {
    return LoyaltyFloatState(
      particles: particles ?? this.particles,
      rewardsPulseToken: rewardsPulseToken ?? this.rewardsPulseToken,
      flashPoints: clearFlash ? null : (flashPoints ?? this.flashPoints),
      flashDelta: clearFlash ? null : (flashDelta ?? this.flashDelta),
      flashDirection: clearFlash ? null : (flashDirection ?? this.flashDirection),
    );
  }
}

final loyaltyFloatProvider =
    StateNotifierProvider<LoyaltyFloatNotifier, LoyaltyFloatState>((ref) {
  return LoyaltyFloatNotifier(ref);
});

class LoyaltyFloatNotifier extends StateNotifier<LoyaltyFloatState> {
  LoyaltyFloatNotifier(this._ref) : super(const LoyaltyFloatState());

  final Ref _ref;
  int _seq = 0;

  static const floatDuration = Duration(milliseconds: 2400);
  static const floatCleanup = Duration(milliseconds: 2800);
  static const rewardsPulseDelay = Duration(milliseconds: 2200);

  Offset? _centerOf(GlobalKey key) {
    final ctx = key.currentContext;
    if (ctx == null) return null;
    final box = ctx.findRenderObject() as RenderBox?;
    if (box == null || !box.hasSize) return null;
    return box.localToGlobal(box.size.center(Offset.zero));
  }

  Offset _fallbackCup(Size screen) =>
      Offset(screen.width - 72, 100);

  Offset _fallbackRewards(Size screen) =>
      Offset(screen.width * 0.7, screen.height - 48);

  /// Fire a gift float when cart subtotal changes (matches web `triggerLoyaltyPointsFloat`).
  void triggerFromSubtotalChange({
    required String direction,
    required int subtotalBefore,
    required int subtotalAfter,
    required Size screenSize,
  }) {
    if (subtotalBefore == subtotalAfter) return;

    final settings =
        _ref.read(loyaltyProvider).summary?.settings ?? const LoyaltySettings();
    final pointsBefore = estimateLoyaltyPointsEarned(subtotalBefore, settings);
    final pointsAfter = estimateLoyaltyPointsEarned(subtotalAfter, settings);

    final cup = _centerOf(floatingCupFabKey) ?? _fallbackCup(screenSize);
    final rewards =
        _centerOf(bottomNavRewardsKey) ?? _fallbackRewards(screenSize);

    final from = direction == 'add' ? cup : rewards;
    final to = direction == 'add' ? rewards : cup;
    final id = ++_seq;

    final particle = LoyaltyFloatParticle(
      id: id,
      direction: direction,
      pointsEarned: pointsAfter,
      pointsDelta: pointsAfter - pointsBefore,
      subtotal: subtotalAfter,
      minOrderToEarn: settings.minOrderToEarn,
      from: from,
      to: to,
    );

    state = state.copyWith(
      particles: [...state.particles, particle],
      flashPoints: pointsAfter,
      flashDelta: pointsAfter - pointsBefore,
      flashDirection: direction,
    );

    Future<void>.delayed(floatCleanup, () {
      if (!mounted) return;
      state = state.copyWith(
        particles: state.particles.where((p) => p.id != id).toList(),
      );
    });

    if (direction == 'add') {
      Future<void>.delayed(rewardsPulseDelay, () {
        if (!mounted) return;
        state = state.copyWith(rewardsPulseToken: state.rewardsPulseToken + 1);
      });
    }

    // Keep badge until checkout / empty cart (cleared via [clearBadge]).
    if (pointsAfter <= 0) {
      state = state.copyWith(clearFlash: true);
    }
  }

  /// Hide Rewards nav points badge (call after checkout / clear cart).
  void clearBadge() {
    state = state.copyWith(clearFlash: true);
  }

  /// Keep badge in sync with cart subtotal without replaying the float.
  void syncBadgeFromSubtotal(int subtotal) {
    final settings =
        _ref.read(loyaltyProvider).summary?.settings ?? const LoyaltySettings();
    final points = estimateLoyaltyPointsEarned(subtotal, settings);
    if (points <= 0) {
      state = state.copyWith(clearFlash: true);
      return;
    }
    state = state.copyWith(
      flashPoints: points,
      flashDelta: 0,
      flashDirection: 'add',
    );
  }
}
