import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../config/api_config.dart';
import '../l10n/app_localizations.dart';
import '../models/spin.dart';
import '../providers/cart_provider.dart';
import '../providers/spin_provider.dart';
import '../services/api_client.dart';
import '../services/spin_storage.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';
import 'spin_casino_icon.dart';
import 'spin_wheel.dart';

/// Web ease `[0.08, 0.22, 0.12, 1]`.
const _spinEase = Cubic(0.08, 0.22, 0.12, 1);

Future<void> showSpinWheelModal(
  BuildContext context, {
  bool startAtIntro = false,
}) async {
  final container = ProviderScope.containerOf(context, listen: false);
  await container.read(spinProvider.notifier).refresh();
  if (!context.mounted) return;

  final spin = container.read(spinProvider);
  final eligibility = spin.eligibility;
  if (!spin.enabled || eligibility?.enabled != true) return;
  if (!spin.canShowTrigger) {
    showAppToast(
      context,
      spin.error ??
          eligibility?.reason ??
          (spin.claim != null
              ? 'Use your current spin reward before spinning again'
              : 'Spin & Win is not available right now'),
    );
    return;
  }

  await showGeneralDialog<void>(
    context: context,
    barrierDismissible: true,
    barrierLabel: 'Close spin',
    barrierColor: Colors.black.withValues(alpha: 0.8),
    transitionDuration: const Duration(milliseconds: 280),
    pageBuilder: (_, _, _) => SpinWheelModal(startAtIntro: startAtIntro),
    transitionBuilder: (ctx, anim, _, child) {
      final curved = CurvedAnimation(parent: anim, curve: Curves.easeOutCubic);
      return FadeTransition(
        opacity: curved,
        child: ScaleTransition(
          scale: Tween(begin: 0.92, end: 1.0).animate(curved),
          child: child,
        ),
      );
    },
  );
}

class SpinWheelModal extends ConsumerStatefulWidget {
  const SpinWheelModal({super.key, this.startAtIntro = false});

  final bool startAtIntro;

  @override
  ConsumerState<SpinWheelModal> createState() => _SpinWheelModalState();
}

