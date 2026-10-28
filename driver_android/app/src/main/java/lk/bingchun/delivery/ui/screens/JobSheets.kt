package lk.bingchun.delivery.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.bingchun.delivery.R
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.ui.components.BcButton
import lk.bingchun.delivery.ui.components.BcStatTile
import lk.bingchun.delivery.ui.components.BcTextButton
import lk.bingchun.delivery.ui.components.BcTextField
import lk.bingchun.delivery.ui.theme.BcMotion
import lk.bingchun.delivery.ui.theme.BcRadius
import lk.bingchun.delivery.ui.theme.BcSpacing
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors
import lk.bingchun.delivery.ui.theme.rememberReducedMotion

private const val REJECT_NOTE_MAX = 250

private val REJECT_REASONS = listOf(
    "Too far from my area",
    "Vehicle problem",
    "Already carrying a full load",
    "Ending my shift",
    "Other",
)

/** Reason picker shown before a driver declines an assigned run. */
@Composable
fun RejectJobDialog(
    submitting: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (String) -> Unit,
) {
    val colors = LocalBcColors.current
    var selected by remember { mutableStateOf(REJECT_REASONS.first()) }
    var customNote by remember { mutableStateOf("") }

    val needsNote = selected == REJECT_REASONS.last()
    val ready = !needsNote || customNote.isNotBlank()

    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = colors.navyCard,
        title = { Text("Reject this job?", fontWeight = FontWeight.Bold, color = colors.text) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(
                    "Tell dispatch why so they can hand it to another driver. Rejecting deducts 5 merit points.",
                    color = colors.textMuted,
                    fontSize = 12.sp,
                )
                REJECT_REASONS.forEach { reason ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .selectable(selected = selected == reason, onClick = { selected = reason })
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = selected == reason, onClick = { selected = reason })
                        Text(reason, color = colors.text, fontSize = 14.sp)
                    }
                }
                if (needsNote) {
                    OutlinedTextField(
                        value = customNote,
                        onValueChange = { if (it.length <= REJECT_NOTE_MAX) customNote = it },
                        label = { Text("Reason", color = colors.textMuted) },
                        minLines = 2,
                        maxLines = 4,
                        isError = customNote.isBlank(),
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
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
                        "${customNote.length}/$REJECT_NOTE_MAX",
                        color = if (customNote.isBlank()) colors.errorSoft else colors.textMuted,
                        fontSize = 12.sp,
                        textAlign = TextAlign.End,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                enabled = ready && !submitting,
                onClick = { onSubmit(customNote.trim().ifBlank { selected }) },
            ) {
                Text(
                    if (submitting) "Rejecting…" else "Reject",
                    color = if (ready) colors.errorSoft else colors.textMuted,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel", color = colors.textMuted)
            }
        },
    )
}

