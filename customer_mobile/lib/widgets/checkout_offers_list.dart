import 'package:flutter/material.dart';
import '../models/active_promo.dart';
import '../theme/bc_theme.dart';
import '../utils/order_receipt_utils.dart';

/// Checkout offers carousel — matches web PromoOffersPanel.
class CheckoutOffersList extends StatefulWidget {
  final List<ActivePromo> offers;
  final bool isLoading;
  final String? appliedCode;
  final int subtotal;
  final ValueChanged<ActivePromo> onApply;
  final VoidCallback? onRemoveApplied;

  const CheckoutOffersList({
    super.key,
    required this.offers,
    required this.isLoading,
    this.appliedCode,
    this.subtotal = 0,
    required this.onApply,
    this.onRemoveApplied,
  });

  @override
  State<CheckoutOffersList> createState() => _CheckoutOffersListState();
}

class _CheckoutOffersListState extends State<CheckoutOffersList> {
  int _index = 0;

  List<ActivePromo> get _carouselOffers {
    final applied = widget.appliedCode?.toUpperCase();
    if (applied == null || applied.isEmpty) return widget.offers;
    return widget.offers
        .where((o) => o.code.toUpperCase() != applied)
        .toList();
  }

  ActivePromo? get _appliedOffer {
    final applied = widget.appliedCode?.toUpperCase();
    if (applied == null || applied.isEmpty) return null;
    for (final offer in widget.offers) {
      if (offer.code.toUpperCase() == applied) return offer;
    }
    return null;
  }

  int _saveAmount(ActivePromo offer) {
    final type = offer.discountType.toUpperCase();
    if (type.contains('PERCENT')) {
      return (widget.subtotal * offer.discountValue / 100).floor();
    }
    return offer.discountValue;
  }

  String _benefit(ActivePromo offer) {
    final save = _saveAmount(offer);
    if (save > 0) return 'Save ${formatMoney(save)}';
    return offer.discountLabel;
  }

  @override
  void didUpdateWidget(covariant CheckoutOffersList oldWidget) {
    super.didUpdateWidget(oldWidget);
    final slides = _carouselOffers;
    if (_index >= slides.length) {
      _index = 0;
    }
  }

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    if (widget.isLoading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(
          child: SizedBox(
            width: 22,
            height: 22,
            child: CircularProgressIndicator(strokeWidth: 2, color: BcColors.brand),
          ),
        ),
      );
    }

    final applied = _appliedOffer;
    final slides = _carouselOffers;

    if (applied == null && slides.isEmpty) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(
          'No offers available right now.',
          style: TextStyle(color: bc.mutedText, fontSize: 13),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (applied != null) _AppliedBanner(offer: applied, benefit: _benefit(applied), onRemove: widget.onRemoveApplied),
        if (slides.isNotEmpty) ...[
          if (applied != null) const SizedBox(height: 12),
          Text(
            slides.length == 1 ? 'Available offer' : 'Available offers',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: onSurface,
            ),
          ),
          const SizedBox(height: 8),
          _Carousel(
            offers: slides,
            index: _index.clamp(0, slides.length - 1),
            onIndex: (i) => setState(() => _index = i),
            benefitOf: _benefit,
            onApply: widget.onApply,
          ),
        ],
      ],
    );
  }
}

class _AppliedBanner extends StatelessWidget {
  final ActivePromo offer;
  final String benefit;
  final VoidCallback? onRemove;

  const _AppliedBanner({
    required this.offer,
    required this.benefit,
    this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
      decoration: BoxDecoration(
        color: BcColors.brand.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: BcColors.brand.withValues(alpha: 0.35)),
      ),
      child: Row(
        children: [
          const Icon(Icons.local_offer_outlined, color: BcColors.brand, size: 18),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  offer.displayTitle,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                    color: onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  benefit,
                  style: const TextStyle(
                    color: BcColors.success,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
                Text(
                  offer.code,
                  style: TextStyle(
                    fontSize: 11,
                    letterSpacing: 0.4,
                    color: Theme.of(context).extension<BcAdaptive>()?.mutedText,
                  ),
                ),
              ],
            ),
          ),
          Switch.adaptive(
            value: true,
            activeThumbColor: Colors.white,
            activeTrackColor: BcColors.brand,
            onChanged: (_) => onRemove?.call(),
          ),
        ],
      ),
    );
  }
}

class _Carousel extends StatelessWidget {
  final List<ActivePromo> offers;
  final int index;
  final ValueChanged<int> onIndex;
  final String Function(ActivePromo) benefitOf;
  final ValueChanged<ActivePromo> onApply;

  const _Carousel({
    required this.offers,
    required this.index,
    required this.onIndex,
    required this.benefitOf,
    required this.onApply,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final offer = offers[index];
    final multi = offers.length > 1;

    return Column(
      children: [
        Row(
          children: [
            if (multi)
              _NavBtn(
                icon: Icons.chevron_left_rounded,
                onTap: () => onIndex((index - 1 + offers.length) % offers.length),
              ),
            Expanded(
              child: AnimatedSwitcher(
                duration: const Duration(milliseconds: 250),
                switchInCurve: Curves.easeOut,
                switchOutCurve: Curves.easeIn,
                transitionBuilder: (child, anim) => FadeTransition(
                  opacity: anim,
                  child: SlideTransition(
                    position: Tween<Offset>(
                      begin: const Offset(0.08, 0),
                      end: Offset.zero,
                    ).animate(anim),
                    child: child,
                  ),
                ),
                child: Row(
                  key: ValueKey(offer.code),
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            offer.displayTitle,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 13,
                              color: onSurface,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            benefitOf(offer),
                            style: const TextStyle(
                              color: BcColors.brand,
                              fontWeight: FontWeight.w700,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    TextButton(
                      onPressed: () => onApply(offer),
                      style: TextButton.styleFrom(
                        foregroundColor: Colors.white,
                        backgroundColor: BcColors.brand,
                        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10),
                        ),
                        textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                      ),
                      child: const Text('Apply'),
                    ),
                  ],
                ),
              ),
            ),
            if (multi)
              _NavBtn(
                icon: Icons.chevron_right_rounded,
                onTap: () => onIndex((index + 1) % offers.length),
              ),
          ],
        ),
        if (multi) ...[
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (var i = 0; i < offers.length; i++)
                GestureDetector(
                  onTap: () => onIndex(i),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    margin: const EdgeInsets.symmetric(horizontal: 3),
                    width: i == index ? 16 : 6,
                    height: 6,
                    decoration: BoxDecoration(
                      color: i == index ? BcColors.brand : bc.border,
                      borderRadius: BorderRadius.circular(99),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

class _NavBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _NavBtn({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    return IconButton(
      onPressed: onTap,
      visualDensity: VisualDensity.compact,
      padding: EdgeInsets.zero,
      constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
      icon: Icon(icon, size: 22, color: bc.mutedText),
    );
  }
}
