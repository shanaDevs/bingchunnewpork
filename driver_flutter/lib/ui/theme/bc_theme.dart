import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// QuickDrop colour system — light + dark. Ported 1:1 from the QuickDrop rider app
/// (`src/theme/colors.ts`). Legacy field names (`brand`, `card`, `textMuted` ...) are kept
/// as aliases of the QuickDrop tokens so every existing widget re-themes automatically;
/// prefer the QuickDrop names (`primary`, `surface`, `mutedForeground` ...) in new code.
@immutable
class BcColors extends ThemeExtension<BcColors> {
  // ---- QuickDrop tokens ----
  final Color background;
  final Color surface;
  final Color elevated;
  final Color muted;
  final Color border;
  final Color foreground;
  final Color mutedForeground;
  final Color subtleForeground;
  final Color iconMuted;
  final Color primary;
  final Color primaryForeground;
  final Color primarySoft;
  final Color primaryStrong;
  final Color action;
  final Color actionForeground;
  final Color success;
  final Color successForeground;
  final Color successSoft;
  final Color successStrong;
  final Color call;
  final Color callForeground;
  final Color warning;
  final Color warningForeground;
  final Color warningSoft;
  final Color warningStrong;
  final Color accent;
  final Color accentForeground;
  final Color accentSoft;
  final Color accentStrong;
  final Color highlight;
  final Color highlightForeground;
  final Color error;
  final Color errorForeground;
  final Color errorSoftBg;
  final Color errorStrong;
  final Color scrim;
  final Color inverse;
  final Color inverseForeground;
  final Color inverseMuted;
  final Color online;
  final Color onlineKnob;
  final Color onlineForeground;
  final Color onBrand;
  final Color onBrandMuted;

  // ---- Map / list accents kept from the previous theme ----
  final Color stopCyan;
  final Color stopViolet;
  final Color cardShadow;
  final bool isDark;

  const BcColors({
    required this.background,
    required this.surface,
    required this.elevated,
    required this.muted,
    required this.border,
    required this.foreground,
    required this.mutedForeground,
    required this.subtleForeground,
    required this.iconMuted,
    required this.primary,
    required this.primaryForeground,
    required this.primarySoft,
    required this.primaryStrong,
    required this.action,
    required this.actionForeground,
    required this.success,
    required this.successForeground,
    required this.successSoft,
    required this.successStrong,
    required this.call,
    required this.callForeground,
    required this.warning,
    required this.warningForeground,
    required this.warningSoft,
    required this.warningStrong,
    required this.accent,
    required this.accentForeground,
    required this.accentSoft,
    required this.accentStrong,
    required this.highlight,
    required this.highlightForeground,
    required this.error,
    required this.errorForeground,
    required this.errorSoftBg,
    required this.errorStrong,
    required this.scrim,
    required this.inverse,
    required this.inverseForeground,
    required this.inverseMuted,
    required this.online,
    required this.onlineKnob,
    required this.onlineForeground,
    required this.onBrand,
    required this.onBrandMuted,
    required this.stopCyan,
    required this.stopViolet,
    required this.cardShadow,
    required this.isDark,
  });

  // ---- Legacy aliases (existing widgets) ----
  Color get brand => primary;
  Color get brandLight => primaryStrong;
  Color get brandDark => action;
  Color get card => surface;
  Color get surfaceElevated => elevated;
  Color get text => foreground;
  Color get textMuted => mutedForeground;
  Color get disabled => isDark ? const Color(0xFF3A5278) : const Color(0xFFC3CAD6);
  Color get pressed => muted;
  Color get brandSubtle => primarySoft;
  Color get iconTile => primarySoft;
  Color get inputBorder => border;
  Color get surfacePill => muted;
  Color get danger => error;
  Color get dangerSubtle => errorSoftBg;
  Color get info => primary;
  Color get infoSubtle => primarySoft;
  Color get successSubtle => successSoft;
  Color get warningSubtle => warningSoft;

