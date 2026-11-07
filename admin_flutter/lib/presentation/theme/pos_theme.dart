import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Web cashier POS palette — values from Frontend/src/app/globals.css
/// (`@theme`, `[data-theme='light']`, `[data-theme='dark']`, `.admin-sidebar`).
@immutable
class PosColors extends ThemeExtension<PosColors> {
  const PosColors({
    required this.brand,
    required this.brandLight,
    required this.brandDark,
    required this.brandSubtle,
    required this.accent,
    required this.success,
    required this.warning,
    required this.danger,
    required this.canvas,
    required this.surface,
    required this.card,
    required this.border,
    required this.inputBg,
    required this.text,
    required this.textMuted,
    required this.textSoft,
    required this.productMedia,
    required this.priceText,
    required this.priceBg,
    required this.successText,
    required this.dangerText,
    required this.warningText,
    required this.cardShadow,
    required this.isDark,
  });

  /// `--color-brand` #307ef2.
  final Color brand;
  final Color brandLight;
  final Color brandDark;

  /// `--color-brand-subtle` (brand at 14%).
  final Color brandSubtle;

  /// `--color-accent` amber.
  final Color accent;
  final Color success;
  final Color warning;
  final Color danger;

  /// `--color-navy` page canvas.
  final Color canvas;

  /// `--color-navy-light` chrome / raised rows.
  final Color surface;

  /// `--color-navy-card`.
  final Color card;

  /// `--color-navy-border`.
  final Color border;
  final Color inputBg;

  /// `--color-fg` / `--color-text-muted` / `--color-text-soft`.
  final Color text;
  final Color textMuted;
  final Color textSoft;

  /// POS product card media panel and price pill (`--product-*`).
  final Gradient productMedia;
  final Color priceText;
  final Gradient priceBg;

  /// Readable status text on light surfaces (`--status-*`).
  final Color successText;
  final Color dangerText;
  final Color warningText;
  final Color cardShadow;
  final bool isDark;

