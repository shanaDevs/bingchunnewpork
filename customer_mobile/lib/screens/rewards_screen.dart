import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../providers/loyalty_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/floating_fab_layout.dart';
import '../utils/loyalty_utils.dart';
import '../utils/shell_layout.dart';

const _border = Color(0xFFE5E9F0);

enum _ActivityFilter { all, earned, redeemed }

class _TierPalette {
  final LoyaltyTierStyle tone;
  final List<Color> gradient;
  final Color foreground;
  final Color mutedForeground;
  final Color accent;
  final Color detail;
  final Color accentSoft;
  final Color cardTint;
  final Color buttonForeground;
  final Color shadow;
  final IconData emblem;

  const _TierPalette({
    required this.tone,
    required this.gradient,
    required this.foreground,
    required this.mutedForeground,
    required this.accent,
    required this.detail,
    required this.accentSoft,
    required this.cardTint,
    required this.buttonForeground,
    required this.shadow,
    required this.emblem,
  });

  static const bronze = _TierPalette(
    tone: LoyaltyTierStyle.bronze,
    gradient: [Color(0xFFFFF0E4), Color(0xFFEFB78F)],
    foreground: Color(0xFF442315),
    mutedForeground: Color(0xFF7A4C37),
    accent: Color(0xFFB95727),
    detail: Color(0xFF93401D),
    accentSoft: Color(0xFFE9A378),
    cardTint: Color(0xFFFFF8F3),
    buttonForeground: Colors.white,
    shadow: Color(0xFFB95727),
    emblem: Icons.star_rounded,
  );

  static const silver = _TierPalette(
    tone: LoyaltyTierStyle.silver,
    gradient: [Color(0xFFF0F3F6), Color(0xFFBCC6D1)],
    foreground: Color(0xFF26303D),
    mutedForeground: Color(0xFF536070),
    accent: Color(0xFF647184),
    detail: Color(0xFF526071),
    accentSoft: Color(0xFFB2BDC9),
    cardTint: Color(0xFFF3F6F9),
    buttonForeground: Colors.white,
    shadow: Color(0xFF647184),
    emblem: Icons.star_rounded,
  );

  static const gold = _TierPalette(
    tone: LoyaltyTierStyle.gold,
    gradient: [Color(0xFF211B0C), Color(0xFF050504)],
    foreground: Color(0xFFFFFBEE),
    mutedForeground: Color(0xFFD7CBA8),
    accent: Color(0xFFF5B91D),
    detail: Color(0xFF8A6200),
    accentSoft: Color(0xFFFFDE72),
    cardTint: Color(0xFFFFFBED),
    buttonForeground: Color(0xFF211A06),
    shadow: Color(0xFF8C6500),
    emblem: Icons.workspace_premium_rounded,
  );

  static const member = _TierPalette(
    tone: LoyaltyTierStyle.neutral,
    gradient: [Color(0xFFEAF3FF), Color(0xFFC9E0FF)],
    foreground: Color(0xFF10264A),
    mutedForeground: Color(0xFF476282),
    accent: BcColors.brand,
    detail: Color(0xFF245EA9),
    accentSoft: Color(0xFF8DBBFA),
    cardTint: Color(0xFFF6FAFF),
    buttonForeground: Colors.white,
    shadow: BcColors.brand,
    emblem: Icons.auto_awesome_rounded,
  );

  static _TierPalette fromTier(
    LoyaltyTier? tier,
    List<LoyaltyTier> orderedTiers,
  ) {
    return switch (loyaltyTierStyleFor(tier, orderedTiers)) {
      LoyaltyTierStyle.bronze => bronze,
      LoyaltyTierStyle.silver => silver,
      LoyaltyTierStyle.gold => gold,
      LoyaltyTierStyle.neutral => member,
    };
  }
}

class RewardsScreen extends ConsumerStatefulWidget {
  const RewardsScreen({super.key});

  @override
  ConsumerState<RewardsScreen> createState() => _RewardsScreenState();
}

class _RewardsScreenState extends ConsumerState<RewardsScreen> {
  static final number = NumberFormat('#,##0');
  static final activityDate = DateFormat('d MMM yyyy · h:mm a');

