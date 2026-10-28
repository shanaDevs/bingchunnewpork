import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

import '../models/active_promo.dart';
import '../theme/bc_theme.dart';

/// Web-aligned home offers carousel (home-offer-card-v2 look + Poppins).
class HomeOffersCarousel extends StatefulWidget {
  final List<ActivePromo> offers;
  final String? Function(ActivePromo offer) imageUrlFor;
  final Future<void> Function(ActivePromo offer) onClaim;

  const HomeOffersCarousel({
    super.key,
    required this.offers,
    required this.imageUrlFor,
    required this.onClaim,
  });

  @override
  State<HomeOffersCarousel> createState() => _HomeOffersCarouselState();
}

class _OfferTone {
  const _OfferTone({
    required this.gradient,
    required this.border,
    required this.glow,
    required this.codeColor,
    required this.ctaGradient,
  });

  final List<Color> gradient;
  final Color border;
  final Color glow;
  final Color codeColor;
  final List<Color> ctaGradient;
}

class _HomeOffersCarouselState extends State<HomeOffersCarousel> {
  late final PageController _controller;
  Timer? _autoPlay;
  int _index = 0;
  bool _claiming = false;

  static const _tones = [
    _OfferTone(
      gradient: [Color(0xFFEFF6FF), Color(0xFFDBEAFE), Color(0xFFBFDBFE)],
      border: Color(0x473B82F6),
      glow: Color(0x593B82F6),
      codeColor: Color(0xFF1D4ED8),
      ctaGradient: [Color(0xFF3B82F6), Color(0xFF2563EB)],
    ),
    _OfferTone(
      gradient: [Color(0xFFFFFBEB), Color(0xFFFEF3C7), Color(0xFFFDE68A)],
      border: Color(0x47F59E0B),
      glow: Color(0x4DF59E0B),
      codeColor: Color(0xFFC2410C),
      ctaGradient: [Color(0xFF3B82F6), Color(0xFF2563EB)],
    ),
    _OfferTone(
      gradient: [Color(0xFFECFDF5), Color(0xFFD1FAE5), Color(0xFFA7F3D0)],
      border: Color(0x4710B981),
      glow: Color(0x4D10B981),
      codeColor: Color(0xFF047857),
      ctaGradient: [Color(0xFF10B981), Color(0xFF059669)],
    ),
  ];

  @override
  void initState() {
    super.initState();
    _controller = PageController(viewportFraction: 0.92);
    _restartAutoPlay();
  }

  @override
  void didUpdateWidget(covariant HomeOffersCarousel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.offers.length != widget.offers.length) {
      _index = 0;
      if (_controller.hasClients) _controller.jumpToPage(0);
      _restartAutoPlay();
    }
  }

  void _restartAutoPlay() {
    _autoPlay?.cancel();
    if (widget.offers.length <= 1) return;
    _autoPlay = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted || !_controller.hasClients) return;
      final next = (_index + 1) % widget.offers.length;
      _controller.animateToPage(
        next,
        duration: const Duration(milliseconds: 420),
        curve: Curves.easeOutCubic,
      );
    });
  }

  @override
  void dispose() {
    _autoPlay?.cancel();
    _controller.dispose();
    super.dispose();
  }

  Future<void> _claim(ActivePromo offer) async {
    if (_claiming) return;
    setState(() => _claiming = true);
    try {
      await widget.onClaim(offer);
    } finally {
      if (mounted) setState(() => _claiming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (widget.offers.isEmpty) return const SizedBox.shrink();

    return Column(
      children: [
        SizedBox(
          height: 176,
          child: PageView.builder(
            controller: _controller,
            itemCount: widget.offers.length,
            onPageChanged: (i) {
              setState(() => _index = i);
              _restartAutoPlay();
            },
            itemBuilder: (context, i) {
              final offer = widget.offers[i];
              return Padding(
                padding: const EdgeInsets.only(right: 10),
                child: _OfferSlide(
                  offer: offer,
                  imageUrl: widget.imageUrlFor(offer),
                  tone: _tones[i % _tones.length],
                  claiming: _claiming && _index == i,
                  onClaim: () => _claim(offer),
                  onCopy: () async {
                    await Clipboard.setData(ClipboardData(text: offer.code));
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).hideCurrentSnackBar();
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          '${offer.code} copied',
                          style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                        ),
                        duration: const Duration(seconds: 1),
                        behavior: SnackBarBehavior.floating,
                      ),
                    );
                  },
                ),
              );
            },
          ),
        ),
        if (widget.offers.length > 1) ...[
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(widget.offers.length, (i) {
              final active = i == _index;
              return AnimatedContainer(
                duration: const Duration(milliseconds: 220),
                margin: const EdgeInsets.symmetric(horizontal: 3),
                width: active ? 16 : 6,
                height: 6,
                decoration: BoxDecoration(
                  color: active ? BcColors.brand : const Color(0xFFCDD6E5),
                  borderRadius: BorderRadius.circular(4),
                ),
              );
            }),
          ),
        ],
      ],
    );
  }
}