  /// Red text on a card / soft-red background (was a flat light red).
  Color get errorSoft => errorStrong;
  Color get white => Colors.white;
  Color get accentPurple => stopViolet;

  /// Brand gradient (home hero, headers, lock screen).
  List<Color> get brandGradient => isDark
      ? const [Color(0xFF1677FF), Color(0xFF0F5AD0), Color(0xFF073B88)]
      : const [Color(0xFF2684FC), Color(0xFF176CE2), Color(0xFF0F55C4)];

  /// Deeper end of the gradient, for panels with small white text.
  List<Color> get brandDeepGradient =>
      isDark ? const [Color(0xFF0F5AD0), Color(0xFF073B88)] : const [Color(0xFF176CE2), Color(0xFF0F55C4)];

  /// Sign-in header: brand blue fading into the page, top to bottom.
  List<Color> get authFade => isDark
      ? const [Color(0xFF1677FF), Color(0xFF1066E6), Color(0xFF0B4CB0), Color(0xFF0A3274), Color(0xFF081E45), Color(0xFF071426)]
      : const [Color(0xFF2684FC), Color(0xFF3B90FD), Color(0xFF62A8FE), Color(0xFF9ACAFF), Color(0xFFD2E8FF), Color(0xFFFFFFFF)];

  static const authFadeStops = [0.0, 0.22, 0.42, 0.62, 0.82, 1.0];

  static const dark = BcColors(
    background: Color(0xFF071426),
    surface: Color(0xFF122744),
    elevated: Color(0xFF172E50),
    muted: Color(0xFF0B1D36),
    border: Color(0xFF294364),
    foreground: Color(0xFFF8FAFC),
    mutedForeground: Color(0xFFA9BFDE),
    subtleForeground: Color(0xFF8196B5),
    iconMuted: Color(0xFF8FA5C4),
    primary: Color(0xFF3B9CFF),
    primaryForeground: Color(0xFF071426),
    primarySoft: Color(0xFF13325C),
    primaryStrong: Color(0xFF5CAEFF),
    action: Color(0xFF0F6AF0),
    actionForeground: Color(0xFFFFFFFF),
    success: Color(0xFF34D399),
    successForeground: Color(0xFF071426),
    successSoft: Color(0xFF0E3A36),
    successStrong: Color(0xFF34D399),
    call: Color(0xFF008200),
    callForeground: Color(0xFFFFFFFF),
    warning: Color(0xFFFBBF24),
    warningForeground: Color(0xFF071426),
    warningSoft: Color(0xFF3A3016),
    warningStrong: Color(0xFFFBBF24),
    accent: Color(0xFFFFD60A),
    accentForeground: Color(0xFF071426),
    accentSoft: Color(0xFF3A3209),
    accentStrong: Color(0xFFFFD60A),
    highlight: Color(0xFF1A3A66),
    highlightForeground: Color(0xFFF8FAFC),
    error: Color(0xFFFB7185),
    errorForeground: Color(0xFF071426),
    errorSoftBg: Color(0xFF3A1C2E),
    errorStrong: Color(0xFFFB7185),
    scrim: Color(0xFF020812),
    inverse: Color(0xFF203C66),
    inverseForeground: Color(0xFFF8FAFC),
    inverseMuted: Color(0xFFA9BFDE),
    online: Color(0xFFFFF75E),
    onlineKnob: Color(0xFFEAD600),
    onlineForeground: Color(0xFF101828),
    onBrand: Color(0xFFFFFFFF),
    onBrandMuted: Color(0xFFDCE9FF),
    stopCyan: Color(0xFF22D3EE),
    stopViolet: Color(0xFFA78BFA),
    cardShadow: Color(0x00000000),
    isDark: true,
  );