  final _benefitsKey = GlobalKey();
  final _historyKey = GlobalKey();
  _ActivityFilter _activityFilter = _ActivityFilter.all;
  bool _showAllActivity = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      final loyalty = ref.read(loyaltyProvider);
      if (loyalty.summary == null && !loyalty.isLoading) {
        ref.read(loyaltyProvider.notifier).fetchSummary();
      }
    });
  }

  Future<void> _refresh() {
    return ref.read(loyaltyProvider.notifier).fetchSummary();
  }

  void _scrollTo(GlobalKey key) {
    final target = key.currentContext;
    if (target == null) return;
    Scrollable.ensureVisible(
      target,
      duration: const Duration(milliseconds: 450),
      curve: Curves.easeOutCubic,
      alignment: 0.06,
    );
  }

  @override
  Widget build(BuildContext context) {
    final loyalty = ref.watch(loyaltyProvider);
    final bottomPadding =
        shellContentBottomInset(context) + FloatingFabLayout.cupSize + 20;

    return Scaffold(
      backgroundColor: context.bc.pageBg,
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          color: BcColors.brand,
          onRefresh: _refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: _RewardsAppBar(
                  isRefreshing: loyalty.isLoading,
                  historyEnabled: loyalty.summary != null,
                  onHistory: () => _scrollTo(_historyKey),
                  onRefresh: _refresh,
                ),
              ),
              if (loyalty.summary == null && loyalty.isLoading)
                const SliverToBoxAdapter(child: _RewardsLoading())
              else if (loyalty.summary == null)
                SliverFillRemaining(
                  hasScrollBody: false,
                  child: _RewardsError(
                    message: loyalty.errorMessage,
                    onRetry: _refresh,
                  ),
                )
              else
                SliverPadding(
                  padding: EdgeInsets.fromLTRB(16, 4, 16, bottomPadding),
                  sliver: SliverList(
                    delegate: SliverChildListDelegate(
                      _content(context, loyalty.summary!, loyalty.errorMessage),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  List<Widget> _content(
    BuildContext context,
    LoyaltySummary summary,
    String? errorMessage,
  ) {
    final progress = loyaltyTierProgress(summary.totalSpendLkr, summary.tiers);
    // Before the first threshold there is no earned current tier, but the
    // first live tier still defines the page's aspirational visual treatment.
    final visualTier = progress.currentTier ?? progress.nextTier;
    final palette = _TierPalette.fromTier(visualTier, summary.tiers);
    final readyRewards = summary.redeemRewards
        .where((reward) => summary.points >= reward.cost)
        .toList(growable: false);

    return [
      if (errorMessage != null) ...[
        _InlineRefreshError(onRetry: _refresh),
        const SizedBox(height: 12),
      ],
      _TierHero(
        summary: summary,
        progress: progress,
        palette: palette,
        onViewBenefits: () => _scrollTo(_benefitsKey),
        onOrder: () => context.go('/menu'),
      ),
      const SizedBox(height: 26),
      _SectionHeader(
        title: 'Rewards for You',
        subtitle: 'Live rewards and member offers',
        accent: palette.detail,
      ),
      const SizedBox(height: 12),
      _RewardsRail(
        summary: summary,
        palette: palette,
        onUseReward: () => context.go('/cart'),
        onViewOffer: () => context.go('/menu'),
      ),
      const SizedBox(height: 26),
      KeyedSubtree(
        key: _benefitsKey,
        child: _MembershipJourney(
          summary: summary,
          progress: progress,
          palette: palette,
        ),
      ),
      const SizedBox(height: 16),
      _NextMilestone(summary: summary, progress: progress, palette: palette),
      const SizedBox(height: 16),
      _EarnMorePoints(
        summary: summary,
        palette: palette,
        onOrder: () => context.go('/menu'),
        onRefer: () => context.push('/profile/referral'),
      ),
      if (summary.settings.customerRedeemEnabled &&
          readyRewards.isNotEmpty) ...[
        const SizedBox(height: 16),
        _RewardsWallet(
          rewards: readyRewards,
          palette: palette,
          onUse: () => context.go('/cart'),
        ),
      ],
      const SizedBox(height: 26),
      KeyedSubtree(
        key: _historyKey,
        child: _ActivitySection(
          summary: summary,
          filter: _activityFilter,
          showAll: _showAllActivity,
          palette: palette,
          onFilterChanged: (filter) {
            setState(() {
              _activityFilter = filter;
              _showAllActivity = false;
            });
          },
          onToggleShowAll: () {
            setState(() => _showAllActivity = !_showAllActivity);
          },
        ),
      ),
      const SizedBox(height: 18),
      _BottomCta(palette: palette, onOrder: () => context.go('/menu')),
    ];
  }
}

class _RewardsAppBar extends StatelessWidget {
  final bool isRefreshing;
  final bool historyEnabled;
  final VoidCallback onHistory;
  final Future<void> Function() onRefresh;

  const _RewardsAppBar({
    required this.isRefreshing,
    required this.historyEnabled,
    required this.onHistory,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 8, 14),
      child: SizedBox(
        height: 52,
        child: Row(
          children: [
            Semantics(
              button: true,
              label: 'Refresh rewards',
              child: IconButton(
                tooltip: 'Refresh rewards',
                onPressed: isRefreshing ? null : onRefresh,
                constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                icon: isRefreshing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.refresh_rounded),
              ),
            ),
            const Expanded(
              child: Text(
                'Rewards',
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 21,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                ),
              ),
            ),
            SizedBox(
              width: 88,
              height: 48,
              child: TextButton(
                onPressed: historyEnabled ? onHistory : null,
                style: TextButton.styleFrom(
                  foregroundColor: Theme.of(context).colorScheme.onSurface,
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                ),
                child: const Text(
                  'History',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TierHero extends StatelessWidget {
  final LoyaltySummary summary;
  final LoyaltyTierProgress progress;
  final _TierPalette palette;
  final VoidCallback onViewBenefits;
  final VoidCallback onOrder;

  const _TierHero({
    required this.summary,
    required this.progress,
    required this.palette,
    required this.onViewBenefits,
    required this.onOrder,
  });

  @override
  Widget build(BuildContext context) {
    final tier = progress.currentTier;
    final tierName = tier?.name.trim().isNotEmpty == true
        ? tier!.name.trim()
        : 'Rewards';
    final nextTier = progress.nextTier;
    final progressLabel = nextTier == null
        ? (tier == null ? 'Tier details unavailable' : 'Top tier reached')
        : 'LKR ${_RewardsScreenState.number.format(progress.remainingSpendLkr)} to ${nextTier.name}';
    final thresholdLabel = nextTier == null
        ? 'LKR ${_RewardsScreenState.number.format(summary.totalSpendLkr)} lifetime spend'
        : 'LKR ${_RewardsScreenState.number.format(summary.totalSpendLkr)} of ${_RewardsScreenState.number.format(nextTier.minSpendLkr)} lifetime spend';

    return Semantics(
      container: true,
      label:
          '$tierName member. ${summary.points} points. $progressLabel. $thresholdLabel.',
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: palette.gradient,
          ),
          borderRadius: BorderRadius.circular(26),
          border: Border.all(color: palette.accent.withValues(alpha: 0.2)),
          boxShadow: [
            BoxShadow(
              color: palette.shadow.withValues(alpha: 0.16),
              blurRadius: 24,
              offset: const Offset(0, 12),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Stack(
          children: [
            Positioned(
              right: -28,
              top: -38,
              child: _HeroEmblem(palette: palette),
            ),
            Positioned(
              left: -54,
              bottom: -72,
              child: Container(
                width: 160,
                height: 160,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: palette.accent.withValues(alpha: 0.08),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 215),
                    child: Text(
                      '${tierName.toUpperCase()} MEMBER',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: palette.accent,
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.7,
                      ),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Flexible(
                        child: FittedBox(
                          fit: BoxFit.scaleDown,
                          alignment: Alignment.centerLeft,
                          child: Text(
                            _RewardsScreenState.number.format(summary.points),
                            style: TextStyle(
                              color: palette.foreground,
                              fontSize: 38,
                              height: 1,
                              fontWeight: FontWeight.w800,
                              letterSpacing: -1.4,
                            ),
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.only(left: 7, bottom: 3),
                        child: Text(
                          'pts',
                          style: TextStyle(
                            color: palette.foreground,
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      const SizedBox(width: 105),
                    ],
                  ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          progressLabel,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: palette.foreground,
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      if (summary.tiers.isNotEmpty) ...[
                        const SizedBox(width: 10),
                        Text(
                          '${(progress.fraction * 100).round()}%',
                          style: TextStyle(
                            color: palette.accent,
                            fontSize: 12,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (summary.tiers.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: LinearProgressIndicator(
                        value: progress.fraction,
                        minHeight: 8,
                        backgroundColor: palette.foreground.withValues(
                          alpha: 0.12,
                        ),
                        valueColor: AlwaysStoppedAnimation(palette.accent),
                      ),
                    ),
                  ],
                  const SizedBox(height: 7),
                  Text(
                    thresholdLabel,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      color: palette.mutedForeground,
                      fontSize: 11,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: 20),
                  LayoutBuilder(
                    builder: (context, constraints) {
                      final benefits = _HeroButton(
                        label: 'View Benefits',
                        icon: Icons.workspace_premium_outlined,
                        palette: palette,
                        filled: true,
                        onPressed: onViewBenefits,
                      );
                      final order = _HeroButton(
                        label: 'Order & Earn',
                        icon: Icons.local_cafe_outlined,
                        palette: palette,
                        filled: false,
                        onPressed: onOrder,
                      );
                      if (constraints.maxWidth < 290) {
                        return Column(
                          children: [
                            benefits,
                            const SizedBox(height: 10),
                            order,
                          ],
                        );
                      }
                      return Row(
                        children: [
                          Expanded(child: benefits),
                          const SizedBox(width: 10),
                          Expanded(child: order),
                        ],
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _HeroEmblem extends StatelessWidget {
  final _TierPalette palette;

  const _HeroEmblem({required this.palette});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 136,
      height: 136,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: palette.accent.withValues(alpha: 0.14),
      ),
      child: Container(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [palette.accentSoft, palette.accent],
          ),
          border: Border.all(
            color: palette.foreground.withValues(alpha: 0.12),
            width: 5,
          ),
        ),
        child: Icon(
          palette.emblem,
          color: palette.tone == LoyaltyTierStyle.gold
              ? const Color(0xFFFFF1B2)
              : Colors.white,
          size: 48,
        ),
      ),
    );
  }
}

class _HeroButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final _TierPalette palette;
  final bool filled;
  final VoidCallback onPressed;

  const _HeroButton({
    required this.label,
    required this.icon,
    required this.palette,
    required this.filled,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 50,
      child: FilledButton.icon(
        onPressed: onPressed,
        icon: Icon(icon, size: 18),
        label: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
        style: FilledButton.styleFrom(
          backgroundColor: filled
              ? palette.accent
              : palette.foreground.withValues(alpha: 0.06),
          foregroundColor: filled
              ? palette.buttonForeground
              : palette.foreground,
          side: BorderSide(
            color: filled
                ? palette.accent
                : palette.foreground.withValues(alpha: 0.28),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 10),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Color accent;

  const _SectionHeader({
    required this.title,
    required this.accent,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: 4,
          height: subtitle == null ? 24 : 40,
          decoration: BoxDecoration(
            color: accent,
            borderRadius: BorderRadius.circular(5),
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.25,
                ),
              ),
              if (subtitle != null)
                Text(
                  subtitle!,
                  style: TextStyle(
                    color: context.bc.mutedText,
                    fontSize: 11,
                    height: 1.35,
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }
}

class _RewardsRail extends StatelessWidget {
  final LoyaltySummary summary;
  final _TierPalette palette;
  final VoidCallback onUseReward;
  final VoidCallback onViewOffer;

  const _RewardsRail({
    required this.summary,
    required this.palette,
    required this.onUseReward,
    required this.onViewOffer,
  });

  @override
  Widget build(BuildContext context) {
    final hasRewards = summary.redeemRewards.isNotEmpty;
    final hasOffers = summary.upcomingOffers.isNotEmpty;

    if (!hasRewards && !hasOffers) {
      return const _EmptyCard(
        icon: Icons.card_giftcard_outlined,
        title: 'No rewards published yet',
        message: 'New rewards and member offers will appear here.',
      );
    }

    return SizedBox(
      height: 244,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        itemCount: summary.redeemRewards.length + summary.upcomingOffers.length,
        separatorBuilder: (_, _) => const SizedBox(width: 12),
        itemBuilder: (context, index) {
          if (index < summary.redeemRewards.length) {
            final reward = summary.redeemRewards[index];
            return _RewardCard(
              reward: reward,
              points: summary.points,
              redeemEnabled: summary.settings.customerRedeemEnabled,
              palette: palette,
              onUse: onUseReward,
            );
          }
          final offer =
              summary.upcomingOffers[index - summary.redeemRewards.length];
          return _OfferCard(
            offer: offer,
            palette: palette,
            onView: onViewOffer,
          );
        },
      ),
    );
  }
}

class _RewardCard extends StatelessWidget {
  final LoyaltyRedeemReward reward;
  final int points;
  final bool redeemEnabled;
  final _TierPalette palette;
  final VoidCallback onUse;

  const _RewardCard({
    required this.reward,
    required this.points,
    required this.redeemEnabled,
    required this.palette,
    required this.onUse,
  });

  @override
  Widget build(BuildContext context) {
    final ready = points >= reward.cost && redeemEnabled;
    final remaining = (reward.cost - points).clamp(0, reward.cost);
    final status = !redeemEnabled
        ? 'Unavailable'
        : ready
        ? 'Ready to use'
        : '$remaining pts to go';

    return Semantics(
      container: true,
      label: '${reward.title}. ${reward.cost} points. $status.',
      child: Container(
        width: 218,
        padding: const EdgeInsets.all(14),
        decoration: _tierCardDecoration(
          context,
          palette,
          borderColor: palette.accentSoft,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 48,
                  height: 48,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: palette.accent.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: Text(
                    reward.emoji,
                    style: const TextStyle(fontSize: 24),
                  ),
                ),
                const Spacer(),
                if (reward.tag?.trim().isNotEmpty == true)
                  Flexible(
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: palette.accent.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text(
                        reward.tag!.trim(),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: palette.detail,
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 11),
            Text(
              reward.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 3),
            Expanded(
              child: Text(
                reward.description,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: context.bc.mutedText,
                  fontSize: 10,
                  height: 1.35,
                ),
              ),
            ),
            Text(
              '${_RewardsScreenState.number.format(reward.cost)} pts',
              style: TextStyle(
                color: palette.detail,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 7),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: FilledButton(
                onPressed: ready ? onUse : null,
                style: FilledButton.styleFrom(
                  backgroundColor: palette.accent,
                  foregroundColor: palette.buttonForeground,
                  disabledBackgroundColor: context.bc.secondaryBg,
                  disabledForegroundColor: context.bc.mutedText,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(13),
                  ),
                  textStyle: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                child: Text(
                  status,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _OfferCard extends StatelessWidget {
  final LoyaltyUpcomingOffer offer;
  final _TierPalette palette;
  final VoidCallback onView;

  const _OfferCard({
    required this.offer,
    required this.palette,
    required this.onView,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      container: true,
      label: '${offer.title}. ${offer.description}. ${offer.date}.',
      child: Container(
        width: 218,
        padding: const EdgeInsets.all(14),
        decoration: _tierCardDecoration(context, palette),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: palette.accent.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: Text(
                    offer.emoji,
                    style: const TextStyle(fontSize: 24),
                  ),
                ),
                const Spacer(),
                Text(
                  'MEMBER OFFER',
                  style: TextStyle(
                    color: palette.detail,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 11),
            Text(
              offer.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 3),
            Expanded(
              child: Text(
                offer.description,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: context.bc.mutedText,
                  fontSize: 10,
                  height: 1.35,
                ),
              ),
            ),
            if (offer.date.trim().isNotEmpty)
              Text(
                offer.date,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  color: palette.detail,
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                ),
              ),
            const SizedBox(height: 7),
            SizedBox(
              width: double.infinity,
              height: 48,
              child: OutlinedButton(
                onPressed: onView,
                style: OutlinedButton.styleFrom(
                  foregroundColor: palette.detail,
                  side: BorderSide(color: palette.detail),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(13),
                  ),
                  textStyle: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                child: const Text('View menu'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MembershipJourney extends StatelessWidget {
  final LoyaltySummary summary;
  final LoyaltyTierProgress progress;
  final _TierPalette palette;

  const _MembershipJourney({
    required this.summary,
    required this.progress,
    required this.palette,
  });

  @override
  Widget build(BuildContext context) {
    if (summary.tiers.isEmpty) {
      return const _EmptyCard(
        icon: Icons.workspace_premium_outlined,
        title: 'Membership details unavailable',
        message:
            'Your points are safe. Tier details will appear when published.',
      );
    }

    final current = progress.currentTier;
    final next = progress.nextTier;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _tierCardDecoration(context, palette),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionHeader(
            title: 'Your Membership Journey',
            subtitle: 'Thresholds are based on live lifetime spend',
            accent: palette.detail,
          ),
          const SizedBox(height: 20),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                for (var i = 0; i < summary.tiers.length; i++) ...[
                  _JourneyNode(
                    tier: summary.tiers[i],
                    palette: _TierPalette.fromTier(
                      summary.tiers[i],
                      summary.tiers,
                    ),
                    current: loyaltyTiersMatch(current, summary.tiers[i]),
                    unlocked:
                        summary.totalSpendLkr >= summary.tiers[i].minSpendLkr,
                  ),
                  if (i < summary.tiers.length - 1)
                    Container(
                      width: 38,
                      height: 3,
                      margin: const EdgeInsets.only(top: 31),
                      color:
                          summary.totalSpendLkr >=
                              summary.tiers[i + 1].minSpendLkr
                          ? _TierPalette.fromTier(
                              summary.tiers[i + 1],
                              summary.tiers,
                            ).accent
                          : _border,
                    ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 18),
          if (current != null)
            _BenefitLine(
              label: 'Current benefit',
              value: current.perk.trim().isEmpty
                  ? '${current.name} benefits are active'
                  : current.perk,
              color: palette.detail,
              icon: Icons.check_circle_outline_rounded,
            )
          else
            _BenefitLine(
              label: 'Current status',
              value: next == null
                  ? 'Tier information is unavailable'
                  : 'Keep earning toward ${next.name}',
              color: palette.detail,
              icon: Icons.stars_outlined,
            ),
          if (next != null) ...[
            const SizedBox(height: 10),
            _BenefitLine(
              label: 'Next: ${next.name}',
              value: next.perk.trim().isEmpty
                  ? 'Unlocks at LKR ${_RewardsScreenState.number.format(next.minSpendLkr)} lifetime spend'
                  : next.perk,
              color: _TierPalette.fromTier(next, summary.tiers).detail,
              icon: Icons.lock_open_rounded,
            ),
          ],
        ],
      ),
    );
  }
}

class _JourneyNode extends StatelessWidget {
  final LoyaltyTier tier;
  final _TierPalette palette;
  final bool current;
  final bool unlocked;

  const _JourneyNode({
    required this.tier,
    required this.palette,
    required this.current,
    required this.unlocked,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 92,
      child: Column(
        children: [
          Container(
            width: 64,
            height: 64,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: unlocked ? palette.accent : context.bc.secondaryBg,
              border: current
                  ? Border.all(color: palette.accentSoft, width: 5)
                  : Border.all(color: context.bc.border),
              boxShadow: current
                  ? [
                      BoxShadow(
                        color: palette.shadow.withValues(alpha: 0.2),
                        blurRadius: 12,
                      ),
                    ]
                  : null,
            ),
            child: Text(
              tier.emoji,
              style: TextStyle(
                fontSize: 25,
                color: unlocked ? Colors.white : context.bc.mutedText,
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text(
            tier.name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 11,
              fontWeight: current ? FontWeight.w800 : FontWeight.w600,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'LKR ${_RewardsScreenState.number.format(tier.minSpendLkr)}',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(color: context.bc.mutedText, fontSize: 9),
          ),
          if (current) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: palette.accent.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(
                'You',
                style: TextStyle(
                  color: palette.detail,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _BenefitLine extends StatelessWidget {
  final String label;
  final String value;
  final Color color;
  final IconData icon;

  const _BenefitLine({
    required this.label,
    required this.value,
    required this.color,
    required this.icon,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.07),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: color,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(value, style: const TextStyle(fontSize: 11, height: 1.4)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _NextMilestone extends StatelessWidget {
  final LoyaltySummary summary;
  final LoyaltyTierProgress progress;
  final _TierPalette palette;

  const _NextMilestone({
    required this.summary,
    required this.progress,
    required this.palette,
  });

  @override
  Widget build(BuildContext context) {
    final futureRewards = [...summary.redeemRewards]
      ..sort((a, b) => a.cost.compareTo(b.cost));
    LoyaltyRedeemReward? nextReward;
    for (final reward in futureRewards) {
      if (reward.cost > summary.points) {
        nextReward = reward;
        break;
      }
    }

    String title;
    String detail;
    double fraction;
    String value;

    if (summary.settings.customerRedeemEnabled && nextReward != null) {
      final needed = nextReward.cost - summary.points;
      title = nextReward.title;
      detail = '$needed more points to unlock this reward';
      fraction = nextReward.cost <= 0 ? 0 : summary.points / nextReward.cost;
      value =
          '${_RewardsScreenState.number.format(summary.points)} / '
          '${_RewardsScreenState.number.format(nextReward.cost)} pts';
    } else if (progress.nextTier != null) {
      final nextTier = progress.nextTier!;
      title = '${nextTier.name} membership';
      detail =
          'LKR ${_RewardsScreenState.number.format(progress.remainingSpendLkr)} more lifetime spend';
      fraction = progress.fraction;
      value = '${(progress.fraction * 100).round()}% toward ${nextTier.name}';
    } else if (summary.redeemRewards.any(
      (reward) => summary.points >= reward.cost,
    )) {
      title = 'A reward is ready';
      detail = 'Use an eligible reward from your cart at checkout';
      fraction = 1;
      value = '${_RewardsScreenState.number.format(summary.points)} pts';
    } else {
      title = 'Keep earning';
      detail = 'Your next milestone will appear when rewards are published';
      fraction = 0;
      value = '${_RewardsScreenState.number.format(summary.points)} pts';
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _tierCardDecoration(context, palette),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Next Milestone',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 13),
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: palette.accent.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  Icons.flag_outlined,
                  color: palette.detail,
                  size: 22,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      detail,
                      style: TextStyle(
                        color: context.bc.mutedText,
                        fontSize: 10,
                        height: 1.35,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 13),
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: LinearProgressIndicator(
              value: fraction.clamp(0.0, 1.0),
              minHeight: 8,
              backgroundColor: context.bc.secondaryBg,
              valueColor: AlwaysStoppedAnimation(palette.accent),
            ),
          ),
          const SizedBox(height: 7),
          Text(
            value,
            style: TextStyle(
              color: palette.detail,
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class _EarnMorePoints extends StatelessWidget {
  final LoyaltySummary summary;
  final _TierPalette palette;
  final VoidCallback onOrder;
  final VoidCallback onRefer;

  const _EarnMorePoints({
    required this.summary,
    required this.palette,
    required this.onOrder,
    required this.onRefer,
  });

  @override
  Widget build(BuildContext context) {
    final settings = summary.settings;
    final earnCopy = settings.pointsPerLkr <= 0
        ? 'Earning rate is not currently published'
        : settings.pointsPerLkr < 1
        ? '1 pt per LKR ${_RewardsScreenState.number.format((1 / settings.pointsPerLkr).round())}'
        : '${settings.pointsPerLkr.toStringAsFixed(settings.pointsPerLkr == settings.pointsPerLkr.roundToDouble() ? 0 : 2)} pts per LKR 1';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _tierCardDecoration(context, palette),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Earn More Points',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
          ),
          const SizedBox(height: 8),
          _EarnRow(
            icon: Icons.local_cafe_outlined,
            title: 'Place an order',
            detail:
                '$earnCopy on orders from LKR ${_RewardsScreenState.number.format(settings.minOrderToEarn)}',
            value: 'Order',
            color: palette.detail,
            onTap: onOrder,
          ),
          if (summary.referralBonusPoints > 0) ...[
            const Divider(height: 1),
            _EarnRow(
              icon: Icons.group_add_outlined,
              title: 'Refer a friend',
              detail: 'Referral support is available in your Bing Chun profile',
              value:
                  '+${_RewardsScreenState.number.format(summary.referralBonusPoints)} pts',
              color: BcColors.success,
              onTap: onRefer,
            ),
          ],
          if (summary.upcomingOffers.isNotEmpty) ...[
            const Divider(height: 1),
            _EarnRow(
              icon: Icons.auto_awesome_outlined,
              title: 'Member offers',
              detail:
                  '${summary.upcomingOffers.length} published ${summary.upcomingOffers.length == 1 ? 'offer' : 'offers'} available above',
              value: 'View',
              color: palette.detail,
              onTap: null,
            ),
          ],
        ],
      ),
    );
  }
}

class _EarnRow extends StatelessWidget {
  final IconData icon;
  final String title;
  final String detail;
  final String value;
  final Color color;
  final VoidCallback? onTap;

  const _EarnRow({
    required this.icon,
    required this.title,
    required this.detail,
    required this.value,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: onTap != null,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 64),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 9),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Icon(icon, color: color, size: 21),
                const SizedBox(width: 11),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        detail,
                        style: TextStyle(
                          color: context.bc.mutedText,
                          fontSize: 10,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  value,
                  textAlign: TextAlign.end,
                  style: TextStyle(
                    color: color,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                if (onTap != null)
                  Icon(Icons.chevron_right_rounded, color: color, size: 19),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _RewardsWallet extends StatelessWidget {
  final List<LoyaltyRedeemReward> rewards;
  final _TierPalette palette;
  final VoidCallback onUse;

  const _RewardsWallet({
    required this.rewards,
    required this.palette,
    required this.onUse,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: _tierCardDecoration(context, palette),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Expanded(
                child: Text(
                  'Your Rewards Wallet',
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800),
                ),
              ),
              Text(
                '${rewards.length} ${rewards.length == 1 ? 'reward' : 'rewards'} ready',
                style: TextStyle(
                  color: palette.detail,
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          for (var i = 0; i < rewards.length; i++) ...[
            Container(
              padding: const EdgeInsets.fromLTRB(12, 8, 6, 8),
              decoration: BoxDecoration(
                color: palette.accent.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Text(rewards[i].emoji, style: const TextStyle(fontSize: 19)),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      rewards[i].title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  SizedBox(
                    height: 48,
                    child: TextButton(
                      onPressed: onUse,
                      style: TextButton.styleFrom(
                        foregroundColor: palette.detail,
                        padding: const EdgeInsets.symmetric(horizontal: 10),
                      ),
                      child: const Text(
                        'Use at checkout',
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (i < rewards.length - 1) const SizedBox(height: 8),
          ],
        ],
      ),
    );
  }
}

class _ActivitySection extends StatelessWidget {
  final LoyaltySummary summary;
  final _ActivityFilter filter;
  final bool showAll;
  final _TierPalette palette;
  final ValueChanged<_ActivityFilter> onFilterChanged;
  final VoidCallback onToggleShowAll;

  const _ActivitySection({
    required this.summary,
    required this.filter,
    required this.showAll,
    required this.palette,
    required this.onFilterChanged,
    required this.onToggleShowAll,
  });

  @override
  Widget build(BuildContext context) {
    final filtered = summary.transactions
        .where((transaction) {
          return switch (filter) {
            _ActivityFilter.all => true,
            _ActivityFilter.earned =>
              transaction.kind == LoyaltyTransactionKind.earn,
            _ActivityFilter.redeemed =>
              transaction.kind == LoyaltyTransactionKind.redeem,
          };
        })
        .toList(growable: false);
    final shown = showAll ? filtered : filtered.take(5).toList(growable: false);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(
          title: 'Rewards History',
          subtitle: 'Your live points activity',
          accent: palette.detail,
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: _tierCardDecoration(context, palette),
          child: Column(
            children: [
              Row(
                children: [
                  Expanded(
                    child: _FilterButton(
                      label: 'All',
                      selected: filter == _ActivityFilter.all,
                      accent: palette.accent,
                      selectedForeground: palette.buttonForeground,
                      onTap: () => onFilterChanged(_ActivityFilter.all),
                    ),
                  ),
                  const SizedBox(width: 7),
                  Expanded(
                    child: _FilterButton(
                      label: 'Earned',
                      selected: filter == _ActivityFilter.earned,
                      accent: palette.accent,
                      selectedForeground: palette.buttonForeground,
                      onTap: () => onFilterChanged(_ActivityFilter.earned),
                    ),
                  ),
                  const SizedBox(width: 7),
                  Expanded(
                    child: _FilterButton(
                      label: 'Used',
                      selected: filter == _ActivityFilter.redeemed,
                      accent: palette.accent,
                      selectedForeground: palette.buttonForeground,
                      onTap: () => onFilterChanged(_ActivityFilter.redeemed),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (shown.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 22),
                  child: Text(
                    _emptyMessage(filter),
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: context.bc.mutedText,
                      fontSize: 11,
                      height: 1.4,
                    ),
                  ),
                )
              else
                for (var i = 0; i < shown.length; i++) ...[
                  _ActivityRow(transaction: shown[i]),
                  if (i < shown.length - 1)
                    const Divider(height: 1, indent: 49),
                ],
              if (filtered.length > 5) ...[
                const SizedBox(height: 6),
                SizedBox(
                  height: 48,
                  child: TextButton.icon(
                    onPressed: onToggleShowAll,
                    icon: Icon(
                      showAll
                          ? Icons.keyboard_arrow_up_rounded
                          : Icons.keyboard_arrow_down_rounded,
                    ),
                    label: Text(showAll ? 'Show less' : 'View all activity'),
                    style: TextButton.styleFrom(
                      foregroundColor: palette.detail,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }

  String _emptyMessage(_ActivityFilter filter) {
    return switch (filter) {
      _ActivityFilter.all =>
        'No rewards activity yet. Place an order to start earning.',
      _ActivityFilter.earned => 'No earned points in your history yet.',
      _ActivityFilter.redeemed => 'No used points in your history yet.',
    };
  }
}

class _FilterButton extends StatelessWidget {
  final String label;
  final bool selected;
  final Color accent;
  final Color selectedForeground;
  final VoidCallback onTap;

  const _FilterButton({
    required this.label,
    required this.selected,
    required this.accent,
    required this.selectedForeground,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      child: SizedBox(
        height: 48,
        child: FilledButton(
          onPressed: onTap,
          style: FilledButton.styleFrom(
            backgroundColor: selected ? accent : context.bc.secondaryBg,
            foregroundColor: selected
                ? selectedForeground
                : context.bc.mutedText,
            padding: const EdgeInsets.symmetric(horizontal: 4),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            textStyle: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
            ),
          ),
          child: Text(label, maxLines: 1, overflow: TextOverflow.ellipsis),
        ),
      ),
    );
  }
}

class _ActivityRow extends StatelessWidget {
  final LoyaltyTransaction transaction;

  const _ActivityRow({required this.transaction});

  @override
  Widget build(BuildContext context) {
    final earned = transaction.kind == LoyaltyTransactionKind.earn;
    final redeemed = transaction.kind == LoyaltyTransactionKind.redeem;
    final color = earned
        ? const Color(0xFF16813D)
        : redeemed
        ? const Color(0xFFB65B21)
        : BcColors.brand;
    final icon = earned
        ? Icons.add_rounded
        : redeemed
        ? Icons.redeem_outlined
        : Icons.star_outline_rounded;
    final note = transaction.note?.trim();
    final date = transaction.createdAt == null
        ? 'Recently'
        : _RewardsScreenState.activityDate.format(
            transaction.createdAt!.toLocal(),
          );

    return Semantics(
      container: true,
      label:
          '${transaction.displayType}, ${transaction.points >= 0 ? 'plus' : 'minus'} ${transaction.points.abs()} points, $date',
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, color: color, size: 19),
            ),
            const SizedBox(width: 11),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    transaction.displayType,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (note?.isNotEmpty == true)
                    Text(
                      note!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: context.bc.mutedText,
                        fontSize: 10,
                      ),
                    ),
                  Text(
                    date,
                    style: TextStyle(color: context.bc.mutedText, fontSize: 10),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(
              '${transaction.points >= 0 ? '+' : ''}${_RewardsScreenState.number.format(transaction.points)}',
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: FontWeight.w800,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomCta extends StatelessWidget {
  final _TierPalette palette;
  final VoidCallback onOrder;

  const _BottomCta({required this.palette, required this.onOrder});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(colors: palette.gradient),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: palette.accent.withValues(alpha: 0.24)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'More rewards. More delight.',
                  style: TextStyle(
                    color: palette.foreground,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  'Order from the menu and keep earning.',
                  style: TextStyle(
                    color: palette.mutedForeground,
                    fontSize: 10,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          SizedBox(
            height: 48,
            child: FilledButton(
              onPressed: onOrder,
              style: FilledButton.styleFrom(
                backgroundColor: palette.accent,
                foregroundColor: palette.buttonForeground,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(13),
                ),
                textStyle: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                ),
              ),
              child: const Text('Order Now'),
            ),
          ),
        ],
      ),
    );
  }
}

class _EmptyCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;

  const _EmptyCard({
    required this.icon,
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: _cardDecoration(context),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: BcColors.brand.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: BcColors.brand, size: 21),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  message,
                  style: TextStyle(
                    color: context.bc.mutedText,
                    fontSize: 10,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InlineRefreshError extends StatelessWidget {
  final Future<void> Function() onRetry;

  const _InlineRefreshError({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        padding: const EdgeInsets.fromLTRB(13, 6, 7, 6),
        decoration: BoxDecoration(
          color: const Color(0xFFFFF7ED),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFFED7AA)),
        ),
        child: Row(
          children: [
            const Icon(
              Icons.cloud_off_outlined,
              color: Color(0xFFB45309),
              size: 19,
            ),
            const SizedBox(width: 9),
            const Expanded(
              child: Text(
                'Showing saved rewards. Refresh failed.',
                style: TextStyle(
                  color: Color(0xFF7C3F00),
                  fontSize: 10,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            SizedBox(
              height: 48,
              child: TextButton(
                onPressed: onRetry,
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFF9A5200),
                ),
                child: const Text(
                  'Retry',
                  style: TextStyle(fontWeight: FontWeight.w800),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _RewardsError extends StatelessWidget {
  final String? message;
  final Future<void> Function() onRetry;

  const _RewardsError({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final networkError =
        message?.contains('Cannot reach server') == true ||
        message?.contains('SocketException') == true ||
        message?.contains('Timeout') == true;

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(28, 20, 28, 140),
        child: Semantics(
          liveRegion: true,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 68,
                height: 68,
                decoration: BoxDecoration(
                  color: BcColors.brand.withValues(alpha: 0.09),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  networkError
                      ? Icons.wifi_off_rounded
                      : Icons.card_giftcard_outlined,
                  color: BcColors.brand,
                  size: 30,
                ),
              ),
              const SizedBox(height: 18),
              Text(
                networkError
                    ? 'You appear to be offline'
                    : 'Rewards could not load',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w800,
                ),
              ),
              const SizedBox(height: 7),
              Text(
                networkError
                    ? 'Check your connection and try again.'
                    : 'We could not retrieve your loyalty details. Please try again.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: context.bc.mutedText,
                  fontSize: 12,
                  height: 1.45,
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: 180,
                height: 50,
                child: FilledButton.icon(
                  onPressed: onRetry,
                  icon: const Icon(Icons.refresh_rounded, size: 19),
                  label: const Text('Try again'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RewardsLoading extends StatelessWidget {
  const _RewardsLoading();

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      label: 'Loading your rewards',
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 4, 16, 140),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _skeleton(context, height: 300),
            const SizedBox(height: 26),
            _skeleton(context, height: 22, width: 180),
            const SizedBox(height: 12),
            _skeleton(context, height: 244),
            const SizedBox(height: 18),
            _skeleton(context, height: 260),
          ],
        ),
      ),
    );
  }

  static Widget _skeleton(
    BuildContext context, {
    required double height,
    double? width,
  }) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: context.bc.secondaryBg,
        borderRadius: BorderRadius.circular(22),
      ),
    );
  }
}

BoxDecoration _cardDecoration(BuildContext context, {Color? borderColor}) {
  return BoxDecoration(
    color: context.bc.cardBg,
    borderRadius: BorderRadius.circular(20),
    border: Border.all(color: borderColor ?? context.bc.border),
    boxShadow: [
      BoxShadow(
        color: Colors.black.withValues(
          alpha: Theme.of(context).brightness == Brightness.dark ? 0.18 : 0.04,
        ),
        blurRadius: 16,
        offset: const Offset(0, 7),
      ),
    ],
  );
}

BoxDecoration _tierCardDecoration(
  BuildContext context,
  _TierPalette palette, {
  Color? borderColor,
}) {
  final background = Color.alphaBlend(
    palette.cardTint.withValues(
      alpha: Theme.of(context).brightness == Brightness.dark ? 0.07 : 0.78,
    ),
    context.bc.cardBg,
  );
  return _cardDecoration(
    context,
    borderColor: borderColor ?? palette.accentSoft.withValues(alpha: 0.58),
  ).copyWith(color: background);
}
