package lk.bingchun.delivery.ui.theme

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.SpringSpec
import androidx.compose.animation.core.TweenSpec
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Premium spacing scale. */
object BcSpacing {
    val xxs: Dp = 2.dp
    val xs: Dp = 4.dp
    val sm: Dp = 8.dp
    val md: Dp = 12.dp
    val lg: Dp = 16.dp
    val xl: Dp = 20.dp
    val xxl: Dp = 24.dp
    val xxxl: Dp = 32.dp
}

/** Corner radius scale. */
object BcRadius {
    val sm: Dp = 8.dp
    val md: Dp = 12.dp
    val lg: Dp = 16.dp
    val xl: Dp = 20.dp
    val xxl: Dp = 28.dp
    val full: Dp = 999.dp

    /** Card and button radii matched to the customer app's `BcCard` / `BcPrimaryButton`. */
    val card: Dp = 16.dp
    val button: Dp = 14.dp

    val smShape = RoundedCornerShape(sm)
    val mdShape = RoundedCornerShape(md)
    val lgShape = RoundedCornerShape(lg)
    val xlShape = RoundedCornerShape(xl)
    val xxlShape = RoundedCornerShape(xxl)
    val fullShape = RoundedCornerShape(full)
    val cardShape = RoundedCornerShape(card)
    val buttonShape = RoundedCornerShape(button)
}

/** Soft elevation levels — dark mode prefers surface tint over black shadow. */
@Immutable
data class BcElevation(
    val none: Dp = 0.dp,
    val low: Dp = 2.dp,
    val mid: Dp = 6.dp,
    val high: Dp = 12.dp,
)

val LocalBcElevation = staticCompositionLocalOf { BcElevation() }

/** Motion tokens — 150–350ms, easeOut / easeInOut / spring. */
object BcMotion {
    const val FastMs = 150
    const val StandardMs = 250
    const val SlowMs = 350
    const val SuccessMs = 520

    val EaseOut = CubicBezierEasing(0.0f, 0.0f, 0.2f, 1.0f)
    val EaseInOut = CubicBezierEasing(0.4f, 0.0f, 0.2f, 1.0f)

    fun durationMs(base: Int, reduced: Boolean): Int = if (reduced) 1 else base

    fun <T> fast(): TweenSpec<T> = tween(FastMs, easing = EaseOut)
    fun <T> standard(): TweenSpec<T> = tween(StandardMs, easing = EaseOut)
    fun <T> slow(): TweenSpec<T> = tween(SlowMs, easing = EaseInOut)
    fun <T> move(): TweenSpec<T> = tween(StandardMs, easing = EaseInOut)

    fun <T> press(): SpringSpec<T> = spring(
        dampingRatio = 0.75f,
        stiffness = Spring.StiffnessMedium,
    )

    fun <T> sheet(): SpringSpec<T> = spring(
        dampingRatio = 0.85f,
        stiffness = Spring.StiffnessMediumLow,
    )
}

val LocalBcMotion = staticCompositionLocalOf { BcMotion }

@Composable
fun rememberReducedMotion(): Boolean {
    val context = androidx.compose.ui.platform.LocalContext.current
    return remember(context) {
        try {
            android.provider.Settings.Global.getFloat(
                context.contentResolver,
                android.provider.Settings.Global.ANIMATOR_DURATION_SCALE,
                1f,
            ) == 0f
        } catch (_: Exception) {
            false
        }
    }
}

enum class ThemeMode {
    SYSTEM,
    LIGHT,
    DARK,
}
