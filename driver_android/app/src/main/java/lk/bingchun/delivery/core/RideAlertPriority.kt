package lk.bingchun.delivery.core

/**
 * After a rider rejects a claimed job, later popups prefer other branches, then
 * other jobs at the same branch, and only then the job they just rejected.
 */
fun prioritizedRideAlerts(
    alerts: Collection<RideAlert>,
    lastRejectedJobId: String?,
    lastRejectedStoreId: String?,
): List<RideAlert> {
    if (alerts.isEmpty()) return emptyList()
    val rejectedId = lastRejectedJobId?.takeIf { it.isNotBlank() }
    val rejectedStore = lastRejectedStoreId?.takeIf { it.isNotBlank() }
    val list = alerts.toList()
    val otherBranch = list.filter { alert ->
        alert.jobId != rejectedId &&
            rejectedStore != null &&
            alert.storeId.isNotBlank() &&
            alert.storeId != rejectedStore
    }
    val otherBranchIds = otherBranch.mapTo(HashSet()) { it.jobId }
    val sameBranchOrUnknown = list.filter { alert ->
        alert.jobId != rejectedId && alert.jobId !in otherBranchIds
    }
    val rejected = list.filter { it.jobId == rejectedId }
    return otherBranch + sameBranchOrUnknown + rejected
}

fun pickNextRideAlert(
    alerts: Collection<RideAlert>,
    lastRejectedJobId: String?,
    lastRejectedStoreId: String?,
): RideAlert? = prioritizedRideAlerts(alerts, lastRejectedJobId, lastRejectedStoreId).firstOrNull()
