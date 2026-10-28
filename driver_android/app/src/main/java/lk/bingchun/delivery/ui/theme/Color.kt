package lk.bingchun.delivery.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import java.util.concurrent.atomic.AtomicReference

/**
 * Premium Bing Chun color scheme — light + dark.
 * Legacy aliases (navy*, errorSoft, white) keep existing call sites compiling.
 */
@Immutable
data class BcColorScheme(
    val brand: Color,
    val brandLight: Color,
    val brandDark: Color,
    val accent: Color,
    val accentPurple: Color,
    val success: Color,
    val warning: Color,
    val danger: Color,
    val info: Color,
    val background: Color,
    val surface: Color,
    val surfaceElevated: Color,
    val card: Color,
    val border: Color,
    val text: Color,
    val textMuted: Color,
    val disabled: Color,
    val pressed: Color,
    val onBrand: Color,
    val brandSubtle: Color,
    val errorSoft: Color,
    val stopCyan: Color,
    val stopViolet: Color,
    val white: Color,
    /** Fill behind the rounded icon squares used in list rows and stat tiles. */
    val iconTile: Color,
    /** Idle input outline — brand-tinted on light, neutral on dark. */
    val inputBorder: Color,
    /** Card drop shadow; transparent on dark, where borders carry the separation. */
    val cardShadow: Color,
    val successSubtle: Color = success.copy(alpha = 0.16f),
    val warningSubtle: Color = warning.copy(alpha = 0.16f),
    val dangerSubtle: Color = danger.copy(alpha = 0.16f),
    val infoSubtle: Color = info.copy(alpha = 0.16f),
    val surfacePill: Color = surfaceElevated,
    val isDark: Boolean = false,
    // Legacy aliases used across screens
    val navy: Color = background,
    val navyLight: Color = surface,
    val navyCard: Color = card,
    val navyBorder: Color = border,
    val error: Color = danger,
)

val BcDarkPalette = BcColorScheme(
    brand = Color(0xFF307EF2),
    brandLight = Color(0xFF5C9AF5),
    brandDark = Color(0xFF1A5CD4),
    accent = Color(0xFFF59E0B),
    accentPurple = Color(0xFF6B5CFF),
    success = Color(0xFF22C985),
    warning = Color(0xFFFFB020),
    danger = Color(0xFFFF5C67),
    info = Color(0xFF22D3EE),
    background = Color(0xFF0A1224),
    surface = Color(0xFF121A31),
    surfaceElevated = Color(0xFF17213B),
    card = Color(0xFF151B32),
    border = Color(0xFF233054),
    text = Color(0xFFF7F9FF),
    textMuted = Color(0xFF94A3C2),
    disabled = Color(0xFF3A4560),
    pressed = Color(0xFF1E2744),
    onBrand = Color(0xFFFFFFFF),
    brandSubtle = Color(0x24307EF2),
    errorSoft = Color(0xFFF87171),
    stopCyan = Color(0xFF22D3EE),
    stopViolet = Color(0xFFA78BFA),
    white = Color(0xFFFFFFFF),
    iconTile = Color(0xFF16243F),
    inputBorder = Color(0x24FFFFFF),
    cardShadow = Color.Transparent,
    successSubtle = Color(0x2422C985),
    warningSubtle = Color(0x26FFB020),
    dangerSubtle = Color(0x26FF5C67),
    infoSubtle = Color(0x2422D3EE),
    surfacePill = Color(0xFF1E294A),
    isDark = true,
)

/**
 * Light palette mirrors the customer app (`customer_mobile/lib/theme/bc_theme.dart` and
 * `widgets/design/bc_app_design.dart`): a neutral page, white cards with a hairline border
 * and a soft shadow, and brand blue reserved for icons, values and CTAs — never a surface.
 */
