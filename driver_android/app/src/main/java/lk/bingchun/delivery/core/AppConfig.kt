package lk.bingchun.delivery.core

/**
 * Central config surface — port of mobile/lib/core/config/env.dart.
 * Defaults come from BuildConfig; [RuntimeConfig] overrides (5-tap logo on Login) win when set.
 */
object AppConfig {
    /** Core backend base, includes `/api`. */
    val coreApiBaseUrl: String
        get() = RuntimeConfig.coreApiBaseUrl.ensureTrailingSlash()

    /**
     * Delivery service base (optional / legacy). Prefer core for jobs, duty, and GPS batch
     * when `DELIVERY_SERVICE_ENABLED=false`.
     */
    val deliveryApiBaseUrl: String
        get() = RuntimeConfig.deliveryApiBaseUrl.ensureTrailingSlash()

    /** Core socket.io origin (no path) — default namespace for joinBranchPool / GPS. */
    val coreSocketOrigin: String
        get() = originOf(RuntimeConfig.coreApiBaseUrl)

    /** Delivery socket.io origin (legacy `/delivery` namespace) — kept for optional DS. */
    val deliverySocketOrigin: String
        get() = originOf(RuntimeConfig.deliveryApiBaseUrl)

    /** Optional branch id for PIN login when one build serves multiple branches. */
    val storeId: String?
        get() = RuntimeConfig.storeId

    private fun originOf(base: String): String {
        val schemeEnd = base.indexOf("://")
        if (schemeEnd < 0) return base
        val pathStart = base.indexOf('/', schemeEnd + 3)
        return if (pathStart < 0) base else base.substring(0, pathStart)
    }

    private fun String.ensureTrailingSlash() = if (endsWith("/")) this else "$this/"
}
