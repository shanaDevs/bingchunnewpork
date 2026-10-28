import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';
import 'product_radial_image.dart';

/// Dark My Cup hero with floating, auto-rotating real product photos.
/// Layout matches the design: title block + cups, then a full-width pickup chip
/// that stays fully visible above the white sheet.
class CartCupHeader extends StatefulWidget {
  final int drinkCount;
  final List<String> imageUrls;
  final String fulfillmentLabel;
  final String etaLabel;
  final VoidCallback onChangeFulfillment;

  const CartCupHeader({
    super.key,
    required this.drinkCount,
    required this.imageUrls,
    required this.fulfillmentLabel,
    required this.etaLabel,
    required this.onChangeFulfillment,
  });

  @override
  State<CartCupHeader> createState() => _CartCupHeaderState();
}

class _CartCupHeaderState extends State<CartCupHeader>
    with TickerProviderStateMixin {
  late final AnimationController _floatCtrl;
  late final AnimationController _swapCtrl;
  int _frontIndex = 0;
  Timer? _rotateTimer;

  @override
  void initState() {
    super.initState();
    _floatCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2800),
    )..repeat(reverse: true);
    _swapCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    _scheduleRotate();
  }

  @override
  void didUpdateWidget(covariant CartCupHeader oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.imageUrls.length != widget.imageUrls.length) {
      _frontIndex = 0;
      _scheduleRotate();
    }
  }

  void _scheduleRotate() {
    _rotateTimer?.cancel();
    if (widget.imageUrls.length < 2) return;
    _rotateTimer = Timer.periodic(const Duration(seconds: 3), (_) async {
      if (!mounted || widget.imageUrls.length < 2) return;
      await _swapCtrl.forward(from: 0);
      if (!mounted) return;
      setState(() {
        _frontIndex = (_frontIndex + 1) % widget.imageUrls.length;
      });
      _swapCtrl.reset();
    });
  }

  @override
  void dispose() {
    _rotateTimer?.cancel();
    _floatCtrl.dispose();
    _swapCtrl.dispose();
    super.dispose();
  }

  String? _urlAt(int offset) {
    if (widget.imageUrls.isEmpty) return null;
    return widget.imageUrls[(_frontIndex + offset) % widget.imageUrls.length];
  }

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;

    return ColoredBox(
      color: const Color(0xFF020B1C),
      child: DecoratedBox(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              Color(0xFF020B1C),
              Color(0xFF061428),
              Color(0xFF0A1D38),
              Color(0xFF123D8F),
            ],
            stops: [0.0, 0.35, 0.7, 1.0],
          ),
        ),
        child: Padding(
          // Extra bottom inset so the white sheet can overlap only empty navy space.
          padding: EdgeInsets.fromLTRB(16, top + 12, 16, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                height: 148,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned(
                      right: -8,
                      top: -4,
                      bottom: -4,
                      width: 150,
                      child: IgnorePointer(
                        child: AnimatedBuilder(
                          animation: Listenable.merge([_floatCtrl, _swapCtrl]),
                          builder: (context, _) {
                            final bob = math.sin(_floatCtrl.value * math.pi) * 7;
                            final tilt = (_floatCtrl.value - 0.5) * 0.05;
                            final swap = Curves.easeInOut.transform(_swapCtrl.value);
                            return Stack(
                              alignment: Alignment.center,
                              children: [
                                if (_urlAt(1) != null)
                                  Transform.translate(
                                    offset: Offset(22 - swap * 8, 14 + bob * 0.35),
                                    child: Transform.rotate(
                                      angle: 0.1 - tilt,
                                      child: Opacity(
                                        opacity: 0.6 + swap * 0.3,
                                        child: _CupPhoto(url: _urlAt(1)!, size: 96),
                                      ),
                                    ),
                                  ),
                                Transform.translate(
                                  offset: Offset(-4 + swap * 4, bob),
                                  child: Transform.rotate(
                                    angle: -0.04 + tilt,
                                    child: _CupPhoto(url: _urlAt(0), size: 118),
                                  ),
                                ),
                              ],
                            );
                          },
                        ),
                      ),
                    ),
                    Positioned.fill(
                      child: Padding(
                        padding: const EdgeInsets.only(right: 140),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'My Cup',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 28,
                                fontWeight: FontWeight.w800,
                                height: 1.15,
                              ),
                            ),
                            const SizedBox(height: 10),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: BcColors.brand,
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text(
                                '${widget.drinkCount} drink${widget.drinkCount == 1 ? '' : 's'}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              'Your favourites are almost ready',
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.88),
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                                height: 1.3,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              _FulfillmentChip(
                label: widget.fulfillmentLabel,
                etaLabel: widget.etaLabel,
                onChange: widget.onChangeFulfillment,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CupPhoto extends StatelessWidget {
  final String? url;
  final double size;

  const _CupPhoto({required this.url, required this.size});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.35),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: ProductRadialImage(
        imageUrl: url,
        width: size,
        height: size,
        borderRadius: BorderRadius.circular(size / 2),
        padding: const EdgeInsets.all(10),
        fit: BoxFit.contain,
        placeholderIcon: Icons.local_cafe_rounded,
      ),
    );
  }
}

class _FulfillmentChip extends StatelessWidget {
  final String label;
  final String etaLabel;
  final VoidCallback onChange;

  const _FulfillmentChip({
    required this.label,
    required this.etaLabel,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onChange,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.1),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: Colors.white.withValues(alpha: 0.28)),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  color: BcColors.brand.withValues(alpha: 0.28),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.shopping_bag_outlined, color: Colors.white, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Row(
                      children: [
                        const Icon(Icons.schedule_rounded, size: 13, color: Color(0xFF4ADE80)),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            etaLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.78),
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: onChange,
                style: TextButton.styleFrom(
                  foregroundColor: const Color(0xFF93C5FD),
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                child: const Text(
                  'Change',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