/**
 * Confirmation shown before a driver claims/accepts a job so a stray tap can't grab it.
 *
 * Claiming commits the driver to a whole run, so this is deliberately a full bottom sheet
 * rather than a terse dialog: the Bing Chun mark to make it unmistakably ours, and the run's
 * numbers laid out as tiles so the decision is made on the figures, not on a joined string.
 *
 * Every stat is optional — the jobs list, job detail and the incoming-ride takeover each know
 * a different subset, and a tile is dropped rather than shown as a zero.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClaimJobSheet(
    storeName: String,
    submitting: Boolean,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    title: String = "Claim this job?",
    confirmLabel: String = "Claim job",
    subtitle: String? = null,
    fee: Int? = null,
    stopCount: Int? = null,
    distanceKm: Double? = null,
    minutes: Int? = null,
    pickupRadiusM: Int? = null,
) {
    val colors = LocalBcColors.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val reducedMotion = rememberReducedMotion()

    var appeared by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { appeared = true }
    val badgeScale by animateFloatAsState(
        targetValue = if (appeared) 1f else 0.7f,
        animationSpec = tween(
            BcMotion.durationMs(BcMotion.StandardMs, reducedMotion),
            easing = BcMotion.EaseOut,
        ),
        label = "claimBadgeScale",
    )

    val tiles = buildList {
        fee?.takeIf { it > 0 }?.let {
            val money = Format.money(it)
            // 4-up tiles clip long grouped amounts; keep the sum visible by moving Rs. to the label.
            if (money.length <= 9) add(Triple(money, "Fee", true))
            else add(Triple("%,d".format(it), "Rs.", true))
        }
        stopCount?.takeIf { it > 0 }?.let { add(Triple("$it", if (it == 1) "Stop" else "Stops", false)) }
        distanceKm?.takeIf { it > 0 }?.let { add(Triple("%.1f".format(it), "Km", false)) }
        minutes?.takeIf { it > 0 }?.let { add(Triple("$it", "Min", false)) }
    }

    ModalBottomSheet(
        onDismissRequest = { if (!submitting) onDismiss() },
        sheetState = sheetState,
        containerColor = colors.card,
        shape = BcRadius.xxlShape,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = BcSpacing.xl)
                .padding(bottom = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(BcSpacing.md),
        ) {
            Box(
                modifier = Modifier
                    .size(96.dp)
                    .graphicsLayer { scaleX = badgeScale; scaleY = badgeScale }
                    .clip(CircleShape)
                    .background(colors.brandSubtle)
                    .border(1.dp, colors.brand.copy(alpha = 0.25f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    painter = painterResource(R.drawable.logo),
                    contentDescription = "Bing Chun",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .size(72.dp)
                        .clip(BcRadius.xlShape),
                )
            }

            Text(
                title,
                style = BcType.title,
                color = colors.text,
                textAlign = TextAlign.Center,
            )

            Text(
                listOfNotNull(storeName.takeIf { it.isNotBlank() }, subtitle?.takeIf { it.isNotBlank() })
                    .joinToString(" · ")
                    .ifBlank { "Confirm you want to take this delivery run." },
                style = BcType.body,
                color = colors.textMuted,
                textAlign = TextAlign.Center,
            )

            if (tiles.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(BcSpacing.sm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    tiles.forEach { (value, label, accent) ->
                        BcStatTile(
                            value = value,
                            label = label,
                            accent = accent,
                            modifier = Modifier.weight(1f),
                        )
                    }
                }
            }

            if (pickupRadiusM != null && pickupRadiusM > 0) {
                Text(
                    "Confirm pickup unlocks within ${pickupRadiusM}m of the branch.",
                    style = BcType.caption,
                    color = colors.textMuted,
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(Modifier.height(BcSpacing.xs))

            BcButton(
                label = confirmLabel,
                onClick = onConfirm,
                loading = submitting,
                enabled = !submitting,
                modifier = Modifier.fillMaxWidth(),
            )
            BcTextButton(
                label = "Cancel",
                onClick = onDismiss,
                enabled = !submitting,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

private const val VEHICLE_FAILURE_NOTE_MAX = 250

/** Confirmation for a driver reporting their vehicle has broken down mid-ride. */
@Composable
fun VehicleFailureDialog(
    submitting: Boolean,
    submitError: String?,
    onDismiss: () -> Unit,
    onSubmit: (String?) -> Unit,
) {
    val colors = LocalBcColors.current
    var note by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = { if (!submitting) onDismiss() },
        containerColor = colors.navyCard,
        title = { Text("Report vehicle failure?", fontWeight = FontWeight.Bold, color = colors.text) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    "This removes the ride from My active job. Admin will send another rider to your current location. You will not continue this run or return to the branch on it.",
                    color = colors.textMuted,
                    fontSize = 13.sp,
                )
                OutlinedTextField(
                    value = note,
                    onValueChange = { if (it.length <= VEHICLE_FAILURE_NOTE_MAX) note = it },
                    label = { Text("What happened? (optional)", color = colors.textMuted) },
                    minLines = 2,
                    maxLines = 4,
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = colors.navyLight,
                        unfocusedContainerColor = colors.navyLight,
                        focusedBorderColor = colors.brand,
                        unfocusedBorderColor = colors.navyBorder,
                        focusedTextColor = colors.text,
                        unfocusedTextColor = colors.text,
                        cursorColor = colors.brand,
                    ),
                )
                submitError?.let {
                    Text(it, color = colors.errorSoft, fontSize = 12.sp)
                }
            }
        },
        confirmButton = {
            TextButton(enabled = !submitting, onClick = { onSubmit(note.trim().ifBlank { null }) }) {
                Text(
                    if (submitting) "Reporting…" else "Report failure",
                    color = colors.errorSoft,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !submitting) {
                Text("Cancel", color = colors.textMuted)
            }
        },
    )
}

private val BRANCH_REQUEST_TYPES = listOf(
    "ADD_BRANCH" to "Add branch",
    "CHANGE_BRANCH" to "Change home branch",
    "REMOVE_BRANCH" to "Remove branch",
)

private const val SINGLE_ASSIGNED_BRANCH_MESSAGE =
    "You only have one assigned branch, so you cannot change your home branch."

/** Assigned branches other than home. Falls back to ids the catalog omitted. */
private fun assignedBranchesExceptHome(
    stores: List<lk.bingchun.delivery.data.model.BranchOption>,
    accessibleStoreIds: Set<String>,
    homeStoreId: String?,
): List<lk.bingchun.delivery.data.model.BranchOption> {
    val matched = stores.filter { it.id in accessibleStoreIds && it.id != homeStoreId }
    if (matched.isNotEmpty()) return matched
    return accessibleStoreIds
        .filter { it.isNotBlank() && it != homeStoreId }
        .map { id ->
            stores.find { it.id == id }
                ?: lk.bingchun.delivery.data.model.BranchOption(id = id, name = id.take(8))
        }
}

