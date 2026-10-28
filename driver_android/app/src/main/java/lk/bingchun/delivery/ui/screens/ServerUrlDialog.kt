package lk.bingchun.delivery.ui.screens

import android.widget.Toast
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import lk.bingchun.delivery.BingChunApp
import lk.bingchun.delivery.BuildConfig
import lk.bingchun.delivery.core.AppConfig
import lk.bingchun.delivery.ui.components.BcButton
import lk.bingchun.delivery.ui.components.BcOutlineButton
import lk.bingchun.delivery.ui.components.BcTextButton
import lk.bingchun.delivery.ui.components.BcTextField
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

/**
 * Hidden developer dialog — opened after tapping the login logo 5 times.
 * Lets you point the app at a different LAN / staging host without rebuilding.
 */
@Composable
fun ServerUrlDialog(onDismiss: () -> Unit) {
    val colors = LocalBcColors.current
    val context = LocalContext.current
    val container = (context.applicationContext as BingChunApp).container

    var coreUrl by remember { mutableStateOf(AppConfig.coreApiBaseUrl.trimEnd('/')) }
    var deliveryUrl by remember { mutableStateOf(AppConfig.deliveryApiBaseUrl.trimEnd('/')) }
    var storeId by remember { mutableStateOf(AppConfig.storeId.orEmpty()) }
    var error by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = colors.card,
        title = {
            Text("Server URLs", style = BcType.subtitle, color = colors.text)
        },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text(
                    "Point this debug build at your PC. USB uses 127.0.0.1 through adb reverse. Wi‑Fi only works on the same network.",
                    style = BcType.caption,
                    color = colors.textMuted,
                )
                BcTextField(value = coreUrl, onValueChange = { coreUrl = it; error = null }, label = "Core API")
                BcTextField(value = deliveryUrl, onValueChange = { deliveryUrl = it; error = null }, label = "Delivery API")
                BcTextField(value = storeId, onValueChange = { storeId = it }, label = "Store ID (optional)")
                error?.let {
                    Text(it, style = BcType.caption, color = colors.danger)
                }
                BcOutlineButton(
                    label = "Fill USB (127.0.0.1)",
                    onClick = {
                        coreUrl = USB_CORE
                        deliveryUrl = USB_DELIVERY
                        error = null
                    },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        },
        confirmButton = {
            BcButton(
                label = "Save",
                onClick = {
                    val core = normalizeApiUrl(coreUrl, "api")
                    val delivery = normalizeApiUrl(deliveryUrl, "delivery-api")
                    if (!looksLikeUrl(core) || !looksLikeUrl(delivery)) {
                        error = "Enter valid http(s) URLs for both APIs."
                        return@BcButton
                    }
                    container.applyServerUrls(core, delivery, storeId.trim().ifBlank { null })
                    Toast.makeText(context, "URLs saved", Toast.LENGTH_SHORT).show()
                    onDismiss()
                },
            )
        },
        dismissButton = {
            Row {
                BcTextButton(
                    label = "Reset",
                    onClick = {
                        container.resetServerUrlsToDefaults()
                        coreUrl = BuildConfig.CORE_API_BASE_URL
                        deliveryUrl = BuildConfig.DELIVERY_API_BASE_URL
                        storeId = BuildConfig.STORE_ID
                        error = null
                    },
                )
                BcTextButton(label = "Cancel", onClick = onDismiss)
            }
        },
    )
}

private const val USB_CORE = "http://127.0.0.1:4000/api"
private const val USB_DELIVERY = "http://127.0.0.1:4100/delivery-api"

private fun looksLikeUrl(value: String): Boolean =
    value.startsWith("http://") || value.startsWith("https://")

private fun normalizeApiUrl(raw: String, expectedPath: String): String {
    var value = raw.trim().trimEnd('/')
    if (expectedPath == "delivery-api" && value.endsWith("/delivery-ap")) {
        value = value.dropLast("/delivery-ap".length) + "/delivery-api"
    }
    return value
}
