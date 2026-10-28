package lk.bingchun.delivery.core

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast

/** The one contextual action shown on the in-app navigation screen, based on why it was opened. */
sealed class NavPrimaryAction {
    data class ConfirmPickup(
        val enabled: Boolean,
        val loading: Boolean,
        val geofenceHint: String? = null,
        val onConfirm: () -> Unit,
    ) : NavPrimaryAction()
    data class CompleteRide(val enabled: Boolean, val loading: Boolean, val onComplete: () -> Unit) : NavPrimaryAction()
    data class CustomerStop(
        val callEnabled: Boolean,
        val onCall: () -> Unit,
        val onOpenOrder: (() -> Unit)? = null,
    ) : NavPrimaryAction()
}

/**
 * What a pending [NavTarget] is for — kept separate from [NavPrimaryAction] itself so the
 * screen can rebuild the action from *current* state (loading/enabled flags) on every
 * recomposition instead of freezing a stale snapshot from when navigation was opened.
 */
sealed class NavTargetKind {
    object Pickup : NavTargetKind()
    object Return : NavTargetKind()
    data class CustomerStop(val orderId: String) : NavTargetKind()
}

/** A pending in-app navigation request: destination coordinates + a display label. */
data class NavTarget(
    val lat: Double,
    val lng: Double,
    val label: String,
    val kind: NavTargetKind? = null,
)

/** Dialer / maps intents — port of the url_launcher calls in order_detail_screen.dart. */
object Intents {

    fun dial(context: Context, phone: String) {
        val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${phone.trim()}"))
        launch(context, intent, "No dialer app found")
    }

    private const val GOOGLE_MAPS_PACKAGE = "com.google.android.apps.maps"

    /** Opens turn-by-turn navigation in Google Maps specifically; falls back to the Google Maps web URL. */
    fun navigateTo(context: Context, lat: Double, lng: Double, label: String? = null) {
        val navIntent = Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=$lat,$lng"))
            .setPackage(GOOGLE_MAPS_PACKAGE)
        if (navIntent.resolveActivity(context.packageManager) != null) {
            context.startActivity(navIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return
        }
        val web = Intent(
            Intent.ACTION_VIEW,
            Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lng"),
        )
        launch(context, web, "No maps app found")
    }

    private fun launch(context: Context, intent: Intent, error: String) {
        try {
            context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        } catch (_: Exception) {
            Toast.makeText(context, error, Toast.LENGTH_SHORT).show()
        }
    }
}