  // Fixed in both themes, like the web.
  static const sidebarGradient = LinearGradient(
    colors: [Color(0xFF222162), Color(0xFF1A1953), Color(0xFF141243)],
    stops: [0, 0.52, 1],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );
  static const sidebarActiveText = Color(0xFF1A1953);
  static const heroGradient = LinearGradient(
    colors: [Color(0xFF1E3A8A), Color(0xFF2563EB), Color(0xFF3B82F6), Color(0xFF1D4ED8)],
    stops: [0, 0.42, 0.72, 1],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  /// Order queue status colours (`.admin-orders-toolbar__status-trigger--*`).
  static const received = Color(0xFF2563EB);
  static const preparing = Color(0xFFEA580C);
  static const ready = Color(0xFF16A34A);

  /// Revenue channel colours (BranchRevenueBreakdownDonut).
  static const channelPickupCash = Color(0xFF1E3A8A);
  static const channelPickupCard = Color(0xFF2563EB);
  static const channelPickupOnline = Color(0xFF307EF2);
  static const channelDeliveryOnline = Color(0xFF93C5FD);

  static const light = PosColors(
    brand: Color(0xFF307EF2),
    brandLight: Color(0xFF2563EB),
    brandDark: Color(0xFF1A5CD4),
    brandSubtle: Color(0x24307EF2),
    accent: Color(0xFFF59E0B),
    success: Color(0xFF22C55E),
    warning: Color(0xFFEAB308),
    danger: Color(0xFFEF4444),
    canvas: Color(0xFFDDE3ED),
    surface: Color(0xFFF3F5F9),
    card: Color(0xFFFFFFFF),
    border: Color(0xFFB8C5D6),
    inputBg: Color(0xFFF9FAFB),
    text: Color(0xFF111827),
    textMuted: Color(0xFF374151),
    textSoft: Color(0xFF4B5563),
    productMedia: LinearGradient(
      colors: [Color(0xFFDBEAFE), Color(0xFFF0F4F8), Color(0xFFE8EEF5)],
      stops: [0, 0.55, 1],
      begin: Alignment.topLeft,
      end: Alignment.bottomRight,
    ),
    priceText: Color(0xFF1A5CD4),
    priceBg: LinearGradient(colors: [Color(0x24307EF2), Color(0x0F307EF2)]),
    successText: Color(0xFF047857),
    dangerText: Color(0xFFB91C1C),
    warningText: Color(0xFFB45309),
    cardShadow: Color(0x140F172A),
    isDark: false,
  );

  static const dark = PosColors(
    brand: Color(0xFF307EF2),
    brandLight: Color(0xFF5C9AF5),
    brandDark: Color(0xFF1A5CD4),
    brandSubtle: Color(0x24307EF2),
    accent: Color(0xFFF59E0B),
    success: Color(0xFF22C55E),
    warning: Color(0xFFEAB308),
    danger: Color(0xFFEF4444),
    canvas: Color(0xFF080B18),
    surface: Color(0xFF0F1428),
    card: Color(0xFF151B32),
    border: Color(0xFF243049),
    inputBg: Color(0xFF0F172A),
    text: Color(0xFFEEF2FF),
    textMuted: Color(0xFF8B9CB8),
    textSoft: Color(0xFF64748B),
    productMedia: LinearGradient(colors: [Color(0xFF0F1428), Color(0xFF0F1428)]),
    priceText: Color(0xFF5C9AF5),
    priceBg: LinearGradient(colors: [Color(0x24307EF2), Color(0x24307EF2)]),
    successText: Color(0xFF4ADE80),
    dangerText: Color(0xFFF87171),
    warningText: Color(0xFFFBBF24),
    cardShadow: Color(0x00000000),
    isDark: true,
  );

  @override
  PosColors copyWith() => this;

  @override
  PosColors lerp(ThemeExtension<PosColors>? other, double t) => (other is PosColors && t >= 0.5) ? other : this;
}

extension PosThemeContext on BuildContext {
  PosColors get pos => Theme.of(this).extension<PosColors>() ?? PosColors.light;
}

class PosSpacing {
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
}

/// `--radius-card` 14, `--radius-btn` 10.
class PosRadius {
  static const double sm = 8;
  static const double button = 10;
  static const double card = 14;
  static const double lg = 16;
  static const double sheet = 20;
  static const double pill = 999;
}

class PosMotion {
  static const fast = Duration(milliseconds: 150);
  static const standard = Duration(milliseconds: 250);
}

const _font = 'Poppins';

class PosType {
  static const title = TextStyle(fontFamily: _font, fontWeight: FontWeight.w700, fontSize: 22, height: 1.25);
  static const heading = TextStyle(fontFamily: _font, fontWeight: FontWeight.w700, fontSize: 17, height: 1.3);
  static const section = TextStyle(fontFamily: _font, fontWeight: FontWeight.w600, fontSize: 14, height: 1.35);
  static const body = TextStyle(fontFamily: _font, fontWeight: FontWeight.w400, fontSize: 14, height: 1.45);
  static const bodyStrong = TextStyle(fontFamily: _font, fontWeight: FontWeight.w600, fontSize: 14, height: 1.45);
  static const caption = TextStyle(fontFamily: _font, fontWeight: FontWeight.w400, fontSize: 12, height: 1.4);
  static const label = TextStyle(
    fontFamily: _font,
    fontWeight: FontWeight.w700,
    fontSize: 11,
    height: 1.3,
    letterSpacing: 0.6,
  );
  static const button = TextStyle(fontFamily: _font, fontWeight: FontWeight.w700, fontSize: 14, height: 1.2);
  static const amount = TextStyle(
    fontFamily: _font,
    fontWeight: FontWeight.w700,
    fontSize: 18,
    height: 1.2,
    fontFeatures: [FontFeature.tabularFigures()],
  );
  static const metric = TextStyle(
    fontFamily: _font,
    fontWeight: FontWeight.w800,
    fontSize: 26,
    height: 1.15,
    fontFeatures: [FontFeature.tabularFigures()],
  );
  static const tabular = [FontFeature.tabularFigures()];
}

ThemeData buildPosTheme(bool dark) {
  final c = dark ? PosColors.dark : PosColors.light;
  final scheme = ColorScheme(
    brightness: dark ? Brightness.dark : Brightness.light,
    primary: c.brand,
    onPrimary: Colors.white,
    secondary: c.accent,
    onSecondary: Colors.white,
    error: c.danger,
    onError: Colors.white,
    surface: c.card,
    onSurface: c.text,
    surfaceContainerHighest: c.surface,
    onSurfaceVariant: c.textMuted,
    outline: c.border,
  );
  final textTheme = const TextTheme(
    headlineMedium: PosType.title,
    titleLarge: PosType.heading,
    titleMedium: PosType.section,
    titleSmall: PosType.bodyStrong,
    bodyLarge: PosType.body,
    bodyMedium: PosType.body,
    bodySmall: PosType.caption,
    labelLarge: PosType.button,
    labelSmall: PosType.label,
  ).apply(bodyColor: c.text, displayColor: c.text, fontFamily: _font);
  final inputBorder = OutlineInputBorder(
    borderRadius: BorderRadius.circular(PosRadius.button),
    borderSide: BorderSide(color: c.border),
  );
  return ThemeData(
    useMaterial3: true,
    fontFamily: _font,
    brightness: scheme.brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: c.canvas,
    textTheme: textTheme,
    extensions: [c],
    dividerColor: c.border,
    appBarTheme: AppBarTheme(
      backgroundColor: c.canvas,
      foregroundColor: c.text,
      elevation: 0,
      scrolledUnderElevation: 0,
      toolbarHeight: 64,
      leadingWidth: 64,
      titleSpacing: 4,
      titleTextStyle: PosType.heading.copyWith(color: c.text, fontSize: 18),
      systemOverlayStyle: dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
    ),
    // Every back button is a rounded bordered chip, like the app's PosIconButton.
    actionIconTheme: ActionIconThemeData(backButtonIconBuilder: (_) => _BackChip(colors: c)),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: c.inputBg,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
      hintStyle: PosType.body.copyWith(color: c.textSoft),
      border: inputBorder,
      enabledBorder: inputBorder,
      focusedBorder: inputBorder.copyWith(borderSide: BorderSide(color: c.brand, width: 1.6)),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.card,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(PosRadius.sheet))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PosRadius.lg)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: dark ? c.surface : const Color(0xFF111827),
      contentTextStyle: PosType.body.copyWith(color: Colors.white),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(PosRadius.card)),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: c.brand),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? Colors.white : null),
      trackColor: WidgetStateProperty.resolveWith((s) => s.contains(WidgetState.selected) ? c.brand : null),
    ),
  );
}

/// Back button face: a 40px rounded square on the card colour with a hairline border.
class _BackChip extends StatelessWidget {
  const _BackChip({required this.colors});
  final PosColors colors;

  @override
  Widget build(BuildContext context) => Container(
    width: 40,
    height: 40,
    decoration: BoxDecoration(
      color: colors.card,
      borderRadius: BorderRadius.circular(PosRadius.button + 2),
      border: Border.all(color: colors.border),
      boxShadow: colors.cardShadow.a == 0
          ? null
          : [BoxShadow(color: colors.cardShadow, blurRadius: 10, offset: const Offset(0, 2))],
    ),
    child: Icon(Icons.arrow_back_rounded, size: 20, color: colors.text),
  );
}
