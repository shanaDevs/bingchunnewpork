package lk.bingchun.bing_chun_driver

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Outline
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.provider.Settings
import android.util.TypedValue
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import kotlin.math.abs
import kotlin.math.hypot

/**
 * Floating "quick action" bubble (the app logo) drawn over other apps while Bing Chun is
 * in the background: minimized, behind Google Maps, or swiped out of Recents while the
 * on-duty service keeps the process alive.
 *
 * - Tap: brings the app back to the front.
 * - Drag: move it anywhere; on release it snaps to the nearest left / right edge, and that
 *   position is remembered.
 * - Drag onto the ✕ target at the bottom: hides it until the app is left again.
 *
 * Needs "Display over other apps" (SYSTEM_ALERT_WINDOW). Shown only when the rider turned
 * it on (Me → Job Alerts & Reliability) and is signed in; MainActivity shows it in onStop
 * and hides it in onStart.
 */
object QuickBubble {

    private const val PREFS = "bc_quick_bubble"
    // "_v2": on by default — older builds may have saved "off" under the previous key.
    private const val KEY_ENABLED = "enabled_v2"
    private const val KEY_SIGNED_IN = "signedIn"
    private const val KEY_RIGHT = "right"
    private const val KEY_Y = "y"

    private const val BUBBLE_DP = 58f
    private const val EDGE_MARGIN_DP = 6f
    private const val CLOSE_DP = 64f
    private const val CLOSE_BOTTOM_DP = 72f
    private const val CLOSE_HIT_DP = 90f

    private var bubble: View? = null
    private var bubbleParams: WindowManager.LayoutParams? = null
    private var closeTarget: View? = null
    private var snapAnimator: ValueAnimator? = null

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun canDrawOverlays(ctx: Context) = Settings.canDrawOverlays(ctx)

    fun isEnabled(ctx: Context) = prefs(ctx).getBoolean(KEY_ENABLED, true)

    fun setEnabled(ctx: Context, on: Boolean) {
        prefs(ctx).edit().putBoolean(KEY_ENABLED, on).apply()
        if (!on) hide(ctx)
    }

    /** Flutter reports sign-in / sign-out; the bubble is never shown on the login screen. */
    fun setSignedIn(ctx: Context, signedIn: Boolean) {
        prefs(ctx).edit().putBoolean(KEY_SIGNED_IN, signedIn).apply()
        if (!signedIn) hide(ctx)
    }

    private fun shouldShow(ctx: Context): Boolean {
        val p = prefs(ctx)
        return p.getBoolean(KEY_ENABLED, true) && p.getBoolean(KEY_SIGNED_IN, false) && canDrawOverlays(ctx)
    }

    // ---------------------------------------------------------------- show / hide

    fun show(context: Context) {
        val ctx = context.applicationContext
        if (bubble != null || !shouldShow(ctx)) return
        val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val size = dp(ctx, BUBBLE_DP)
        val (screenW, screenH) = screenSize(ctx)
        val p = prefs(ctx)
        val onRight = p.getBoolean(KEY_RIGHT, true)
        val savedY = p.getInt(KEY_Y, (screenH * 0.35f).toInt())

        val params = WindowManager.LayoutParams(
            size,
            size,
            overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = edgeX(ctx, onRight, screenW)
            y = clampY(ctx, savedY, screenH)
        }

        // Added first (hidden) so the bubble is always drawn above it.
        addCloseTarget(ctx, wm)
        val view = buildBubbleView(ctx, size)
        attachTouch(ctx, wm, view, params)
        try {
            wm.addView(view, params)
        } catch (_: Exception) {
            removeCloseTarget(wm)
            return // permission revoked between the check and now
        }
        bubble = view
        bubbleParams = params
        view.scaleX = 0f
        view.scaleY = 0f
        view.animate().scaleX(1f).scaleY(1f).setDuration(220).setInterpolator(OvershootInterpolator()).start()
    }

    fun hide(context: Context) {
        val ctx = context.applicationContext
        val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        snapAnimator?.cancel()
        snapAnimator = null
        removeCloseTarget(wm)
        bubble?.let { runCatching { wm.removeView(it) } }
        bubble = null
        bubbleParams = null
    }

    // ---------------------------------------------------------------- views

