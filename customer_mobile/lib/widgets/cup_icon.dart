import 'package:flutter/material.dart';
import '../theme/bc_theme.dart';

/// Map item count to cup fill (8 items = full cup) — matches web `cupFill.ts`.
double cupFillFromCount(int count, [int max = 8]) {
  if (count <= 0) return 0;
  return (count / max).clamp(0.0, 1.0);
}

enum CupIconSize { sm, md, lg }

class CupIcon extends StatefulWidget {
  final double fillLevel;
  final int? itemCount;
  final CupIconSize size;
  final bool inverted;
  final bool showLabel;

  const CupIcon({
    super.key,
    this.fillLevel = 0,
    this.itemCount,
    this.size = CupIconSize.md,
    this.inverted = false,
    this.showLabel = false,
  });

  factory CupIcon.fromCount({
    required int itemCount,
    CupIconSize size = CupIconSize.md,
    bool inverted = false,
    bool showLabel = false,
  }) {
    return CupIcon(
      fillLevel: cupFillFromCount(itemCount),
      itemCount: itemCount > 0 ? itemCount : null,
      size: size,
      inverted: inverted,
      showLabel: showLabel,
    );
  }

  @override
  State<CupIcon> createState() => _CupIconState();
}

class _CupIconState extends State<CupIcon> with SingleTickerProviderStateMixin {
  late AnimationController _fillController;
  late Animation<double> _fillAnimation;
  double _previousFill = 0;

  double get _width {
    switch (widget.size) {
      case CupIconSize.sm:
        return 22;
      case CupIconSize.md:
        return 28;
      case CupIconSize.lg:
        return 48;
    }
  }

  double get _height => _width * (78 / 64);

  @override
  void initState() {
    super.initState();
    _previousFill = widget.fillLevel;
    _fillController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _fillAnimation = AlwaysStoppedAnimation(widget.fillLevel);
  }

