package lk.bingchun.delivery.core

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.HapticFeedbackConstants
import android.view.View
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView

enum class BcHapticKind {
    TICK,
    CONFIRM,
    REJECT,
}

class BcHaptics(private val context: Context) {
    private val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val mgr = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
        mgr?.defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
    }

    fun perform(kind: BcHapticKind, view: View? = null) {
        if (!RuntimeConfig.hapticsEnabled) return
        try {
            if (view != null) {
                val flag = when (kind) {
                    BcHapticKind.TICK -> HapticFeedbackConstants.KEYBOARD_TAP
                    BcHapticKind.CONFIRM -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            HapticFeedbackConstants.CONFIRM
                        } else {
                            HapticFeedbackConstants.KEYBOARD_TAP
                        }
                    }
                    BcHapticKind.REJECT -> {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                            HapticFeedbackConstants.REJECT
                        } else {
                            HapticFeedbackConstants.LONG_PRESS
                        }
                    }
                }
                view.performHapticFeedback(flag)
                return
            }
            val vib = vibrator ?: return
            if (!vib.hasVibrator()) return
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val effect = when (kind) {
                    BcHapticKind.TICK -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK)
                    BcHapticKind.CONFIRM -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
                    BcHapticKind.REJECT -> VibrationEffect.createPredefined(VibrationEffect.EFFECT_DOUBLE_CLICK)
                }
                vib.vibrate(effect)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vib.vibrate(VibrationEffect.createOneShot(20, VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vib.vibrate(20)
            }
        } catch (_: Exception) {
        }
    }
}

/** Unified tap / success / error feedback (sound + haptic). */
class BcFeedback(
    private val sound: BcSound?,
    private val haptics: BcHaptics?,
    private val view: View?,
) {
    fun tap() {
        haptics?.perform(BcHapticKind.TICK, view)
        sound?.play(BcSoundEvent.TAP)
    }

    fun success() {
        haptics?.perform(BcHapticKind.CONFIRM, view)
        sound?.play(BcSoundEvent.SUCCESS)
    }

    fun error() {
        haptics?.perform(BcHapticKind.REJECT, view)
        sound?.play(BcSoundEvent.ERROR)
    }

    fun completed() {
        haptics?.perform(BcHapticKind.CONFIRM, view)
        sound?.play(BcSoundEvent.COMPLETED)
    }

    fun refresh() {
        haptics?.perform(BcHapticKind.TICK, view)
        sound?.play(BcSoundEvent.REFRESH)
    }

    fun newJob() {
        haptics?.perform(BcHapticKind.CONFIRM, view)
        sound?.play(BcSoundEvent.NEW_JOB)
    }

    fun notification() {
        sound?.play(BcSoundEvent.NOTIFICATION)
    }

    companion object {
        val NoOp = BcFeedback(null, null, null)
    }
}

val LocalBcFeedback = staticCompositionLocalOf { BcFeedback.NoOp }

@Composable
fun rememberBcFeedback(): BcFeedback {
    val context = LocalContext.current
    val view = LocalView.current
    return remember(context, view) {
        BcFeedback(
            sound = BcSound(context.applicationContext),
            haptics = BcHaptics(context.applicationContext),
            view = view,
        )
    }
}
