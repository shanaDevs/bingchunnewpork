package lk.bingchun.delivery.core

import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZoneOffset
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Small formatting helpers (replacing Flutter's intl usage). */
object Format {
    private val timeFmt = DateTimeFormatter.ofPattern("MMM d, h:mm a", Locale.ENGLISH)
    private val jobTimeFmt = DateTimeFormatter.ofPattern("MMM d • h:mm a", Locale.ENGLISH)
    private val deviceZone: ZoneId get() = ZoneId.systemDefault()

    fun money(amount: Int): String {
        val grouped = "%,d".format(amount)
        return "Rs. $grouped"
    }

    fun historyGroup(iso: String?): String {
        val date = try {
            toDeviceZoned(iso).toLocalDate()
        } catch (_: Exception) {
            return "Earlier"
        }
        val today = LocalDate.now(deviceZone)
        return when (date) {
            today -> "Today"
            today.minusDays(1) -> "Yesterday"
            else -> "Earlier"
        }
    }

    /** True when [iso] falls on the device's current local calendar day. */
    fun isToday(iso: String?): Boolean {
        val date = try {
            toDeviceZoned(iso).toLocalDate()
        } catch (_: Exception) {
            return false
        }
        return date == LocalDate.now(deviceZone)
    }

    fun dateTime(iso: String?): String {
        if (iso.isNullOrBlank()) return "—"
        return try {
            toDeviceZoned(iso).format(timeFmt)
        } catch (_: Exception) {
            iso
        }
    }

    fun jobDateTime(iso: String?): String {
        if (iso.isNullOrBlank()) return "—"
        return try {
            toDeviceZoned(iso).format(jobTimeFmt)
        } catch (_: Exception) {
            dateTime(iso)
        }
    }

    fun deliverySummary(orderCount: Int, totalCups: Int = 0): String {
        val orders = "$orderCount order${if (orderCount != 1) "s" else ""}"
        val cups = if (totalCups > 0) " ($totalCups cup${if (totalCups != 1) "s" else ""})" else ""
        return "Delivery • $orders$cups"
    }

    /**
     * Human-readable Ride ID (e.g. RIDE-1024). Falls back to # + first 8 of the
     * job UUID, matching admin `shortJobId`.
     */
    fun displayRideId(rideCode: String?, jobId: String): String =
        rideCode?.takeIf { it.isNotBlank() } ?: "#${jobId.take(8).uppercase()}"

    fun rideIdLabel(rideCode: String?, jobId: String): String =
        "Ride ID · ${displayRideId(rideCode, jobId)}"

    /**
     * API timestamps are UTC (`…Z`). Always show the phone's local zone
     * (Asia/Colombo on Sri Lanka devices), never the raw UTC clock.
     */
    private fun toDeviceZoned(iso: String?): ZonedDateTime {
        val raw = iso?.trim().orEmpty()
        val instant = try {
            OffsetDateTime.parse(raw).toInstant()
        } catch (_: Exception) {
            try {
                Instant.parse(raw)
            } catch (_: Exception) {
                LocalDateTime.parse(raw).toInstant(ZoneOffset.UTC)
            }
        }
        return instant.atZone(deviceZone)
    }

    fun km(value: Double): String = "%.1f km".format(value)
    fun minutes(value: Int): String = "$value min"

    fun metresAway(distanceM: Double): Int = kotlin.math.round(distanceM).toInt().coerceAtLeast(0)

    fun pickupUnlockHint(distanceM: Double?, radiusM: Int, within: Boolean): String {
        if (distanceM == null) return "Getting GPS…"
        val away = metresAway(distanceM)
        if (within) return "At the branch · pickup unlocked"
        val closer = (away - radiusM).coerceAtLeast(0)
        return "$away m from branch · $closer m closer to unlock (within ${radiusM}m)"
    }

    /** For jobs with a pickup override (e.g. vehicle failure) — no geofence to unlock,
     *  just a heads-up on how far the rider is from the handoff spot. */
    fun pickupOverrideHint(distanceM: Double?, label: String): String {
        val away = distanceM?.let { "${metresAway(it)}m away" } ?: "Getting GPS…"
        return "Pickup at $label · $away · no check-in required"
    }

    /** Shift/duty duration as e.g. "2h 15m" or "45m". */
    fun duration(totalMinutes: Int): String {
        val safe = totalMinutes.coerceAtLeast(0)
        val hours = safe / 60
        val minutes = safe % 60
        return if (hours > 0) "${hours}h ${minutes}m" else "${minutes}m"
    }

    /**
     * Driver-friendly address: drop noisy province/road-name duplicates and
     * trailing repeated city/district tokens.
     */
    fun shortAddress(addressLine: String?, city: String? = null, district: String? = null): String {
        val noiseExact = setOf(
            "western province",
            "sri lanka",
            "lk",
            "colombo-ratnapura-wellawaya-batticaloa road",
        )
        val parts = buildList {
            addressLine?.split(',', '·', '|')?.forEach { add(it.trim()) }
            city?.trim()?.takeIf { it.isNotBlank() }?.let { add(it) }
            district?.trim()?.takeIf { it.isNotBlank() }?.let { add(it) }
        }.filter { it.isNotBlank() }

        val cleaned = LinkedHashSet<String>()
        for (part in parts) {
            val key = part.lowercase(Locale.ENGLISH)
            if (key in noiseExact) continue
            if (key.contains("wellawaya-batticaloa")) continue
            if (cleaned.any { it.equals(part, ignoreCase = true) }) continue
            cleaned.add(part)
        }

        val list = cleaned.toList()
        // Keep at most street + area + city
        val trimmed = if (list.size > 3) list.take(2) + list.last() else list
        return trimmed.joinToString(", ").ifBlank { "Address unavailable" }
    }

    fun shortBranchName(name: String): String =
        name.removePrefix("Bing Chun - ").removePrefix("Bing Chun — ").trim()
}
