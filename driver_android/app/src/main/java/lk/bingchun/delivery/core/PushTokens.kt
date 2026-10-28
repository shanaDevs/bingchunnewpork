package lk.bingchun.delivery.core

import android.annotation.SuppressLint
import android.content.Context
import android.provider.Settings
import android.util.Log
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import lk.bingchun.delivery.data.network.FcmTokenDeleteRequest
import lk.bingchun.delivery.data.network.FcmTokenRequest

/**
 * Registers/clears the device's FCM token with the core backend so new-job
 * pushes reach this driver. Every entry point is a silent no-op when Firebase
 * is not configured (no google-services.json in the build).
 */
object PushTokens {

    private const val TAG = "PushTokens"
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    fun isFirebaseAvailable(context: Context): Boolean =
        FirebaseApp.getApps(context).isNotEmpty()

    /** Fetch the current token and send it to the backend (after login / app start). */
    fun register(container: AppContainer) {
        if (!isFirebaseAvailable(container.appContext)) return
        if (container.secureStore.token == null) return
        try {
            FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token -> sendToken(container, token) }
                .addOnFailureListener { e -> Log.w(TAG, "FCM token fetch failed", e) }
        } catch (e: Exception) {
            Log.w(TAG, "FCM unavailable", e)
        }
    }

    /** Push a (possibly rotated) token to the backend. Used by onNewToken too. */
    fun sendToken(container: AppContainer, token: String) {
        if (container.secureStore.token == null) return
        scope.launch {
            try {
                container.apiClients.core.registerFcmToken(
                    FcmTokenRequest(token = token, deviceId = deviceId(container.appContext)),
                )
                Log.d(TAG, "FCM token registered")
            } catch (e: Exception) {
                Log.w(TAG, "FCM token registration failed: ${e.message}")
            }
        }
    }

    /**
     * Best-effort clear on logout. Must run while the session token is still
     * valid, so callers invoke it before wiping the local session.
     */
    suspend fun unregister(container: AppContainer) {
        if (!isFirebaseAvailable(container.appContext)) return
        if (container.secureStore.token == null) return
        try {
            container.apiClients.core.unregisterFcmToken(
                FcmTokenDeleteRequest(deviceId = deviceId(container.appContext)),
            )
        } catch (e: Exception) {
            Log.w(TAG, "FCM token unregister failed: ${e.message}")
        }
    }

    @SuppressLint("HardwareIds")
    private fun deviceId(context: Context): String? =
        Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
}
