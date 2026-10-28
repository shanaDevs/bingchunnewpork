package lk.bingchun.delivery.data.model

import com.squareup.moshi.JsonClass

/**
 * Rider-facing performance figures from `GET /api/delivery/me/stats`.
 * Mirrors `packages/delivery-domain/src/riderStats.ts`; every field defaulted so an
 * older server that omits one does not break the Stats tab.
 */

@JsonClass(generateAdapter = true)
data class RiderStatsPeriod(
    val key: String = "7d",
    val from: String? = null,
    val to: String? = null,
)

@JsonClass(generateAdapter = true)
data class RiderStatsTotals(
    val completedRuns: Int = 0,
    val deliveredStops: Int = 0,
    val totalDistanceKm: Double = 0.0,
    /** Sum of delivery fees on delivered stops — same basis as the History tab total. */
    val earningsLkr: Int = 0,
    val onlineMinutes: Int = 0,
    val attendanceDays: Int = 0,
    val averagePickupMinutes: Int? = null,
    val averageDeliveryMinutes: Int? = null,
)

@JsonClass(generateAdapter = true)
data class RiderRatingItem(
    val id: String,
    val orderNumber: String? = null,
    val stars: Int = 0,
    val comment: String? = null,
    val createdAt: String? = null,
)

@JsonClass(generateAdapter = true)
data class RiderRatingSummary(
    val average: Double? = null,
    val count: Int = 0,
    val recent: List<RiderRatingItem> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class RiderRatingsResponse(
    val average: Double? = null,
    val count: Int = 0,
    val ratings: List<RiderRatingItem> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class RiderMeritItem(
    val id: String,
    val changedPoints: Int = 0,
    val newPoints: Int = 0,
    val reason: String = "",
    val eventType: String = "",
    val createdAt: String? = null,
)

@JsonClass(generateAdapter = true)
data class RiderMeritSummary(
    val points: Int = 0,
    val status: String = "",
    val recent: List<RiderMeritItem> = emptyList(),
)

@JsonClass(generateAdapter = true)
data class RiderStats(
    val period: RiderStatsPeriod = RiderStatsPeriod(),
    val totals: RiderStatsTotals = RiderStatsTotals(),
    val rating: RiderRatingSummary = RiderRatingSummary(),
    val merit: RiderMeritSummary = RiderMeritSummary(),
) {
    /** True when the window holds nothing worth charting — drives the empty state. */
    val isEmpty: Boolean
        get() = totals.completedRuns == 0 &&
            totals.deliveredStops == 0 &&
            totals.onlineMinutes == 0 &&
            rating.count == 0
}
