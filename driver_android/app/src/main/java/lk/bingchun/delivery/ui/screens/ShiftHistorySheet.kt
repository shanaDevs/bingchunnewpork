package lk.bingchun.delivery.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.data.model.DriverShiftEntry
import lk.bingchun.delivery.ui.theme.LocalBcColors

/** Driver's own on/off duty timeline, most recent first. */
@Composable
fun ShiftHistorySheet(
    shifts: List<DriverShiftEntry>,
    loading: Boolean,
    error: String?,
    onDismiss: () -> Unit,
) {
    val colors = LocalBcColors.current
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = colors.navyCard,
        title = { Text("Shift history", fontWeight = FontWeight.Bold, color = colors.text) },
        text = {
            Box(modifier = Modifier.heightIn(max = 420.dp)) {
                when {
                    loading -> Box(
                        modifier = Modifier.fillMaxWidth().padding(24.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = colors.brand)
                    }
                    error != null -> Text(error, color = colors.errorSoft, fontSize = 13.sp)
                    shifts.isEmpty() -> Text("No shifts yet.", color = colors.textMuted, fontSize = 13.sp)
                    else -> LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        items(shifts, key = { it.id }) { shift -> ShiftHistoryRow(shift) }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close", color = colors.brand) }
        },
    )
}

@Composable
private fun ShiftHistoryRow(shift: DriverShiftEntry) {
    val colors = LocalBcColors.current
    val ongoing = shift.endedAt == null
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                Format.jobDateTime(shift.startedAt),
                color = colors.text,
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
            )
            Text(
                if (ongoing) "Ongoing" else Format.duration(shift.durationMinutes),
                color = if (ongoing) colors.brand else colors.textMuted,
                fontSize = 12.sp,
            )
        }
        if (!ongoing) {
            Text(
                "Ended ${Format.jobDateTime(shift.endedAt)}",
                color = colors.textMuted,
                fontSize = 11.sp,
            )
        }
    }
}