val BcLightPalette = BcColorScheme(
    brand = Color(0xFF307EF2),
    brandLight = Color(0xFF5C9AF5),
    brandDark = Color(0xFF1A5CD4),
    accent = Color(0xFFD97706),
    accentPurple = Color(0xFF6B5CFF),
    success = Color(0xFF16A34A),
    warning = Color(0xFFD97706),
    danger = Color(0xFFDC2626),
    info = Color(0xFF0891B2),
    background = Color(0xFFF3F6FB),
    surface = Color(0xFFFFFFFF),
    surfaceElevated = Color(0xFFFFFFFF),
    card = Color(0xFFFFFFFF),
    border = Color(0xFFE8EEF5),
    text = Color(0xFF0B1F3F),
    textMuted = Color(0xFF6B7C93),
    disabled = Color(0xFFC5CDD9),
    pressed = Color(0xFFF0F4FA),
    onBrand = Color(0xFFFFFFFF),
    brandSubtle = Color(0xFFE8F1FF),
    errorSoft = Color(0xFFEF4444),
    stopCyan = Color(0xFF06B6D4),
    stopViolet = Color(0xFF8B5CF6),
    white = Color(0xFFFFFFFF),
    iconTile = Color(0xFFE8F1FF),
    inputBorder = Color(0xFF8EB5FF),
    cardShadow = Color(0x0F000000),
    successSubtle = Color(0xFFE8F8F0),
    warningSubtle = Color(0xFFFEF3C7),
    dangerSubtle = Color(0xFFFEE2E2),
    infoSubtle = Color(0xFFE0EDFD),
    surfacePill = Color(0xFFEFF3F8),
    isDark = false,
)

val LocalBcColors = staticCompositionLocalOf { BcDarkPalette }

/**
 * Theme-aware color accessor. Updated by [BingChunTheme] via [updateCurrent].
 * Safe for AndroidView / default params; prefer [LocalBcColors] inside composables
 * so theme switches trigger recomposition.
 */
object BcColors {
    private val current = AtomicReference(BcDarkPalette)

    internal fun updateCurrent(scheme: BcColorScheme) {
        current.set(scheme)
    }

    private val c get() = current.get()

    val brand get() = c.brand
    val brandLight get() = c.brandLight
    val brandDark get() = c.brandDark
    val accent get() = c.accent
    val accentPurple get() = c.accentPurple
    val success get() = c.success
    val warning get() = c.warning
    val danger get() = c.danger
    val info get() = c.info
    val background get() = c.background
    val surface get() = c.surface
    val surfaceElevated get() = c.surfaceElevated
    val card get() = c.card
    val border get() = c.border
    val text get() = c.text
    val textMuted get() = c.textMuted
    val disabled get() = c.disabled
    val pressed get() = c.pressed
    val onBrand get() = c.onBrand
    val brandSubtle get() = c.brandSubtle
    val errorSoft get() = c.errorSoft
    val stopCyan get() = c.stopCyan
    val stopViolet get() = c.stopViolet
    val white get() = c.white
    val navy get() = c.navy
    val navyLight get() = c.navyLight
    val navyCard get() = c.navyCard
    val navyBorder get() = c.navyBorder
    val error get() = c.error
    val iconTile get() = c.iconTile
    val inputBorder get() = c.inputBorder
    val cardShadow get() = c.cardShadow
    val successSubtle get() = c.successSubtle
    val warningSubtle get() = c.warningSubtle
    val dangerSubtle get() = c.dangerSubtle
    val infoSubtle get() = c.infoSubtle
    val surfacePill get() = c.surfacePill
    val isDark get() = c.isDark
}

/**
 * Dark navy header band — the exact `BcDesign.headerGradient` from the customer app.
 * Identical in both schemes on purpose: the header is always dark, like the customer home.
 */
val HeaderGradient: Brush
    get() = Brush.linearGradient(
        colors = listOf(Color(0xFF020B1C), Color(0xFF061428), Color(0xFF0A1D38)),
    )

fun riderTabHeaderGradient(): Brush = Brush.verticalGradient(
    colors = listOf(
        Color(0xFF071E3D),
        Color(0xFF0C2B54),
        Color(0xFF1A5CD4),
        Color(0xFF0E386E),
    ),
)

/** Login / hero background — adapts slightly by scheme. */
fun heroGradient(dark: Boolean): Brush = if (dark) {
    Brush.linearGradient(
        0.0f to Color(0xFF071840),
        0.38f to Color(0xFF123D8F),
        0.62f to Color(0xFF307EF2),
        1.0f to Color(0xFF0C2D6E),
    )
} else {
    Brush.linearGradient(
        0.0f to Color(0xFFE8F0FE),
        0.45f to Color(0xFFD4E4FC),
        0.75f to Color(0xFFB8D4FA),
        1.0f to Color(0xFF9BC2F7),
    )
}

@Deprecated("Use heroGradient(isDark)", ReplaceWith("heroGradient(true)"))
val HeroGradient: Brush get() = heroGradient(true)

@Deprecated("Use heroGradient(isDark)", ReplaceWith("heroGradient(true)"))
val HeroGradientStops: Brush get() = heroGradient(true)

val BrandGradient: Brush
    get() = Brush.linearGradient(
        colors = listOf(BcColors.brand, BcColors.brandLight),
    )
