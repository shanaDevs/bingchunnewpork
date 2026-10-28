import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Bing Chun design tokens — aligned with Frontend/globals.css
class BcColors {
  static const brand = Color(0xFF307EF2);
  static const brandLight = Color(0xFF5C9AF5);
  static const brandDark = Color(0xFF1A5CD4);
  static const accent = Color(0xFFF59E0B);
  static const success = Color(0xFF22C55E);
  static const error = Color(0xFFEF4444);

  static const navy = Color(0xFF080B18);
  static const navyLight = Color(0xFF0F1428);
  static const navyCard = Color(0xFF151B32);
  static const navyBorder = Color(0xFF243049);
  static const text = Color(0xFFEEF2FF);
  static const textMuted = Color(0xFF8B9CB8);
  static const brandSubtle = Color(0x24307EF2);

  // Light palette — used when themeMode is light
  static const lightBg = Color(0xFFF5F8FC);
  static const lightSurface = Color(0xFFFFFFFF);
  static const lightBorder = Color(0xFFE2EBF6);
  static const lightText = Color(0xFF1E293B);
  static const lightTextMuted = Color(0xFF64748B);
}

/// Theme-aware surface colors — use via `context.bc` instead of hardcoded navy tokens.
@immutable
class BcAdaptive extends ThemeExtension<BcAdaptive> {
  final Color pageBg;
  final Color cardBg;
  final Color border;
  final Color mutedText;
  final Color fabBg;
  final Color secondaryBg; // Added for inputs / details containers

  const BcAdaptive({
    required this.pageBg,
    required this.cardBg,
    required this.border,
    required this.mutedText,
    required this.fabBg,
    required this.secondaryBg,
  });

  static const dark = BcAdaptive(
    pageBg: BcColors.navy,
    cardBg: BcColors.navyCard,
    border: BcColors.navyBorder,
    mutedText: BcColors.textMuted,
    fabBg: BcColors.navyCard,
    secondaryBg: BcColors.navyLight,
  );

  static const light = BcAdaptive(
    pageBg: BcColors.lightBg,
    cardBg: BcColors.lightSurface,
    border: BcColors.lightBorder,
    mutedText: BcColors.lightTextMuted,
    fabBg: BcColors.lightSurface,
    secondaryBg: Color(0xFFF0F4FA),
  );

  @override
  BcAdaptive copyWith({
    Color? pageBg,
    Color? cardBg,
    Color? border,
    Color? mutedText,
    Color? fabBg,
    Color? secondaryBg,
  }) {
    return BcAdaptive(
      pageBg: pageBg ?? this.pageBg,
      cardBg: cardBg ?? this.cardBg,
      border: border ?? this.border,
      mutedText: mutedText ?? this.mutedText,
      fabBg: fabBg ?? this.fabBg,
      secondaryBg: secondaryBg ?? this.secondaryBg,
    );
  }

  @override
  BcAdaptive lerp(ThemeExtension<BcAdaptive>? other, double t) {
    if (other is! BcAdaptive) return this;
    return BcAdaptive(
      pageBg: Color.lerp(pageBg, other.pageBg, t)!,
      cardBg: Color.lerp(cardBg, other.cardBg, t)!,
      border: Color.lerp(border, other.border, t)!,
      mutedText: Color.lerp(mutedText, other.mutedText, t)!,
      fabBg: Color.lerp(fabBg, other.fabBg, t)!,
      secondaryBg: Color.lerp(secondaryBg, other.secondaryBg, t)!,
    );
  }
}

extension BcAdaptiveContext on BuildContext {
  BcAdaptive get bc => Theme.of(this).extension<BcAdaptive>()!;
}

class BcTheme {
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData get light => _build(Brightness.light);

  static ThemeData _build(Brightness brightness) {
    final isLight = brightness == Brightness.light;
    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: isLight ? BcColors.lightBg : BcColors.navy,
      colorScheme: isLight
          ? const ColorScheme.light(
              primary: BcColors.brand,
              onPrimary: Colors.white,
              secondary: BcColors.accent,
              surface: BcColors.lightSurface,
              onSurface: BcColors.lightText,
              error: BcColors.error,
            )
          : const ColorScheme.dark(
              primary: BcColors.brand,
              onPrimary: Colors.white,
              secondary: BcColors.accent,
              surface: BcColors.navyCard,
              onSurface: BcColors.text,
              error: BcColors.error,
            ),
    );

    return base.copyWith(
      extensions: [isLight ? BcAdaptive.light : BcAdaptive.dark],
      textTheme: GoogleFonts.poppinsTextTheme(base.textTheme).apply(
        bodyColor: isLight ? BcColors.lightText : BcColors.text,
        displayColor: isLight ? BcColors.lightText : BcColors.text,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: isLight ? BcColors.lightSurface : BcColors.navy,
        foregroundColor: isLight ? BcColors.lightText : BcColors.text,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: isLight ? BcColors.lightSurface : BcColors.navyCard,
        elevation: isLight ? 1 : 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: BorderSide(color: isLight ? BcColors.lightBorder.withOpacity(0.6) : BcColors.navyBorder),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: isLight ? const Color(0xFFF1F5F9) : BcColors.navyLight,
        hintStyle: TextStyle(color: isLight ? BcColors.lightTextMuted : BcColors.textMuted),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: isLight ? BcColors.lightBorder : BcColors.navyBorder, width: 1.5),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: isLight ? BcColors.lightBorder : BcColors.navyBorder, width: 1.5),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: BcColors.brand, width: 1.5),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: BcColors.brand,
          foregroundColor: Colors.white,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          textStyle: GoogleFonts.poppins(fontWeight: FontWeight.w600, fontSize: 15),
        ),
      ),
      dividerColor: isLight ? BcColors.lightBorder : BcColors.navyBorder,
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: isLight ? BcColors.lightSurface : BcColors.navyCard,
        selectedItemColor: BcColors.brand,
        unselectedItemColor: isLight ? BcColors.lightTextMuted : BcColors.textMuted,
      ),
    );
  }

  static LinearGradient heroGradientFor(Brightness brightness) {
    if (brightness == Brightness.light) {
      return const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFFDBEAFE), Color(0xFF93C5FD), BcColors.brand, Color(0xFF2563EB)],
        stops: [0.0, 0.38, 0.62, 1.0],
      );
    }
    return heroGradient;
  }

  static LinearGradient get heroGradient => const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF071840), Color(0xFF123D8F), BcColors.brand, Color(0xFF0C2D6E)],
        stops: [0.0, 0.38, 0.62, 1.0],
      );

  static LinearGradient get brandGradient => const LinearGradient(
        colors: [BcColors.brand, BcColors.brandLight],
      );
}
