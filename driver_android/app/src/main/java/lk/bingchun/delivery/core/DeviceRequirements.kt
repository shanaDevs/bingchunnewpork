package lk.bingchun.delivery.core

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.location.LocationManager
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import androidx.core.content.ContextCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Live GPS + internet requirements for the rider app.
 *
 * The app must lock when GPS is off, location permission is denied, or there is
 * no validated internet (mobile data / Wi‑Fi).
 */
data class DeviceRequirementState(
    val gpsOn: Boolean = false,
    val internetOn: Boolean = false,
    val locationPermission: Boolean = false,
) {
    /** True when the rider may use the app. */
    val isSatisfied: Boolean
        get() = gpsOn && internetOn && locationPermission

    val needsGps: Boolean get() = !gpsOn || !locationPermission
    val needsInternet: Boolean get() = !internetOn
}

class DeviceRequirements(context: Context) {
    private val appContext = context.applicationContext

    private val _state = MutableStateFlow(readState())
    val state: StateFlow<DeviceRequirementState> = _state.asStateFlow()

    private var started = false

    private val locationReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            refresh()
        }
    }

    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) = refresh()
        override fun onLost(network: Network) = refresh()
        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) = refresh()
        override fun onUnavailable() = refresh()
    }

    /** Begin listening for GPS / connectivity changes. Safe to call more than once. */
    fun start() {
        if (started) {
            refresh()
            return
        }
        started = true

        val filter = IntentFilter().apply {
            addAction(LocationManager.PROVIDERS_CHANGED_ACTION)
            addAction(LocationManager.MODE_CHANGED_ACTION)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            appContext.registerReceiver(locationReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            appContext.registerReceiver(locationReceiver, filter)
        }

        val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        try {
            cm.registerNetworkCallback(request, networkCallback)
        } catch (_: Exception) {
            // Some OEMs throw if called too early — refresh() still polls.
        }

        refresh()
    }

    fun stop() {
        if (!started) return
        started = false
        runCatching { appContext.unregisterReceiver(locationReceiver) }
        val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        runCatching { cm.unregisterNetworkCallback(networkCallback) }
    }

    /** Re-read GPS, permission, and internet. Call on resume as a safety net. */
    fun refresh() {
        _state.value = readState()
    }

    private fun readState(): DeviceRequirementState = DeviceRequirementState(
        gpsOn = isGpsProviderEnabled(),
        internetOn = isInternetValidated(),
        locationPermission = hasLocationPermission(),
    )

    private fun hasLocationPermission(): Boolean =
        ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACCESS_FINE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(appContext, Manifest.permission.ACCESS_COARSE_LOCATION) ==
            PackageManager.PERMISSION_GRANTED

    /** System location switch is on (GPS or network). Huawei uses a single toggle. */
    private fun isGpsProviderEnabled(): Boolean {
        val lm = appContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
        return systemLocationEnabled(lm)
    }

    private fun isInternetValidated(): Boolean {
        val cm = appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        return try {
            val network = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(network) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } catch (_: Exception) {
            false
        }
    }
}

/** True when the system location switch is on (GPS or network). */
internal fun systemLocationEnabled(lm: LocationManager): Boolean = try {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        lm.isLocationEnabled
    } else {
        lm.isProviderEnabled(LocationManager.GPS_PROVIDER) ||
            lm.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }
} catch (_: Exception) {
    false
}
