import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../../core/feedback.dart';
import '../theme/pos_theme.dart';

/// Product photo with the 🧋 fallback the web uses.
class ProductImage extends StatelessWidget {
  const ProductImage({super.key, this.url, this.size, this.contain = false, this.radius = PosRadius.sm});

  final String? url;
  final double? size;
  final bool contain;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    Widget fallback() => Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: c.surface, borderRadius: BorderRadius.circular(radius)),
      child: Text('🧋', style: TextStyle(fontSize: (size ?? 48) * 0.5)),
    );
    if (url == null || url!.isEmpty) return fallback();
    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: CachedNetworkImage(
        imageUrl: url!,
        width: size,
        height: size,
        fit: contain ? BoxFit.contain : BoxFit.cover,
        fadeInDuration: PosMotion.fast,
        placeholder: (_, _) => Container(width: size, height: size, color: c.surface),
        errorWidget: (_, _, _) => fallback(),
      ),
    );
  }
}

/// − qty + stepper (web cart line controls).
class QtyStepper extends StatelessWidget {
  const QtyStepper({super.key, required this.quantity, required this.onChanged, this.min = 0, this.max});

  final int quantity;
  final ValueChanged<int> onChanged;

  /// Lowest value the minus button goes to (0 lets a line be dropped).
  final int min;
  final int? max;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    Widget btn(IconData icon, VoidCallback? onTap) => Material(
      color: c.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(PosRadius.sm),
        side: BorderSide(color: c.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(PosRadius.sm),
        onTap: onTap == null
            ? null
            : () {
                PosFeedback.tap();
                onTap();
              },
        child: SizedBox(width: 32, height: 32, child: Icon(icon, size: 15, color: onTap == null ? c.textSoft : c.text)),
      ),
    );
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        btn(Icons.remove_rounded, quantity > min ? () => onChanged(quantity - 1) : null),
        SizedBox(
          width: 34,
          child: Text(
            '$quantity',
            textAlign: TextAlign.center,
            style: PosType.bodyStrong.copyWith(color: c.text, fontFeatures: PosType.tabular),
          ),
        ),
        btn(Icons.add_rounded, max == null || quantity < max! ? () => onChanged(quantity + 1) : null),
      ],
    );
  }
}
