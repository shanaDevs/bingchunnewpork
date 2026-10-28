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

  /// Light stop-detail surfaces (order screen + verification modal only).
  static const stopCanvas = Color(0xFFF4F7FB);
  static const stopCard = Color(0xFFFFFFFF);
  static const stopBorder = Color(0xFFE6EEF8);
  static const stopInk = Color(0xFF0B1F3A);
  static const stopMuted = Color(0xFF6B7C99);
  static const stopBrandWash = Color(0xFFE8F1FE);
  static const stopPaidBg = Color(0xFFDCFCE7);
  static const stopPaidFg = Color(0xFF15803D);
}

class BcTheme {
  static ThemeData get dark {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: BcColors.navy,
      colorScheme: const ColorScheme.dark(
        primary: BcColors.brand,
        onPrimary: Colors.white,
        secondary: BcColors.accent,
        surface: BcColors.navyCard,
        onSurface: BcColors.text,
        error: BcColors.error,
      ),
    );

    return base.copyWith(
      textTheme: GoogleFonts.poppinsTextTheme(base.textTheme).apply(
        bodyColor: BcColors.text,
        displayColor: BcColors.text,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: BcColors.navy,
        foregroundColor: BcColors.text,
        elevation: 0,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: BcColors.navyCard,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: const BorderSide(color: BcColors.navyBorder),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: BcColors.navyLight,
        hintStyle: const TextStyle(color: BcColors.textMuted),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: BcColors.navyBorder, width: 1.5),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: const BorderSide(color: BcColors.navyBorder, width: 1.5),
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
      dividerColor: BcColors.navyBorder,
    );
  }

  /// Local light theme for the driver stop screen and OTP modal.
  static ThemeData get stopLight {
    final base = ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: BcColors.stopCanvas,
      colorScheme: const ColorScheme.light(
        primary: BcColors.brand,
        onPrimary: Colors.white,
        secondary: BcColors.accent,
        surface: BcColors.stopCard,
        onSurface: BcColors.stopInk,
        error: BcColors.error,
      ),
    );

    return base.copyWith(
      textTheme: GoogleFonts.poppinsTextTheme(base.textTheme).apply(
        bodyColor: BcColors.stopInk,
        displayColor: BcColors.stopInk,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: BcColors.stopCanvas,
        foregroundColor: BcColors.stopInk,
        elevation: 0,
        centerTitle: false,
        scrolledUnderElevation: 0,
      ),
      cardTheme: CardThemeData(
        color: BcColors.stopCard,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: const BorderSide(color: BcColors.stopBorder),
        ),
      ),
      dividerColor: BcColors.stopBorder,
    );
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
