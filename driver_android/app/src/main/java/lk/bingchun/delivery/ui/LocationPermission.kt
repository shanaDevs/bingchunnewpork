package lk.bingchun.delivery.ui

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.platform.LocalContext
import lk.bingchun.delivery.BingChunApp

/**
 * Requests ACCESS_FINE_LOCATION once when [request] flips true.
 * Calls [onResult] with whether permission was granted.
 */
@Composable
fun RequestLocationPermission(
    request: Boolean,
    onResult: (Boolean) -> Unit,
) {
    val context = LocalContext.current
    val tracker = (context.applicationContext as BingChunApp).container.locationTracker
    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        val granted = result[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            result[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        onResult(granted)
    }

    LaunchedEffect(request) {
        if (!request) return@LaunchedEffect
        if (tracker.hasPermission()) {
            onResult(true)
        } else {
            launcher.launch(
                arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION,
                ),
            )
        }
    }
}