/** Driver request to add, change home, or remove an accessible branch (super-admin approval). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BranchRequestSheet(
    stores: List<lk.bingchun.delivery.data.model.BranchOption>,
    accessibleStoreIds: Set<String>,
    homeStoreId: String?,
    submitting: Boolean,
    submitError: String? = null,
    onDismiss: () -> Unit,
    onSubmit: (type: String, toStoreId: String, reason: String?) -> Unit,
) {
    val colors = LocalBcColors.current
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var type by remember { mutableStateOf(BRANCH_REQUEST_TYPES.first().first) }
    var selectedStoreId by remember { mutableStateOf<String?>(null) }
    var reason by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }

    val options = remember(type, stores, accessibleStoreIds, homeStoreId) {
        when (type) {
            "ADD_BRANCH" -> stores.filter { it.id !in accessibleStoreIds }
            "REMOVE_BRANCH", "CHANGE_BRANCH" ->
                assignedBranchesExceptHome(stores, accessibleStoreIds, homeStoreId)
            else -> emptyList()
        }
    }

    val filtered = remember(options, query) {
        val q = query.trim()
        if (q.isEmpty()) options
        else options.filter { store ->
            store.name.contains(q, ignoreCase = true) ||
                (store.city?.contains(q, ignoreCase = true) == true)
        }
    }

    LaunchedEffect(type) { query = "" }

    LaunchedEffect(type, options) {
        if (selectedStoreId == null || options.none { it.id == selectedStoreId }) {
            selectedStoreId = options.firstOrNull()?.id
        }
    }

    ModalBottomSheet(
        onDismissRequest = { if (!submitting) onDismiss() },
        sheetState = sheetState,
        containerColor = colors.navyCard,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp)
                .padding(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text("Request branch change", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = colors.text)
            Text(
                "Super admin will review this request. Only one pending request at a time.",
                color = colors.textMuted,
                fontSize = 12.sp,
            )
            BRANCH_REQUEST_TYPES.forEach { (value, label) ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .selectable(selected = type == value, onClick = { type = value })
                        .padding(vertical = 2.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    RadioButton(selected = type == value, onClick = { type = value })
                    Text(label, color = colors.text, fontSize = 14.sp)
                }
            }
            if (options.isEmpty()) {
                Text(
                    when (type) {
                        "ADD_BRANCH" -> "No other branches available to add."
                        "REMOVE_BRANCH" -> "No removable branches (cannot remove home)."
                        "CHANGE_BRANCH" ->
                            if (accessibleStoreIds.none { it.isNotBlank() && it != homeStoreId }) {
                                SINGLE_ASSIGNED_BRANCH_MESSAGE
                            } else {
                                "No other branches available."
                            }
                        else -> "No other branches available."
                    },
                    color = colors.errorSoft,
                    fontSize = 12.sp,
                )
            } else {
                BcTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = "Branch",
                    placeholder = "Search by name or city",
                    modifier = Modifier.fillMaxWidth(),
                )
                Box(modifier = Modifier.fillMaxWidth().heightIn(max = 280.dp)) {
                    if (filtered.isEmpty()) {
                        Text(
                            "No branches match that search.",
                            color = colors.textMuted,
                            fontSize = 12.sp,
                            modifier = Modifier.padding(vertical = 8.dp),
                        )
                    } else {
                        // Bounded height so the list can scroll inside the sheet's verticalScroll.
                        LazyColumn(modifier = Modifier.fillMaxWidth().height(280.dp)) {
                            items(filtered, key = { it.id }) { store ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .selectable(
                                            selected = selectedStoreId == store.id,
                                            onClick = { selectedStoreId = store.id },
                                        )
                                        .padding(vertical = 2.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    RadioButton(
                                        selected = selectedStoreId == store.id,
                                        onClick = { selectedStoreId = store.id },
                                    )
                                    Column {
                                        Text(store.name, color = colors.text, fontSize = 14.sp)
                                        store.city?.takeIf { it.isNotBlank() }?.let {
                                            Text(it, color = colors.textMuted, fontSize = 11.sp)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            OutlinedTextField(
                value = reason,
                onValueChange = { if (it.length <= 500) reason = it },
                label = { Text("Reason (optional)", color = colors.textMuted) },
                minLines = 2,
                maxLines = 3,
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = colors.navyLight,
                    unfocusedContainerColor = colors.navyLight,
                    focusedBorderColor = colors.brand,
                    unfocusedBorderColor = colors.navyBorder,
                    focusedTextColor = colors.text,
                    unfocusedTextColor = colors.text,
                    cursorColor = colors.brand,
                ),
            )
            error?.let {
                Text(it, color = colors.errorSoft, fontSize = 12.sp)
            }
            submitError?.let {
                Text(it, color = colors.errorSoft, fontSize = 12.sp)
            }
            BcButton(
                label = if (submitting) "Submitting…" else "Submit request",
                onClick = {
                    val storeId = selectedStoreId ?: return@BcButton
                    error = null
                    onSubmit(type, storeId, reason.trim().ifBlank { null })
                },
                loading = submitting,
                enabled = !submitting && selectedStoreId != null && options.isNotEmpty(),
                modifier = Modifier.fillMaxWidth(),
            )
            BcTextButton(
                label = "Cancel",
                onClick = onDismiss,
                enabled = !submitting,
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}