  static const light = BcColors(
    background: Color(0xFFF4F6FA),
    surface: Color(0xFFFFFFFF),
    elevated: Color(0xFFFFFFFF),
    muted: Color(0xFFEBEEF4),
    border: Color(0xFFE6EAF0),
    foreground: Color(0xFF101828),
    mutedForeground: Color(0xFF5E6779),
    subtleForeground: Color(0xFF5E6779),
    iconMuted: Color(0xFF5E6779),
    primary: Color(0xFF2684FC),
    primaryForeground: Color(0xFFFFFFFF),
    primarySoft: Color(0xFFEAF3FF),
    primaryStrong: Color(0xFF1667D6),
    action: Color(0xFF2563EB),
    actionForeground: Color(0xFFFFFFFF),
    success: Color(0xFF16845C),
    successForeground: Color(0xFFFFFFFF),
    successSoft: Color(0xFFE2F3EC),
    successStrong: Color(0xFF0F6B4A),
    call: Color(0xFF008200),
    callForeground: Color(0xFFFFFFFF),
    warning: Color(0xFFE49A25),
    warningForeground: Color(0xFF172B4D),
    warningSoft: Color(0xFFFCF0DC),
    warningStrong: Color(0xFF8A5300),
    accent: Color(0xFFFFD60A),
    accentForeground: Color(0xFF101828),
    accentSoft: Color(0xFFFFF7CC),
    accentStrong: Color(0xFF7A5900),
    highlight: Color(0xFFDDEEFF),
    highlightForeground: Color(0xFF101828),
    error: Color(0xFFD94A4A),
    errorForeground: Color(0xFFFFFFFF),
    errorSoftBg: Color(0xFFFBE8E8),
    errorStrong: Color(0xFFB23636),
    scrim: Color(0xFF0B1626),
    inverse: Color(0xFF101828),
    inverseForeground: Color(0xFFFFFFFF),
    inverseMuted: Color(0xFF98A2B3),
    online: Color(0xFFFFF75E),
    onlineKnob: Color(0xFFEAD600),
    onlineForeground: Color(0xFF101828),
    onBrand: Color(0xFFFFFFFF),
    onBrandMuted: Color(0xFFEEF3FB),
    stopCyan: Color(0xFF06B6D4),
    stopViolet: Color(0xFF8B5CF6),
    cardShadow: Color(0x0F101828),
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

/// QuickDrop brand-blue header gradient (the dark variant lives on [BcColors.brandGradient]).
const headerGradient = LinearGradient(
  colors: [Color(0xFF2684FC), Color(0xFF176CE2), Color(0xFF0F55C4)],
  begin: Alignment.topRight,
  end: Alignment.bottomLeft,
);

const riderTabHeaderGradient = headerGradient;

/// Spacing scale (4px grid, QuickDrop `tokens.ts`).
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

/// Radii (QuickDrop: inputs 14, cards 20, sheets 28, buttons/chips full).
class BcRadius {
  static const double sm = 10;
  static const double md = 14;
  static const double lg = 20;
  static const double xl = 24;
  static const double xxl = 28;
  static const double full = 999;
  static const double card = 20;
  static const double button = 999;
}

class BcMotion {
  static const fast = Duration(milliseconds: 120);
  static const standard = Duration(milliseconds: 220);
  static const slow = Duration(milliseconds: 320);
  static const success = Duration(milliseconds: 520);
}

/// Font families: Plus Jakarta Sans for body, Inter for headings (QuickDrop).
class BcFonts {
  static const sans = 'PlusJakartaSans';
  static const heading = 'Inter';
}

/// Type scale — QuickDrop `typography` tokens (display 34 … caption 12).
class BcType {
  static const largeTitle = TextStyle(
    fontFamily: BcFonts.heading,
    fontWeight: FontWeight.w800,
    fontSize: 34,
    height: 42 / 34,
    letterSpacing: -0.8,
  );
  static const title = TextStyle(
    fontFamily: BcFonts.heading,
    fontWeight: FontWeight.w700,
    fontSize: 24,
    height: 32 / 24,
    letterSpacing: -0.5,
  );
  static const subtitle = TextStyle(
    fontFamily: BcFonts.heading,
    fontWeight: FontWeight.w700,
    fontSize: 20,
    height: 28 / 20,
    letterSpacing: -0.3,
  );
  static const section = TextStyle(
    fontFamily: BcFonts.heading,
    fontWeight: FontWeight.w700,
    fontSize: 16,
    height: 22 / 16,
    letterSpacing: -0.2,
  );
  static const body = TextStyle(fontWeight: FontWeight.w400, fontSize: 15, height: 22 / 15);
  static const bodyStrong = TextStyle(fontWeight: FontWeight.w600, fontSize: 15, height: 22 / 15);
  static const caption = TextStyle(fontWeight: FontWeight.w500, fontSize: 13, height: 18 / 13);
  static const button = TextStyle(fontWeight: FontWeight.w700, fontSize: 15, height: 20 / 15);
  static const label = TextStyle(fontWeight: FontWeight.w500, fontSize: 12, height: 16 / 12);
  static const tiny = TextStyle(fontWeight: FontWeight.w500, fontSize: 12, height: 14 / 11);
  static const amount = TextStyle(
    fontFamily: BcFonts.heading,
    fontWeight: FontWeight.w700,
    fontSize: 20,
    height: 24 / 20,
    letterSpacing: -0.3,
  );
  static const displayHero = TextStyle(
    fontFamily: BcFonts.heading,
    fontWeight: FontWeight.w800,
    fontSize: 28,
    height: 36 / 28,
    letterSpacing: -0.6,
  );
  static const displayMetric = TextStyle(
    fontFamily: BcFonts.heading,
    fontWeight: FontWeight.w800,
    fontSize: 36,
    height: 40 / 36,
    letterSpacing: -1,
  );
}

/// Soft QuickDrop card shadow ("a faint 1px ring plus a wide soft shadow") for light mode;
/// dark mode separates layers by surface colour and a navy hairline instead.
List<BoxShadow> bcShadow(BcColors c, {double strength = 1}) => c.isDark
    ? const []
    : [
        BoxShadow(color: const Color(0x0D101828), blurRadius: 16 * strength, offset: const Offset(0, 4)),
      ];

ThemeData buildBcTheme(bool dark) {
  final c = dark ? BcColors.dark : BcColors.light;
  final scheme = ColorScheme(
    brightness: dark ? Brightness.dark : Brightness.light,
    primary: c.primary,
    onPrimary: c.primaryForeground,
    secondary: c.accent,
    onSecondary: c.accentForeground,
    tertiary: c.success,
    error: c.error,
    onError: c.errorForeground,
    surface: c.surface,
    onSurface: c.foreground,
    surfaceContainerHighest: c.muted,
    onSurfaceVariant: c.mutedForeground,
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
  ).apply(bodyColor: c.foreground, displayColor: c.foreground);
  return ThemeData(
    useMaterial3: true,
    brightness: scheme.brightness,
    colorScheme: scheme,
    fontFamily: BcFonts.sans,
    scaffoldBackgroundColor: c.background,
    textTheme: textTheme,
    extensions: [c],
    dividerColor: c.border,
    appBarTheme: AppBarTheme(
      backgroundColor: c.background,
      foregroundColor: c.foreground,
      elevation: 0,
      systemOverlayStyle: dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: c.elevated,
      surfaceTintColor: Colors.transparent,
      modalBarrierColor: c.scrim.withValues(alpha: 0.5),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(BcRadius.xxl))),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: c.elevated,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BcRadius.xxl)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: c.inverse,
      contentTextStyle: BcType.body.copyWith(color: c.inverseForeground, fontWeight: FontWeight.w600),
      actionTextColor: c.accent,
      elevation: 6,
      insetPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(color: c.primary),
  );
}