class _SpinWheelModalState extends ConsumerState<SpinWheelModal>
    with SingleTickerProviderStateMixin {
  late bool _intro;
  late final AnimationController _spinCtrl;
  Animation<double> _rotationAnim = const AlwaysStoppedAnimation(0);
  SpinPlayResult? _pendingPlay;

  @override
  void initState() {
    super.initState();
    _intro = widget.startAtIntro;
    _spinCtrl = AnimationController(vsync: this);
    _spinCtrl.addStatusListener((status) async {
      if (status != AnimationStatus.completed) return;
      final play = _pendingPlay;
      _pendingPlay = null;
      if (play != null) {
        await ref.read(spinProvider.notifier).completeSpin(play);
        if (!mounted) return;
        final won =
            play.isPrize &&
            !play.offer.isNoPrize &&
            (play.claimCode ?? '').isNotEmpty;
        showAppToast(
          context,
          won ? 'You won ${play.offer.formatted}!' : 'Better luck next time!',
          isError: !won,
        );
      }
    });
  }

  @override
  void dispose() {
    _spinCtrl.dispose();
    super.dispose();
  }

  Future<void> _close({bool hideToday = false}) async {
    if (hideToday) {
      await ref.read(spinProvider.notifier).dismissForToday();
    } else {
      final elig = ref.read(spinProvider).eligibility;
      await SpinStorage.markPopupShown(
        elig?.nextSpinAt?.millisecondsSinceEpoch,
      );
    }
    ref.read(spinProvider.notifier).resetSession();
    if (mounted) Navigator.of(context).pop();
  }

  Future<void> _handleSpin() async {
    final spin = ref.read(spinProvider);
    if (spin.spinning || spin.result != null) return;
    if (spin.offers.length < 2) return;

    final from = spin.rotation;
    try {
      final play = await ref.read(spinProvider.notifier).play();
      if (!mounted) return;
      if (play == null) {
        final latest = ref.read(spinProvider);
        showAppToast(
          context,
          latest.error ??
              latest.eligibility?.reason ??
              'Spin & Win is not available right now',
        );
        await _close();
        return;
      }

      if (play.alreadyClaimed) {
        showAppToast(
          context,
          'You already have an active spin reward!',
          isError: false,
        );
        return;
      }

      final to = ref.read(spinProvider).rotation;
      final ms = ref.read(spinProvider).spinAnimMs;
      _pendingPlay = play;
      _spinCtrl.duration = Duration(milliseconds: ms);
      _rotationAnim = Tween<double>(
        begin: from,
        end: to,
      ).animate(CurvedAnimation(parent: _spinCtrl, curve: _spinEase));
      await _spinCtrl.forward(from: 0);
    } catch (e) {
      if (!mounted) return;
      showAppToast(
        context,
        e is ApiException ? e.message : 'Could not spin right now',
      );
      if (e is ApiException && e.status == 429) {
        await ref.read(spinProvider.notifier).refresh();
        if (mounted) await _close();
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final spin = ref.watch(spinProvider);
    final inResult = spin.result != null;
    final eligibility = spin.eligibility;
    final onCooldown =
        eligibility?.enabled == true && eligibility?.canSpin == false;
    final cooldownMsg = onCooldown
        ? SpinStorage.formatCooldownMessage(
            spin.eligibility?.nextSpinAt,
            spin.eligibility?.reason,
          )
        : null;
    final displayError =
        spin.error ?? (onCooldown && !inResult ? cooldownMsg : null);
    final spinBlocked = !spin.canSpin;

    return Material(
      color: Colors.transparent,
      child: SafeArea(
        minimum: const EdgeInsets.all(12),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420, maxHeight: 760),
            child: _intro
                ? _IntroSplash(
                    onContinue: () => setState(() => _intro = false),
                    onHide: () => _close(hideToday: true),
                    l10n: l10n,
                  )
                : _WheelCard(
                    l10n: l10n,
                    spin: spin,
                    inResult: inResult,
                    displayError: displayError,
                    spinBlocked: spinBlocked,
                    cooldownMsg: cooldownMsg,
                    rotationAnim: _rotationAnim,
                    spinning: spin.spinning,
                    spinCtrl: _spinCtrl,
                    onClose: () => _close(),
                    onHide: () => _close(hideToday: true),
                    onSpin: _handleSpin,
                    onClaim: () async {
                      final claim = spin.claim ?? spin.result?.toClaim();
                      if (claim != null) {
                        await ref
                            .read(cartProvider.notifier)
                            .applyPromoCode(claim.claimCode);
                      }
                      if (!context.mounted) return;
                      Navigator.pop(context);
                      final hasItems = ref.read(cartProvider).items.isNotEmpty;
                      context.go(hasItems ? '/checkout' : '/cart');
                    },
                    onContinue: () {
                      Navigator.pop(context);
                      context.go('/menu');
                    },
                  ),
          ),
        ),
      ),
    );
  }
}

class _IntroSplash extends StatelessWidget {
  const _IntroSplash({
    required this.onContinue,
    required this.onHide,
    required this.l10n,
  });

