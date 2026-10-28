import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Premium Bing Chun color scheme — light + dark. Port of Color.kt.
@immutable
class BcColors extends ThemeExtension<BcColors> {
  final Color brand;
  final Color brandLight;
  final Color brandDark;
  final Color accent;
  final Color accentPurple;
  final Color success;
  final Color warning;
  final Color danger;
  final Color info;
  final Color background;
  final Color surface;
  final Color surfaceElevated;
  final Color card;
  final Color border;
  final Color text;
  final Color textMuted;
  final Color disabled;
  final Color pressed;
  final Color onBrand;
  final Color brandSubtle;
  final Color errorSoft;
  final Color stopCyan;
  final Color stopViolet;

  /// Fill behind the rounded icon squares used in list rows and stat tiles.
  final Color iconTile;

  /// Idle input outline — brand-tinted on light, neutral on dark.
  final Color inputBorder;

  /// Card drop shadow; transparent on dark, where borders carry the separation.
  final Color cardShadow;
  final Color successSubtle;
  final Color warningSubtle;
  final Color dangerSubtle;
  final Color infoSubtle;
  final Color surfacePill;
  final bool isDark;

  const BcColors({
    required this.brand,
    required this.brandLight,
    required this.brandDark,
    required this.accent,
    required this.accentPurple,
    required this.success,
    required this.warning,
    required this.danger,
    required this.info,
    required this.background,
    required this.surface,
    required this.surfaceElevated,
    required this.card,
    required this.border,
    required this.text,
    required this.textMuted,
    required this.disabled,
    required this.pressed,
    required this.onBrand,
    required this.brandSubtle,
    required this.errorSoft,
    required this.stopCyan,
    required this.stopViolet,
    required this.iconTile,
    required this.inputBorder,
    required this.cardShadow,
    required this.successSubtle,
    required this.warningSubtle,
    required this.dangerSubtle,
    required this.infoSubtle,
    required this.surfacePill,
    required this.isDark,
  });

  Color get white => Colors.white;
  Color get error => danger;

  static const dark = BcColors(
    brand: Color(0xFF307EF2),
    brandLight: Color(0xFF5C9AF5),
    brandDark: Color(0xFF1A5CD4),
    accent: Color(0xFFF59E0B),
    accentPurple: Color(0xFF6B5CFF),
    success: Color(0xFF22C985),
    warning: Color(0xFFFFB020),
    danger: Color(0xFFFF5C67),
    info: Color(0xFF22D3EE),
    background: Color(0xFF0A1224),
    surface: Color(0xFF121A31),
    surfaceElevated: Color(0xFF17213B),
    card: Color(0xFF151B32),
    border: Color(0xFF233054),
    text: Color(0xFFF7F9FF),
    textMuted: Color(0xFF94A3C2),
    disabled: Color(0xFF3A4560),
    pressed: Color(0xFF1E2744),
    onBrand: Color(0xFFFFFFFF),
    brandSubtle: Color(0x24307EF2),
    errorSoft: Color(0xFFF87171),
    stopCyan: Color(0xFF22D3EE),
    stopViolet: Color(0xFFA78BFA),
    iconTile: Color(0xFF16243F),
    inputBorder: Color(0x24FFFFFF),
    cardShadow: Color(0x00000000),
    successSubtle: Color(0x2422C985),
    warningSubtle: Color(0x26FFB020),
    dangerSubtle: Color(0x26FF5C67),
    infoSubtle: Color(0x2422D3EE),
    surfacePill: Color(0xFF1E294A),
    isDark: true,
  );

  /// Light palette mirrors the customer app: a neutral page, white cards with a
  /// hairline border and a soft shadow, and brand blue reserved for icons, values and CTAs.
  static const light = BcColors(
    brand: Color(0xFF307EF2),
    brandLight: Color(0xFF5C9AF5),
    brandDark: Color(0xFF1A5CD4),
    accent: Color(0xFFD97706),
    accentPurple: Color(0xFF6B5CFF),
    success: Color(0xFF16A34A),
    warning: Color(0xFFD97706),
    danger: Color(0xFFDC2626),
    info: Color(0xFF0891B2),
    background: Color(0xFFF3F6FB),
    surface: Color(0xFFFFFFFF),
    surfaceElevated: Color(0xFFFFFFFF),
    card: Color(0xFFFFFFFF),
    border: Color(0xFFE8EEF5),
    text: Color(0xFF0B1F3F),
    textMuted: Color(0xFF6B7C93),
    disabled: Color(0xFFC5CDD9),
    pressed: Color(0xFFF0F4FA),
    onBrand: Color(0xFFFFFFFF),
    brandSubtle: Color(0xFFE8F1FF),
    errorSoft: Color(0xFFEF4444),
    stopCyan: Color(0xFF06B6D4),
    stopViolet: Color(0xFF8B5CF6),
    iconTile: Color(0xFFE8F1FF),
    inputBorder: Color(0xFF8EB5FF),
    cardShadow: Color(0x0F000000),
    successSubtle: Color(0xFFE8F8F0),
    warningSubtle: Color(0xFFFEF3C7),
    dangerSubtle: Color(0xFFFEE2E2),
    infoSubtle: Color(0xFFE0EDFD),
    surfacePill: Color(0xFFEFF3F8),
    isDark: false,
  );

  @override
  BcColors copyWith() => this;