    private fun buildBubbleView(ctx: Context, size: Int): View {
        val ring = dp(ctx, 2.5f)
        val frame = FrameLayout(ctx).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.WHITE)
            }
            elevation = dp(ctx, 6f).toFloat()
            outlineProvider = ViewOutlineProvider.BACKGROUND
            setPadding(ring, ring, ring, ring)
            contentDescription = "Open Bring It"
        }
        val logo = ImageView(ctx).apply {
            setImageResource(R.drawable.quick_bubble_logo)
            scaleType = ImageView.ScaleType.CENTER_CROP
            outlineProvider = object : ViewOutlineProvider() {
                override fun getOutline(view: View, outline: Outline) = outline.setOval(0, 0, view.width, view.height)
            }
            clipToOutline = true
        }
        frame.addView(logo, FrameLayout.LayoutParams(size - 2 * ring, size - 2 * ring))
        return frame
    }

    private fun addCloseTarget(ctx: Context, wm: WindowManager) {
        if (closeTarget != null) return
        val size = dp(ctx, CLOSE_DP)
        val view = TextView(ctx).apply {
            text = "✕"
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 24f)
            gravity = Gravity.CENTER
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.argb(200, 30, 30, 30))
                setStroke(dp(ctx, 2f), Color.argb(180, 255, 255, 255))
            }
            alpha = 0f
        }
        val params = WindowManager.LayoutParams(
            size,
            size,
            overlayType(),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            y = dp(ctx, CLOSE_BOTTOM_DP)
        }
        try {
            wm.addView(view, params)
            closeTarget = view
        } catch (_: Exception) {
        }
    }

    private fun setCloseTargetVisible(visible: Boolean) {
        closeTarget?.animate()?.alpha(if (visible) 1f else 0f)?.scaleX(1f)?.scaleY(1f)?.setDuration(150)?.start()
    }

    private fun removeCloseTarget(wm: WindowManager) {
        closeTarget?.let { runCatching { wm.removeView(it) } }
        closeTarget = null
    }

    /** Bubble centre is within reach of the ✕ target. */
    private fun overCloseTarget(ctx: Context, params: WindowManager.LayoutParams): Boolean {
        val (screenW, screenH) = screenSize(ctx)
        val half = dp(ctx, BUBBLE_DP) / 2f
        val cx = params.x + half
        val cy = params.y + half
        val tx = screenW / 2f
        val ty = screenH - dp(ctx, CLOSE_BOTTOM_DP) - dp(ctx, CLOSE_DP) / 2f
        return hypot(cx - tx, cy - ty) < dp(ctx, CLOSE_HIT_DP)
    }

    // ---------------------------------------------------------------- touch

    @SuppressLint("ClickableViewAccessibility")
    private fun attachTouch(ctx: Context, wm: WindowManager, view: View, params: WindowManager.LayoutParams) {
        val slop = ViewConfiguration.get(ctx).scaledTouchSlop
        var downRawX = 0f
        var downRawY = 0f
        var startX = 0
        var startY = 0
        var dragging = false
        var overClose = false

        view.setOnTouchListener { v, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    snapAnimator?.cancel()
                    downRawX = e.rawX
                    downRawY = e.rawY
                    startX = params.x
                    startY = params.y
                    dragging = false
                    overClose = false
                    v.animate().scaleX(0.92f).scaleY(0.92f).setDuration(90).start()
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downRawX
                    val dy = e.rawY - downRawY
                    if (!dragging && (abs(dx) > slop || abs(dy) > slop)) {
                        dragging = true
                        v.animate().scaleX(1f).scaleY(1f).setDuration(90).start()
                        setCloseTargetVisible(true)
                    }
                    if (dragging) {
                        val (screenW, screenH) = screenSize(ctx)
                        val size = dp(ctx, BUBBLE_DP)
                        params.x = (startX + dx).toInt().coerceIn(0, screenW - size)
                        params.y = (startY + dy).toInt().coerceIn(0, screenH - size)
                        runCatching { wm.updateViewLayout(v, params) }
                        val now = overCloseTarget(ctx, params)
                        if (now != overClose) {
                            overClose = now
                            closeTarget?.animate()?.scaleX(if (now) 1.25f else 1f)?.scaleY(if (now) 1.25f else 1f)
                                ?.setDuration(120)?.start()
                            if (now) v.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS)
                        }
                    }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.animate().scaleX(1f).scaleY(1f).setDuration(90).start()
                    setCloseTargetVisible(false)
                    when {
                        dragging && overClose -> hide(ctx)
                        dragging -> snapToEdge(ctx, wm, v, params)
                        e.actionMasked == MotionEvent.ACTION_UP -> {
                            v.performClick()
                            openApp(ctx)
                        }
                    }
                    true
                }
                else -> false
            }
        }
    }

    private fun snapToEdge(ctx: Context, wm: WindowManager, view: View, params: WindowManager.LayoutParams) {
        val (screenW, screenH) = screenSize(ctx)
        val size = dp(ctx, BUBBLE_DP)
        val onRight = params.x + size / 2 > screenW / 2
        val fromX = params.x
        val toX = edgeX(ctx, onRight, screenW)
        val fromY = params.y
        val toY = clampY(ctx, params.y, screenH)
        prefs(ctx).edit().putBoolean(KEY_RIGHT, onRight).putInt(KEY_Y, toY).apply()
        snapAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 260
            interpolator = DecelerateInterpolator()
            addUpdateListener {
                val t = it.animatedValue as Float
                params.x = (fromX + (toX - fromX) * t).toInt()
                params.y = (fromY + (toY - fromY) * t).toInt()
                if (view.isAttachedToWindow) runCatching { wm.updateViewLayout(view, params) }
            }
            start()
        }
    }

    private fun openApp(ctx: Context) {
        val intent = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
            ?: Intent(ctx, MainActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
        try {
            ctx.startActivity(intent)
        } catch (_: Exception) {
        }
        hide(ctx)
    }

    // ---------------------------------------------------------------- geometry

    private fun overlayType(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }

    private fun edgeX(ctx: Context, onRight: Boolean, screenW: Int): Int {
        val margin = dp(ctx, EDGE_MARGIN_DP)
        return if (onRight) screenW - dp(ctx, BUBBLE_DP) - margin else margin
    }

    /** Keeps the bubble clear of the status bar and the bottom gesture area. */
    private fun clampY(ctx: Context, y: Int, screenH: Int): Int {
        val top = dp(ctx, 40f)
        val bottom = screenH - dp(ctx, BUBBLE_DP) - dp(ctx, 56f)
        return y.coerceIn(top, maxOf(top, bottom))
    }

    private fun screenSize(ctx: Context): Pair<Int, Int> {
        val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val b = wm.currentWindowMetrics.bounds
            b.width() to b.height()
        } else {
            val dm = ctx.resources.displayMetrics
            dm.widthPixels to dm.heightPixels
        }
    }

    private fun dp(ctx: Context, v: Float): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, ctx.resources.displayMetrics).toInt()
}
