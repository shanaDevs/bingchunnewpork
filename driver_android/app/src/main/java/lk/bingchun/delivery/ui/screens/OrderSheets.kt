package lk.bingchun.delivery.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.bingchun.delivery.data.model.DeliveryOutcome
import lk.bingchun.delivery.ui.components.BcButton
import lk.bingchun.delivery.ui.components.BcOutlineButton
import lk.bingchun.delivery.ui.components.BcPinBoxes
import lk.bingchun.delivery.ui.theme.LocalBcColors

private const val NOTE_MAX = 250
private const val COMPLAINT_DESC_MIN = 5
private const val COMPLAINT_DESC_MAX = 1000

enum class ComplaintCategory(val label: String) {
    CUSTOMER_ISSUE("Customer issue"),
    WRONG_ADDRESS("Wrong address"),
    PAYMENT_ISSUE("Payment issue"),
    DAMAGED_ITEMS("Damaged or missing items"),
    OTHER("Other"),
}

/** Driver complaint form — category + description before POST /delivery/me/complaints. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ComplaintSheet(
    submitting: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSubmit: (String, String) -> Unit,
) {
    val colors = LocalBcColors.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var selected by remember { mutableStateOf(ComplaintCategory.entries.first()) }
    var description by remember { mutableStateOf("") }

    val descReady = description.trim().length >= COMPLAINT_DESC_MIN

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = colors.navyCard) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text("Raise complaint", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = colors.text)
            Text(
                "Describe the issue. Your branch admin will review it.",
                color = colors.textMuted,
                fontSize = 13.sp,
            )
            ComplaintCategory.entries.forEach { category ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectable(selected = selected == category, onClick = { selected = category })
                        .padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = selected == category, onClick = { selected = category })
                    Text(category.label, color = colors.text, fontSize = 14.sp)
                }
            }
            OutlinedTextField(
                value = description,
                onValueChange = { if (it.length <= COMPLAINT_DESC_MAX) description = it },
                label = { Text("What happened?", color = colors.textMuted) },
                minLines = 3,
                maxLines = 6,
                isError = description.isNotBlank() && !descReady,
                modifier = Modifier.fillMaxWidth(),
                colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = colors.navyLight,
                    unfocusedContainerColor = colors.navyLight,
                    errorContainerColor = colors.navyLight,
                    focusedBorderColor = colors.brand,
                    unfocusedBorderColor = colors.navyBorder,
                    focusedTextColor = colors.text,
                    unfocusedTextColor = colors.text,
                    cursorColor = colors.brand,
                ),
            )
            Text(
                "${description.trim().length}/$COMPLAINT_DESC_MAX (min $COMPLAINT_DESC_MIN)",
                color = if (description.isNotBlank() && !descReady) colors.errorSoft else colors.textMuted,
                fontSize = 12.sp,
                textAlign = TextAlign.End,
                modifier = Modifier.fillMaxWidth(),
            )
            error?.let {
                Text(it, color = colors.errorSoft, fontSize = 13.sp)
            }
            BcButton(
                label = "Submit complaint",
                loading = submitting,
                enabled = descReady,
                onClick = {
                    if (!descReady) return@BcButton
                    onSubmit(selected.label, description.trim())
                },
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

/** Delivery-failure reason picker — mirrors the failure reasons on order_detail_screen.dart. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FailureSheet(
    submitting: Boolean,
    error: String? = null,
    onDismiss: () -> Unit,
    onSubmit: (DeliveryOutcome, String) -> Unit,
) {
    val colors = LocalBcColors.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var selected by remember { mutableStateOf(DeliveryOutcome.entries.first()) }
    var customNote by remember { mutableStateOf("") }

    val needsNote = selected == DeliveryOutcome.OTHER
    val noteReady = !needsNote || customNote.isNotBlank()

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState, containerColor = colors.navyCard) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Text("Report delivery failure", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = colors.text)
            Text(
                if (selected == DeliveryOutcome.OTHER)
                    "Driver error — remaining stops stay on this ride."
                else
                    "Customer not available — later stops can be reassigned.",
                color = colors.textMuted,
                fontSize = 13.sp,
            )
            DeliveryOutcome.entries.forEach { outcome ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectable(selected = selected == outcome, onClick = { selected = outcome })
                        .padding(vertical = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = selected == outcome, onClick = { selected = outcome })
                    Text(outcome.label, color = colors.text, fontSize = 14.sp)
                }
            }

            if (needsNote) {
                OutlinedTextField(
                    value = customNote,
                    onValueChange = { if (it.length <= NOTE_MAX) customNote = it },
                    label = { Text("What happened?", color = colors.textMuted) },
                    minLines = 2,
                    maxLines = 4,
                    isError = customNote.isBlank(),
                    modifier = Modifier.fillMaxWidth(),
                    colors = androidx.compose.material3.OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = colors.navyLight,
                        unfocusedContainerColor = colors.navyLight,
                        errorContainerColor = colors.navyLight,
                        focusedBorderColor = colors.brand,
                        unfocusedBorderColor = colors.navyBorder,
                        focusedTextColor = colors.text,
                        unfocusedTextColor = colors.text,
                        cursorColor = colors.brand,
                    ),
                )
                Text(
                    "${customNote.length}/$NOTE_MAX",
                    color = if (customNote.isBlank()) colors.errorSoft else colors.textMuted,
                    fontSize = 12.sp,
                    textAlign = TextAlign.End,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            error?.let {
                Text(it, color = colors.errorSoft, fontSize = 13.sp)
            }

            BcButton(
                label = "Submit failure",
                loading = submitting,
                enabled = noteReady,
                onClick = {
                    if (!noteReady) return@BcButton
                    onSubmit(selected, customNote.trim().ifBlank { selected.label })
                },
                modifier = Modifier.padding(top = 8.dp),
            )
        }
    }
}

private const val OTP_LENGTH = 6

/** 6-digit delivery code modal — opened from Mark delivered, closed after a successful confirm. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeliveryVerifySheet(
    customerName: String,
    submitting: Boolean,
    sendingCode: Boolean,
    codeSent: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onResend: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    val colors = LocalBcColors.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var otp by remember { mutableStateOf("") }
    val codeComplete = otp.length == OTP_LENGTH

    ModalBottomSheet(
        onDismissRequest = { if (!submitting) onDismiss() },
        sheetState = sheetState,
        containerColor = colors.card,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .padding(horizontal = 20.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Delivery verification", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = colors.text)
            Text(
                "Ask $customerName for their 6-digit delivery code.",
                color = colors.textMuted,
                fontSize = 13.sp,
                lineHeight = 18.sp,
            )
            BcPinBoxes(
                value = otp,
                onValueChange = { otp = it },
                length = OTP_LENGTH,
                isError = error != null,
            )
            Text(
                error ?: "${otp.length} of $OTP_LENGTH digits entered.",
                color = if (error != null) colors.errorSoft else colors.textMuted,
                fontSize = 12.sp,
            )
            BcOutlineButton(
                label = if (sendingCode) "Sending…" else "Send code to customer",
                icon = null,
                loading = sendingCode,
                modifier = Modifier.fillMaxWidth(),
                onClick = onResend,
            )
            if (codeSent && error == null) {
                Text(
                    "A new code was sent to $customerName.",
                    color = colors.success,
                    fontSize = 12.sp,
                )
            }
            BcButton(
                label = "Mark delivered",
                loading = submitting,
                enabled = codeComplete,
                onClick = {
                    if (!codeComplete) return@BcButton
                    onConfirm(otp)
                },
            )
        }
    }
}