  @override
  BcColors lerp(ThemeExtension<BcColors>? other, double t) => (other is BcColors && t >= 0.5) ? other : this;
}

extension BcThemeContext on BuildContext {
  BcColors get bc => Theme.of(this).extension<BcColors>() ?? BcColors.light;
}

/// Dark navy header band — identical in both schemes on purpose.
const headerGradient = LinearGradient(
  colors: [Color(0xFF020B1C), Color(0xFF061428), Color(0xFF0A1D38)],
  begin: Alignment.topLeft,
  end: Alignment.bottomRight,
);

const riderTabHeaderGradient = LinearGradient(
  colors: [Color(0xFF071E3D), Color(0xFF0C2B54), Color(0xFF1A5CD4), Color(0xFF0E386E)],
  begin: Alignment.topCenter,
  end: Alignment.bottomCenter,
);

/// Spacing scale — port of Tokens.kt.
class BcSpacing {
  static const double xxs = 2;
  static const double xs = 4;
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 24;
  static const double xxxl = 32;
}

class BcRadius {
  static const double sm = 8;
  static const double md = 12;
  static const double lg = 16;
  static const double xl = 20;
  static const double xxl = 28;
  static const double full = 999;
  static const double card = 16;
  static const double button = 14;
}

class BcMotion {
  static const fast = Duration(milliseconds: 150);
  static const standard = Duration(milliseconds: 250);
  static const slow = Duration(milliseconds: 350);
  static const success = Duration(milliseconds: 520);
}

/// Type scale — port of Type.kt (system font).
class BcType {
  static const largeTitle = TextStyle(fontWeight: FontWeight.w700, fontSize: 32, height: 38 / 32, letterSpacing: -0.5);
  static const title = TextStyle(fontWeight: FontWeight.w700, fontSize: 24, height: 30 / 24, letterSpacing: -0.3);
  static const subtitle = TextStyle(fontWeight: FontWeight.w600, fontSize: 20, height: 26 / 20);
  static const section = TextStyle(fontWeight: FontWeight.w600, fontSize: 15, height: 20 / 15, letterSpacing: 0.1);
  static const body = TextStyle(fontWeight: FontWeight.w400, fontSize: 15, height: 22 / 15);
  static const bodyStrong = TextStyle(fontWeight: FontWeight.w600, fontSize: 15, height: 22 / 15);
  static const caption = TextStyle(fontWeight: FontWeight.w400, fontSize: 13, height: 18 / 13);
  static const button = TextStyle(fontWeight: FontWeight.w600, fontSize: 15, height: 20 / 15);
  static const label = TextStyle(fontWeight: FontWeight.w500, fontSize: 12, height: 16 / 12, letterSpacing: 0.2);
  static const tiny = TextStyle(fontWeight: FontWeight.w500, fontSize: 11, height: 14 / 11);
  static const amount = TextStyle(fontWeight: FontWeight.w700, fontSize: 20, height: 24 / 20, letterSpacing: -0.3);
  static const displayHero = TextStyle(fontWeight: FontWeight.w700, fontSize: 30, height: 34 / 30, letterSpacing: -0.5);
  static const displayMetric = TextStyle(fontWeight: FontWeight.w700, fontSize: 36, height: 40 / 36, letterSpacing: -1);
}

ThemeData buildBcTheme(bool dark) {
  final c = dark ? BcColors.dark : BcColors.light;
  final scheme = ColorScheme(
    brightness: dark ? Brightness.dark : Brightness.light,
    primary: c.brand,
    onPrimary: c.onBrand,
    secondary: c.accent,
    onSecondary: c.onBrand,
    tertiary: c.info,
    error: c.danger,
    onError: c.onBrand,
    surface: c.card,
    onSurface: c.text,
    surfaceContainerHighest: c.surface,
    onSurfaceVariant: c.textMuted,
    outline: c.border,
  );
  final textTheme = TextTheme(
    displayLarge: BcType.largeTitle,
    displayMedium: BcType.title,
    displaySmall: BcType.subtitle,
    headlineLarge: BcType.title,
    headlineMedium: BcType.subtitle,
    headlineSmall: BcType.section,
    titleLarge: BcType.subtitle,
    titleMedium: BcType.section,
    titleSmall: BcType.bodyStrong,
    bodyLarge: BcType.body,
    bodyMedium: BcType.body,
    bodySmall: BcType.caption,
    labelLarge: BcType.button,
    labelMedium: BcType.label,
    labelSmall: BcType.tiny,
  ).apply(bodyColor: c.text, displayColor: c.text);
  return ThemeData(
    useMaterial3: true,
    brightness: scheme.brightness,
    colorScheme: scheme,
    scaffoldBackgroundColor: c.background,
    textTheme: textTheme,
    extensions: [c],
    dividerColor: c.border,
    appBarTheme: AppBarTheme(
      backgroundColor: c.background,
      foregroundColor: c.text,
      elevation: 0,
      systemOverlayStyle: dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.card,
      surfaceTintColor: Colors.transparent,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(BcRadius.xxl))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.card,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BcRadius.xl)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: dark ? c.surfaceElevated : const Color(0xFF0B1F3F),
      contentTextStyle: BcType.body.copyWith(color: Colors.white, fontWeight: FontWeight.w500),
      actionTextColor: const Color(0xFF7CB7FF),
      elevation: 6,
      insetPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: c.brand),
  );
}
