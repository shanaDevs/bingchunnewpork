package lk.bingchun.bing_chun_driver

import android.app.KeyguardManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import androidx.core.content.ContextCompat
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Hosts the Flutter UI. The `lk.bingchun.delivery/system` channel opens the system
 * settings screens that Flutter plugins don't cover (see lib/core/system_settings.dart).
 *
 * Lock screen: the activity is NOT shown over the keyguard by default. Only a new-ride
 * full-screen notification (or a tap on it) turns that on, and Flutter turns it back off
 * via `releaseLockScreen` as soon as no ride is ringing any more, so the rest of the
 * app (customer phones, addresses, history) always needs the device unlocked.
 *
 * While locked, the app is hidden under an opaque [cover] unless Flutter has confirmed the
 * incoming-ride card is drawn (`rideCardShown`). A notification that opens the app before
 * the card is ready — or when no ride ends up ringing — therefore shows only the cover,
 * never the jobs list. The cover comes off once the device is unlocked.
 */
class MainActivity : FlutterFragmentActivity() {

    private var shownOverLockScreen = false

    /** Flutter has the incoming-ride card on screen (`rideCardShown` until `rideCardHidden`). */
    private var rideCardUp = false
    private var cover: View? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        val fromNotification = intent?.action == NOTIFICATION_LAUNCH_ACTION
        if (fromNotification) setShownOverLockScreen(true)
        super.onCreate(savedInstanceState)
        if (fromNotification) coverIfLocked()
    }

    override fun onNewIntent(intent: Intent) {
        if (intent.action == NOTIFICATION_LAUNCH_ACTION) {
            setShownOverLockScreen(true)
            coverIfLocked()
        }
        super.onNewIntent(intent)
    }

    // Quick-action bubble: shown over other apps whenever the app leaves the screen
    // (home, recents, Google Maps, swiped away while on duty) and hidden when it's back.
    override fun onStart() {
        super.onStart()
        QuickBubble.hide(this)
    }

    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations) QuickBubble.show(this)
    }

    // No release in onStop: the screen turning off right after the full-screen alert (the
    // rider locking the phone) stops the activity, and releasing there hid the ringing ride
    // for good — the full-screen intent only fires once. Flutter releases when no ride rings.

    // Resumed while locked means we are on screen over the lock screen (e.g. the rider locked
    // the phone while a ride rang): cover until the card is drawn. Unlocked: show the app.
    override fun onResume() {
        super.onResume()
        if (isLocked()) coverIfLocked() else uncover()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && !isLocked()) uncover()
    }

    private fun isLocked() = (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked

    /** Hides the app over the lock screen until the ride card is confirmed (or the phone unlocks). */
    private fun coverIfLocked() {
        if (rideCardUp || cover != null || !isLocked()) return
        val view = View(this).apply {
            background = ContextCompat.getDrawable(this@MainActivity, R.drawable.launch_background)
            isClickable = true // swallow touches meant for the app underneath
        }
        addContentView(view, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        cover = view
    }

    private fun uncover() {
        val view = cover ?: return
        (view.parent as? ViewGroup)?.removeView(view)
        cover = null
    }

    private fun setShownOverLockScreen(on: Boolean) {
        if (shownOverLockScreen == on) return
        shownOverLockScreen = on
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(on)
            setTurnScreenOn(on)
        } else {
            @Suppress("DEPRECATION")
            val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            if (on) window.addFlags(flags) else window.clearFlags(flags)
        }
    }

    /** Shows the unlock prompt; true once the device is unlocked (or wasn't locked). */
    private fun requestUnlock(done: (Boolean) -> Unit) {
        val km = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
        if (!km.isKeyguardLocked) return done(true)
        km.requestDismissKeyguard(
            this,
            object : KeyguardManager.KeyguardDismissCallback() {
                override fun onDismissSucceeded() = done(true)
                override fun onDismissCancelled() = done(false)
                override fun onDismissError() = done(false)
            },
        )
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "isDeviceLocked" -> result.success(
                    (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked,
                )
                "allowLockScreen" -> {
                    setShownOverLockScreen(true)
                    result.success(true)
                }
                "releaseLockScreen" -> {
                    // Cover first, so the frames before the window hides never show the app.
                    coverIfLocked()
                    setShownOverLockScreen(false)
                    result.success(true)
                }
                // The ride card itself reports when it is drawn / gone.
                "rideCardShown" -> {
                    rideCardUp = true
                    uncover()
                    result.success(true)
                }
                "rideCardHidden" -> {
                    rideCardUp = false
                    coverIfLocked()
                    result.success(true)
                }
                "requestUnlock" -> requestUnlock { result.success(it) }
                "openWirelessSettings" -> result.success(launch(Intent(Settings.ACTION_WIRELESS_SETTINGS)))
                "openNotificationSettings" -> result.success(
                    launch(
                        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                            .putExtra(Settings.EXTRA_APP_PACKAGE, packageName),
                    ) || launch(appDetails()),
                )
                "canUseFullScreenIntent" -> result.success(canUseFullScreenIntent())
                "openFullScreenIntentSettings" -> result.success(
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        launch(
                            Intent(
                                Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                                Uri.parse("package:$packageName"),
                            ),
                        ) || launch(appDetails())
                    } else {
                        launch(appDetails())
                    },
                )
                // Checked here, not via permission_handler: that plugin reports "denied" when
                // REQUEST_IGNORE_BATTERY_OPTIMIZATIONS isn't in the manifest (it's left out for Play).
                "isIgnoringBatteryOptimizations" -> result.success(
                    (getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName),
                )
                "openBatteryOptimizationSettings" -> result.success(
                    launch(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)),
                )
                "quickBubbleStatus" -> result.success(
                    mapOf(
                        "enabled" to QuickBubble.isEnabled(this),
                        "permitted" to QuickBubble.canDrawOverlays(this),
                    ),
                )
                "setQuickBubbleEnabled" -> {
                    QuickBubble.setEnabled(this, call.arguments as? Boolean ?: true)
                    result.success(true)
                }
                "setQuickBubbleSignedIn" -> {
                    QuickBubble.setSignedIn(this, call.arguments as? Boolean ?: false)
                    result.success(true)
                }
                "openOverlaySettings" -> result.success(
                    launch(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))) ||
                        launch(appDetails()),
                )
                else -> result.notImplemented()
            }
        }
    }

    private fun canUseFullScreenIntent(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        return nm.canUseFullScreenIntent()
    }

    private fun appDetails(): Intent =
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))

    private fun launch(intent: Intent): Boolean = try {
        startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (_: Exception) {
        false
    }

    private companion object {
        const val CHANNEL = "lk.bingchun.delivery/system"

        // flutter_local_notifications' content / full-screen intent action. Its action
        // buttons (Accept) use a different action, and Android unlocks before those.
        const val NOTIFICATION_LAUNCH_ACTION = "SELECT_NOTIFICATION"
    }
}
