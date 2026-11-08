import 'package:flutter/material.dart';

import '../theme/bc_theme.dart';

/// App name shown in the UI (QuickDrop rider branding).
const kAppName = 'QuickDrop';

/// QuickDrop app mark — the launcher artwork in a rounded tile (ports `LogoMark`).
class QdLogoMark extends StatelessWidget {
  const QdLogoMark({super.key, this.size = 56, this.inverse = false, this.shadow = true});

  final double size;

  /// Adds a white keyline, for use on blue backgrounds.
  final bool inverse;
  final bool shadow;

  @override
  Widget build(BuildContext context) {
    final radius = BorderRadius.circular(size * 0.28);
    return Semantics(
      image: true,
      label: kAppName,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          borderRadius: radius,
          border: inverse ? Border.all(color: Colors.white.withValues(alpha: 0.55), width: 1.5) : null,
          boxShadow: shadow
              ? [
                  BoxShadow(
                    color: const Color(0xFF0B1626).withValues(alpha: inverse ? 0.28 : 0.16),
                    blurRadius: size * 0.4,
                    offset: Offset(0, size * 0.14),
                  ),
                ]
              : null,
        ),
        child: ClipRRect(
          borderRadius: radius,
          child: Image.asset('assets/images/logo.png', fit: BoxFit.cover, filterQuality: FilterQuality.medium),
        ),
      ),
    );
  }
}

/// "QuickDrop" wordmark (ports `Wordmark`): sm / md / lg.
class QdWordmark extends StatelessWidget {
  const QdWordmark({super.key, this.inverse = false, this.size = QdWordmarkSize.md});

  final bool inverse;
  final QdWordmarkSize size;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final fontSize = switch (size) {
      QdWordmarkSize.sm => 20.0,
      QdWordmarkSize.md => 22.0,
      QdWordmarkSize.lg => 34.0,
    };
    return Text(
      kAppName,
      style: TextStyle(
        fontFamily: BcFonts.sans,
        fontSize: fontSize,
        fontWeight: FontWeight.w700,
        letterSpacing: -0.5,
        color: inverse ? Colors.white : c.foreground,
      ),
    );
  }
}

enum QdWordmarkSize { sm, md, lg }

/// Logo tile + wordmark side by side.
class QdLockup extends StatelessWidget {
  const QdLockup({super.key, this.inverse = true, this.logoSize = 36, this.size = QdWordmarkSize.md});

  final bool inverse;
  final double logoSize;
  final QdWordmarkSize size;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      QdLogoMark(size: logoSize, inverse: inverse, shadow: false),
      const SizedBox(width: 10),
      QdWordmark(inverse: inverse, size: size),
    ],
  );
}
