package lk.bingchun.delivery.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.core.view.WindowCompat
import lk.bingchun.delivery.core.LocalBcFeedback
import lk.bingchun.delivery.core.RuntimeConfig
import lk.bingchun.delivery.core.rememberBcFeedback

private val BcShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(12.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(16.dp),
    extraLarge = RoundedCornerShape(22.dp),
)

/** True while the active scheme is dark — read by [BcLightStatusBarIcons] to restore. */
private val LocalBcDark = staticCompositionLocalOf { true }

@Composable
fun BingChunTheme(content: @Composable () -> Unit) {
    val modeName by RuntimeConfig.themeModeFlow.collectAsState()
    val mode = remember(modeName) {
        runCatching { ThemeMode.valueOf(modeName) }.getOrDefault(ThemeMode.SYSTEM)
    }
    val systemDark = isSystemInDarkTheme()
    val dark = when (mode) {
        ThemeMode.SYSTEM -> systemDark
        ThemeMode.LIGHT -> false
        ThemeMode.DARK -> true
    }
    val colors = if (dark) BcDarkPalette else BcLightPalette
    val m3 = if (dark) {
        darkColorScheme(
            primary = colors.brand,
            onPrimary = colors.onBrand,
            secondary = colors.accent,
            onSecondary = colors.onBrand,
            tertiary = colors.info,
            background = colors.background,
            onBackground = colors.text,
            surface = colors.card,
            onSurface = colors.text,
            surfaceVariant = colors.surface,
            onSurfaceVariant = colors.textMuted,
            outline = colors.border,
            error = colors.danger,
            onError = colors.onBrand,
        )
    } else {
        lightColorScheme(
            primary = colors.brand,
            onPrimary = colors.onBrand,
            secondary = colors.accent,
            onSecondary = colors.onBrand,
            tertiary = colors.info,
            background = colors.background,
            onBackground = colors.text,
            surface = colors.card,
            onSurface = colors.text,
            surfaceVariant = colors.surface,
            onSurfaceVariant = colors.textMuted,
            outline = colors.border,
            error = colors.danger,
            onError = colors.onBrand,
        )
    }

    SideEffect { BcColors.updateCurrent(colors) }

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as? Activity)?.window ?: return@SideEffect
            // Transparent bars so a gradient header can run to the top of the screen;
            // Scaffold's containerColor paints the neutral page behind everything else.
            @Suppress("DEPRECATION")
            window.statusBarColor = Color.Transparent.toArgb()
            @Suppress("DEPRECATION")
            window.navigationBarColor = Color.Transparent.toArgb()
            WindowCompat.getInsetsController(window, view).apply {
                isAppearanceLightStatusBars = !dark
                isAppearanceLightNavigationBars = !dark
            }
        }
    }

    val feedback = rememberBcFeedback()

    CompositionLocalProvider(
        LocalBcColors provides colors,
        LocalBcElevation provides BcElevation(),
        LocalBcMotion provides BcMotion,
        LocalBcFeedback provides feedback,
        LocalBcDark provides dark,
    ) {
        MaterialTheme(
            colorScheme = m3,
            typography = BcTypography,
            shapes = BcShapes,
            content = content,
        )
    }
}

/**
 * Forces white status-bar icons while composed, then restores the scheme default.
 * Used by screens whose dark gradient header runs under the status bar.
 */
@Composable
fun BcLightStatusBarIcons() {
    val view = LocalView.current
    val dark = LocalBcDark.current
    if (view.isInEditMode) return
    DisposableEffect(view, dark) {
        val window = (view.context as? Activity)?.window
        val controller = window?.let { WindowCompat.getInsetsController(it, view) }
        controller?.isAppearanceLightStatusBars = false
        onDispose { controller?.isAppearanceLightStatusBars = !dark }
    }
}