  @override
  void didUpdateWidget(CupIcon oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.fillLevel != widget.fillLevel) {
      _fillAnimation = Tween<double>(
        begin: _previousFill,
        end: widget.fillLevel,
      ).animate(CurvedAnimation(parent: _fillController, curve: Curves.easeOutCubic));
      _fillController.forward(from: 0);
      _previousFill = widget.fillLevel;
    }
  }

  @override
  void dispose() {
    _fillController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final badgeCount = widget.itemCount;

    return SizedBox(
      width: _width,
      height: _height,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          AnimatedBuilder(
            animation: _fillController,
            builder: (context, _) {
              final fill = _fillController.isAnimating ? _fillAnimation.value : widget.fillLevel;
              return CustomPaint(
                size: Size(_width, _height),
                painter: BubbleTeaCupPainter(
                  fillLevel: fill,
                  inverted: widget.inverted,
                  showLabel: widget.showLabel || widget.size == CupIconSize.lg,
                ),
              );
            },
          ),
          if (badgeCount != null && badgeCount > 0)
            Positioned(
              top: -4,
              right: -4,
              child: Container(
                constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
                padding: const EdgeInsets.symmetric(horizontal: 4),
                decoration: BoxDecoration(
                  color: widget.inverted ? Colors.white : BcColors.brand,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(
                  badgeCount > 99 ? '99+' : '$badgeCount',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: widget.inverted ? BcColors.brand : Colors.white,
                    fontSize: 9,
                    fontWeight: FontWeight.bold,
                    height: 1.2,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class BubbleTeaCupPainter extends CustomPainter {
  final double fillLevel;
  final bool inverted;
  final bool showLabel;
  final double splashRadius;
  final double splashOpacity;

  BubbleTeaCupPainter({
    required this.fillLevel,
    this.inverted = false,
    this.showLabel = false,
    this.splashRadius = 0,
    this.splashOpacity = 0,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 64;
    canvas.scale(scale, scale);

    final strokeColor = inverted ? const Color(0xD9FFFFFF) : BcColors.brand;
    final strawColor = inverted ? const Color(0x99FFFFFF) : const Color(0xFF94a3b8);
    final emptyTop = inverted ? const Color(0x26FFFFFF) : const Color(0xFFe8f1ff);
    final emptyBottom = inverted ? const Color(0x14FFFFFF) : const Color(0xFFc5d4f0);
    final lidTop = inverted ? Colors.white : BcColors.brand;
    final lidBottom = inverted ? const Color(0xFFdbeafe) : BcColors.brandDark;
    final labelColor = inverted ? Colors.white : BcColors.brand;

    final strawPaint = Paint()
      ..style = PaintingStyle.stroke
      ..color = strawColor
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;
    canvas.drawPath(
      Path()
        ..moveTo(48, 2)
        ..quadraticBezierTo(56, 14, 52, 30),
      strawPaint,
    );

    final lidPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [lidTop, lidBottom],
      ).createShader(const Rect.fromLTWH(0, 0, 64, 78));

    canvas.drawOval(const Rect.fromLTWH(8, 15, 48, 14), lidPaint);
    canvas.drawRRect(
      RRect.fromRectAndRadius(const Rect.fromLTWH(10, 17, 44, 9), const Radius.circular(3)),
      lidPaint,
    );

    final bodyPath = Path()
      ..moveTo(12, 26)
      ..lineTo(9, 68)
      ..quadraticBezierTo(9, 74, 32, 76)
      ..quadraticBezierTo(55, 74, 55, 68)
      ..lineTo(52, 26)
      ..close();

    final bodyFillPaint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [emptyTop, emptyBottom],
      ).createShader(const Rect.fromLTWH(0, 0, 64, 78));

    final bodyStrokePaint = Paint()
      ..style = PaintingStyle.stroke
      ..color = strokeColor
      ..strokeWidth = 1.5;

    canvas.drawPath(bodyPath, bodyFillPaint);
    canvas.drawPath(bodyPath, bodyStrokePaint);

    final fill = fillLevel.clamp(0.0, 1.0);
    if (fill > 0) {
      canvas.save();
      canvas.clipPath(bodyPath);

      const bodyTop = 26.0;
      const bodyBottom = 68.0;
      final bodyHeight = bodyBottom - bodyTop;
      final fillHeight = bodyHeight * fill;
      final fillY = bodyBottom - fillHeight;

      final liquidPaint = Paint()
        ..shader = const LinearGradient(
          begin: Alignment.bottomCenter,
          end: Alignment.topCenter,
          colors: [Color(0xFFb45309), Color(0xFFf59e0b), Color(0xFFfde68a)],
        ).createShader(Rect.fromLTWH(8, fillY, 48, fillHeight));

      canvas.drawRect(Rect.fromLTWH(8, fillY, 48, fillHeight), liquidPaint);

      if (fill > 0.05) {
        canvas.drawOval(
          Rect.fromLTWH(14, fillY - 1, 36, 6),
          Paint()..color = Colors.white.withValues(alpha: 0.4),
        );
      }

      if (fill > 0.2) {
        final bobaPaint = Paint()..color = BcColors.brandDark.withValues(alpha: 0.4);
        canvas.drawCircle(Offset(22, fillY + fillHeight * 0.45), 2.5, bobaPaint);
        canvas.drawCircle(Offset(32, fillY + fillHeight * 0.6), 2, bobaPaint);
        canvas.drawCircle(Offset(40, fillY + fillHeight * 0.38), 2.5, bobaPaint);
      }

      canvas.restore();

      if (splashOpacity > 0 && fill < 1.0) {
        canvas.drawOval(
          Rect.fromLTWH(32 - splashRadius, fillY, splashRadius * 2, 4),
          Paint()..color = Colors.white.withValues(alpha: splashOpacity),
        );
      }
    }

    if (showLabel) {
      final textPainter = TextPainter(
        text: TextSpan(
          text: 'Bing Chun',
          style: TextStyle(color: labelColor, fontSize: 7, fontWeight: FontWeight.bold),
        ),
        textDirection: TextDirection.ltr,
      );
      textPainter.layout();
      textPainter.paint(canvas, Offset(32 - textPainter.width / 2, 58 - textPainter.height / 2));
    }
  }

  @override
  bool shouldRepaint(BubbleTeaCupPainter oldDelegate) =>
      fillLevel != oldDelegate.fillLevel ||
      inverted != oldDelegate.inverted ||
      showLabel != oldDelegate.showLabel ||
      splashRadius != oldDelegate.splashRadius ||
      splashOpacity != oldDelegate.splashOpacity;
}