class _OfferSlide extends StatelessWidget {
  final ActivePromo offer;
  final String? imageUrl;
  final _OfferTone tone;
  final bool claiming;
  final VoidCallback onClaim;
  final VoidCallback onCopy;

  const _OfferSlide({
    required this.offer,
    required this.imageUrl,
    required this.tone,
    required this.claiming,
    required this.onClaim,
    required this.onCopy,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: tone.gradient,
        ),
        borderRadius: BorderRadius.circular(19),
        border: Border.all(color: tone.border),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF0F172A).withValues(alpha: 0.09),
            blurRadius: 28,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        children: [
          Positioned(
            right: -32,
            top: -32,
            child: Container(
              width: 112,
              height: 112,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(colors: [tone.glow, tone.glow.withValues(alpha: 0)]),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.88),
                          borderRadius: BorderRadius.circular(999),
                          border: Border.all(color: Colors.white),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(Icons.auto_awesome, size: 11, color: tone.codeColor),
                            const SizedBox(width: 4),
                            Text(
                              'TODAY ONLY',
                              style: GoogleFonts.poppins(
                                fontSize: 9,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0.6,
                                color: const Color(0xFFE8913A),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 8),
                      GestureDetector(
                        onTap: onCopy,
                        child: Text(
                          offer.code,
                          style: GoogleFonts.poppins(
                            color: tone.codeColor,
                            fontWeight: FontWeight.w800,
                            fontSize: 12,
                            letterSpacing: 0.8,
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        offer.discountLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.poppins(
                          color: const Color(0xFF0F172A),
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          height: 1.15,
                          letterSpacing: -0.3,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        offer.subtitle,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: GoogleFonts.poppins(
                          color: const Color(0xFF64748B),
                          fontSize: 11,
                          fontWeight: FontWeight.w500,
                          height: 1.35,
                        ),
                      ),
                      const Spacer(),
                      Material(
                        color: Colors.transparent,
                        child: InkWell(
                          onTap: claiming ? null : onClaim,
                          borderRadius: BorderRadius.circular(999),
                          child: Ink(
                            decoration: BoxDecoration(
                              gradient: LinearGradient(colors: tone.ctaGradient),
                              borderRadius: BorderRadius.circular(999),
                              boxShadow: [
                                BoxShadow(
                                  color: const Color(0xFF2563EB).withValues(alpha: 0.28),
                                  blurRadius: 12,
                                  offset: const Offset(0, 4),
                                ),
                              ],
                            ),
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
                              child: claiming
                                  ? const SizedBox(
                                      width: 14,
                                      height: 14,
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                    )
                                  : Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          'Claim offer',
                                          style: GoogleFonts.poppins(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w700,
                                            fontSize: 12,
                                          ),
                                        ),
                                        const SizedBox(width: 4),
                                        const Icon(Icons.chevron_right_rounded, color: Colors.white, size: 16),
                                      ],
                                    ),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
                SizedBox(
                  width: 104,
                  child: AspectRatio(
                    aspectRatio: 0.85,
                    child: _OfferProductImage(imageUrl: imageUrl),
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

class _OfferProductImage extends StatelessWidget {
  final String? imageUrl;

  const _OfferProductImage({required this.imageUrl});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(14),
        gradient: RadialGradient(
          center: const Alignment(0, -0.15),
          radius: 0.95,
          colors: [
            Colors.white.withValues(alpha: 0.95),
            Colors.white.withValues(alpha: 0.5),
            Colors.white.withValues(alpha: 0.18),
          ],
        ),
        boxShadow: [
          BoxShadow(
            color: BcColors.brand.withValues(alpha: 0.12),
            blurRadius: 14,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: Stack(
        fit: StackFit.expand,
        children: [
          Align(
            alignment: const Alignment(0, 0.72),
            child: Container(
              width: 72,
              height: 26,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(40),
                gradient: RadialGradient(
                  colors: [
                    BcColors.brand.withValues(alpha: 0.18),
                    BcColors.brand.withValues(alpha: 0.0),
                  ],
                ),
              ),
            ),
          ),
          if (imageUrl != null && imageUrl!.isNotEmpty)
            Padding(
              padding: const EdgeInsets.all(8),
              child: Image.network(
                imageUrl!,
                fit: BoxFit.contain,
                alignment: Alignment.center,
                filterQuality: FilterQuality.medium,
                errorBuilder: (_, __, ___) => const _OfferImageFallback(),
                loadingBuilder: (context, child, progress) {
                  if (progress == null) return child;
                  return const Center(
                    child: SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: BcColors.brand),
                    ),
                  );
                },
              ),
            )
          else
            const _OfferImageFallback(),
        ],
      ),
    );
  }
}

class _OfferImageFallback extends StatelessWidget {
  const _OfferImageFallback();

  @override
  Widget build(BuildContext context) {
    return Container(
      color: const Color(0xFFE8F1FF),
      alignment: Alignment.center,
      child: const Icon(Icons.local_cafe_rounded, color: BcColors.brand, size: 36),
    );
  }
}