  final VoidCallback onContinue;
  final VoidCallback onHide;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: BcColors.navyCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: BcColors.navyBorder),
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 12, 24, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Align(
              alignment: Alignment.centerRight,
              child: IconButton(
                onPressed: onHide,
                tooltip: l10n.spinHide,
                constraints: const BoxConstraints.tightFor(
                  width: 48,
                  height: 48,
                ),
                icon: const Icon(Icons.visibility_off_outlined, size: 20),
                color: Colors.white,
                style: IconButton.styleFrom(
                  backgroundColor: Colors.white.withValues(alpha: 0.12),
                ),
              ),
            ),
            Container(
              width: 104,
              height: 104,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.black.withValues(alpha: 0.2),
                border: Border.all(
                  color: BcColors.accent.withValues(alpha: 0.4),
                  width: 4,
                ),
              ),
              alignment: Alignment.center,
              child: const SpinCasinoIcon(size: 52),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              decoration: BoxDecoration(
                color: BcColors.accent.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(999),
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.auto_awesome, size: 12, color: BcColors.accent),
                  SizedBox(width: 6),
                  Text(
                    'Lucky Spin',
                    style: TextStyle(
                      color: BcColors.accent,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 10),
            Text(
              '${l10n.spinTitle}!',
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              l10n.spinSubtitle,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white70, fontSize: 14),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton(
                onPressed: onContinue,
                style: FilledButton.styleFrom(
                  backgroundColor: BcColors.brand,
                  minimumSize: const Size.fromHeight(48),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text(
                  'Tap to spin',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
              ),
            ),
            SizedBox(
              height: 48,
              child: TextButton(
                onPressed: onHide,
                child: Text(
                  l10n.spinHide,
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _WheelCard extends StatelessWidget {
  const _WheelCard({
    required this.l10n,
    required this.spin,
    required this.inResult,
    required this.displayError,
    required this.spinBlocked,
    required this.cooldownMsg,
    required this.rotationAnim,
    required this.spinning,
    required this.spinCtrl,
    required this.onClose,
    required this.onHide,
    required this.onSpin,
    required this.onClaim,
    required this.onContinue,
  });

  final AppLocalizations l10n;
  final SpinUiState spin;
  final bool inResult;
  final String? displayError;
  final bool spinBlocked;
  final String? cooldownMsg;
  final Animation<double> rotationAnim;
  final bool spinning;
  final AnimationController spinCtrl;
  final VoidCallback onClose;
  final VoidCallback onHide;
  final VoidCallback onSpin;
  final VoidCallback onClaim;
  final VoidCallback onContinue;

  @override
  Widget build(BuildContext context) {
    final elig = spin.eligibility;
    final result = spin.result;
    final errorMessage = displayError;
    final won =
        result != null &&
        result.isPrize &&
        !result.offer.isNoPrize &&
        (result.claimCode ?? '').isNotEmpty;
    final availableWheelWidth = math.max(
      180.0,
      MediaQuery.sizeOf(context).width - 64,
    );
    final wheelSize = math.min(inResult ? 200.0 : 280.0, availableWheelWidth);

    return Container(
      decoration: BoxDecoration(
        color: BcColors.navyCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: BcColors.navyBorder),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.45),
            blurRadius: 28,
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            height: 110,
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [
                    BcColors.brand.withValues(alpha: 0.3),
                    BcColors.brand.withValues(alpha: 0.0),
                  ],
                ),
              ),
            ),
          ),
          SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(18, 12, 18, 16),
            child: Column(
              children: [
                Row(
                  children: [
                    if (!inResult)
                      IconButton(
                        onPressed: onHide,
                        tooltip: l10n.spinHide,
                        constraints: const BoxConstraints.tightFor(
                          width: 48,
                          height: 48,
                        ),
                        icon: const Icon(
                          Icons.visibility_off_outlined,
                          size: 19,
                        ),
                        color: Colors.white,
                        style: IconButton.styleFrom(
                          backgroundColor: Colors.white.withValues(alpha: 0.12),
                        ),
                      )
                    else
                      const SizedBox(width: 48, height: 48),
                    Expanded(
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 38,
                            height: 38,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: BcColors.brand.withValues(alpha: 0.4),
                                width: 2,
                              ),
                            ),
                            clipBehavior: Clip.antiAlias,
                            child: Image.asset(
                              'assets/brand/logo.png',
                              fit: BoxFit.cover,
                              errorBuilder: (_, _, _) => const Icon(
                                Icons.local_cafe,
                                color: BcColors.brand,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          const Flexible(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'Bing Chun',
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: Colors.white,
                                    fontWeight: FontWeight.w800,
                                    fontSize: 14,
                                  ),
                                ),
                                Text(
                                  'SRI LANKA',
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                    color: Colors.white70,
                                    fontSize: 9,
                                    letterSpacing: 1.5,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: onClose,
                      tooltip: l10n.spinClose,
                      constraints: const BoxConstraints.tightFor(
                        width: 48,
                        height: 48,
                      ),
                      icon: const Icon(Icons.close, size: 21),
                      color: Colors.white,
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.white.withValues(alpha: 0.12),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    color: BcColors.brand.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.auto_awesome,
                        size: 12,
                        color: BcColors.brand,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        l10n.spinTitle,
                        style: const TextStyle(
                          color: BcColors.brandLight,
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  inResult ? 'Congratulations!' : l10n.spinTryYourLuck,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  inResult
                      ? (won
                            ? 'Your reward is ready. Add it to your cup or keep shopping.'
                            : 'Thanks for playing — better luck next time.')
                      : (spinBlocked
                            ? l10n.spinSubtitleCooldown
                            : l10n.spinSubtitle),
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: BcColors.textMuted,
                    fontSize: 13,
                  ),
                ),
                if (errorMessage != null) ...[
                  const SizedBox(height: 12),
                  _ErrorCallout(
                    title: l10n.spinUnavailable,
                    message: errorMessage,
                  ),
                ],
                if (!inResult) ...[
                  const SizedBox(height: 12),
                  _PrizeChips(l10n: l10n),
                  if (elig != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text(
                        'Spins used ${elig.spinsUsed} / ${elig.spinsAllowed}'
                        '${elig.spinsRemaining > 0 ? ' · ${elig.spinsRemaining} left' : ''}',
                        style: const TextStyle(
                          color: BcColors.textMuted,
                          fontSize: 11,
                        ),
                      ),
                    ),
                ],
                const SizedBox(height: 16),
                if (spin.loading && spin.offers.length < 2)
                  SizedBox(
                    height: wheelSize,
                    child: const Center(
                      child: CircularProgressIndicator(color: BcColors.brand),
                    ),
                  )
                else if (spin.offers.length < 2)
                  SizedBox(
                    height: wheelSize,
                    child: Center(
                      child: Text(
                        l10n.spinNotConfigured,
                        style: const TextStyle(color: BcColors.textMuted),
                      ),
                    ),
                  )
                else
                  AnimatedBuilder(
                    animation: spinCtrl,
                    builder: (context, _) {
                      final rotation = spinning
                          ? rotationAnim.value
                          : spin.rotation;
                      return SpinWheel(
                        offers: spin.offers,
                        rotation: rotation,
                        size: wheelSize,
                      );
                    },
                  ),
                if (inResult && result != null) ...[
                  const SizedBox(height: 16),
                  _ResultCard(result: result, won: won, l10n: l10n),
                  const SizedBox(height: 12),
                  if (won)
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: onClaim,
                        style: FilledButton.styleFrom(
                          backgroundColor: BcColors.brand,
                          minimumSize: const Size.fromHeight(48),
                        ),
                        child: Text(l10n.spinUseAtCheckout),
                      ),
                    )
                  else
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                        onPressed: onContinue,
                        style: FilledButton.styleFrom(
                          backgroundColor: BcColors.brand,
                          minimumSize: const Size.fromHeight(48),
                        ),
                        child: Text(l10n.spinContinueShopping),
                      ),
                    ),
                  SizedBox(
                    height: 48,
                    child: TextButton(
                      onPressed: onClose,
                      style: TextButton.styleFrom(
                        foregroundColor: BcColors.brandLight,
                      ),
                      child: Text(l10n.spinClose),
                    ),
                  ),
                ],
                if (!inResult) ...[
                  const SizedBox(height: 18),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed:
                          spinning ||
                              spinBlocked ||
                              spin.offers.length < 2 ||
                              spin.loading
                          ? null
                          : onSpin,
                      style: FilledButton.styleFrom(
                        backgroundColor: BcColors.brand,
                        disabledBackgroundColor: BcColors.brand.withValues(
                          alpha: 0.4,
                        ),
                        minimumSize: const Size.fromHeight(48),
                      ),
                      child: spinning
                          ? Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white,
                                  ),
                                ),
                                const SizedBox(width: 8),
                                Text(l10n.spinning),
                              ],
                            )
                          : Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                const SpinCasinoIcon(size: 20),
                                const SizedBox(width: 8),
                                Text(l10n.spinNow),
                              ],
                            ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    elig != null
                        ? '${elig.spinsAllowed} spin${elig.spinsAllowed == 1 ? '' : 's'} per ${elig.spinWindowHours == 24 ? 'day' : '${elig.spinWindowHours}h'}. Rewards expire in 7 days.'
                        : l10n.spinFooter,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      color: BcColors.textMuted,
                      fontSize: 11,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorCallout extends StatelessWidget {
  const _ErrorCallout({required this.title, required this.message});

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFF59E0B).withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: const Color(0xFFF59E0B).withValues(alpha: 0.4),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.schedule, size: 16, color: Color(0xFFFBBF24)),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    color: Color(0xFFFCD34D),
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  message,
                  style: const TextStyle(color: Colors.white, fontSize: 13),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PrizeChips extends StatelessWidget {
  const _PrizeChips({required this.l10n});

  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final chips = [
      (Icons.percent, l10n.spinChipPercent),
      (Icons.local_shipping_outlined, l10n.spinChipDelivery),
      (Icons.card_giftcard_outlined, l10n.spinChipGifts),
      (Icons.payments_outlined, l10n.spinChipCash),
    ];
    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 6,
      runSpacing: 6,
      children: [
        for (final c in chips)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: BcColors.navyLight.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(999),
              border: Border.all(color: BcColors.navyBorder),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(c.$1, size: 12, color: BcColors.brand),
                const SizedBox(width: 4),
                Text(
                  c.$2,
                  style: const TextStyle(
                    color: BcColors.textMuted,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}

class _ResultCard extends StatelessWidget {
  const _ResultCard({
    required this.result,
    required this.won,
    required this.l10n,
  });

  final SpinPlayResult result;
  final bool won;
  final AppLocalizations l10n;

  @override
  Widget build(BuildContext context) {
    final offer = result.offer;
    final giftUrl = ApiConfig.resolveAssetUrl(offer.giftProduct?.imageUrl);
    final formatted = offer.formatted.trim();
    final rewardTitle = formatted.isEmpty ? 'Spin reward' : formatted;
    final description = offer.description?.trim();
    final claimCode = result.claimCode?.trim();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: BcColors.brand.withValues(alpha: 0.35)),
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            BcColors.brand.withValues(alpha: 0.25),
            BcColors.brand.withValues(alpha: 0.05),
          ],
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (offer.isGift)
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                color: Colors.white,
                border: Border.all(color: Colors.white, width: 2),
              ),
              child: giftUrl == null
                  ? const Icon(Icons.card_giftcard, color: BcColors.brand)
                  : ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.network(
                        giftUrl,
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) => const Icon(
                          Icons.card_giftcard,
                          color: BcColors.brand,
                        ),
                      ),
                    ),
            )
          else
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(14),
                color: BcColors.brand.withValues(alpha: 0.15),
                border: Border.all(
                  color: BcColors.brand.withValues(alpha: 0.3),
                ),
              ),
              child: Icon(
                spinOfferIcon(offer.offerType),
                color: BcColors.brand,
              ),
            ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  l10n.spinYouWon.toUpperCase(),
                  style: const TextStyle(
                    color: BcColors.brandLight,
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.4,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  won ? rewardTitle : l10n.spinBetterLuck,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (description != null && description.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    description,
                    style: TextStyle(
                      color: Colors.white.withValues(alpha: 0.8),
                      fontSize: 13,
                    ),
                  ),
                ],
                if (won && claimCode != null && claimCode.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 4,
                    ),
                    decoration: BoxDecoration(
                      color: BcColors.navyLight.withValues(alpha: 0.7),
                      borderRadius: BorderRadius.circular(999),
                      border: Border.all(
                        color: BcColors.brand.withValues(alpha: 0.3),
                      ),
                    ),
                    child: Text(
                      claimCode,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: BcColors.brandLight,
                        fontFamily: 'monospace',
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
