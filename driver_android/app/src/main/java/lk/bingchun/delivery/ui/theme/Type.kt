package lk.bingchun.delivery.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Immutable
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/**
 * Clean system font hierarchy (Inter-like on modern Android).
 * Drop TTFs into res/font/ later if a custom face is required.
 */
val BcFontFamily: FontFamily = FontFamily.Default

@Immutable
data class BcTypeScale(
    val largeTitle: TextStyle,
    val title: TextStyle,
    val subtitle: TextStyle,
    val section: TextStyle,
    val body: TextStyle,
    val bodyStrong: TextStyle,
    val caption: TextStyle,
    val button: TextStyle,
    val label: TextStyle,
    val tiny: TextStyle,
    val amount: TextStyle,
    val displayHero: TextStyle,
    val displayMetric: TextStyle,
)

val BcType = BcTypeScale(
    largeTitle = TextStyle(
        fontFamily = BcFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 38.sp,
        letterSpacing = (-0.5).sp,
    ),
    title = TextStyle(
        fontFamily = BcFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 24.sp,
        lineHeight = 30.sp,
        letterSpacing = (-0.3).sp,
    ),
    subtitle = TextStyle(
        fontFamily = BcFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 26.sp,
    ),
    section = TextStyle(
        fontFamily = BcFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 20.sp,
        letterSpacing = 0.1.sp,
    ),
    body = TextStyle(
        fontFamily = BcFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 15.sp,
        lineHeight = 22.sp,
    ),
    bodyStrong = TextStyle(
        fontFamily = BcFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 22.sp,
    ),
    caption = TextStyle(
        fontFamily = BcFontFamily,
        fontWeight = FontWeight.Normal,
        fontSize = 13.sp,
        lineHeight = 18.sp,
    ),
    button = TextStyle(
        fontFamily = BcFontFamily,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 20.sp,
    ),
    label = TextStyle(
        fontFamily = BcFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        letterSpacing = 0.2.sp,
    ),
    tiny = TextStyle(
        fontFamily = BcFontFamily,
        fontWeight = FontWeight.Medium,
        fontSize = 11.sp,
        lineHeight = 14.sp,
    ),
    amount = TextStyle(
        fontFamily = BcFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 20.sp,
        lineHeight = 24.sp,
        letterSpacing = (-0.3).sp,
    ),
    displayHero = TextStyle(
        fontFamily = BcFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 30.sp,
        lineHeight = 34.sp,
        letterSpacing = (-0.5).sp,
    ),
    displayMetric = TextStyle(
        fontFamily = BcFontFamily,
        fontWeight = FontWeight.Bold,
        fontSize = 36.sp,
        lineHeight = 40.sp,
        letterSpacing = (-1).sp,
    ),
)

val BcTypography: Typography = Typography(
    displayLarge = BcType.largeTitle,
    displayMedium = BcType.title,
    displaySmall = BcType.subtitle,
    headlineLarge = BcType.title,
    headlineMedium = BcType.subtitle,
    headlineSmall = BcType.section,
    titleLarge = BcType.subtitle,
    titleMedium = BcType.section,
    titleSmall = BcType.bodyStrong,
    bodyLarge = BcType.body,
    bodyMedium = BcType.body,
    bodySmall = BcType.caption,
    labelLarge = BcType.button,
    labelMedium = BcType.label,
    labelSmall = BcType.tiny,
)
