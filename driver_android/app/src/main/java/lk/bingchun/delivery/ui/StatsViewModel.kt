package lk.bingchun.delivery.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import lk.bingchun.delivery.core.AppContainer
import lk.bingchun.delivery.data.model.RiderRatingItem
import lk.bingchun.delivery.data.model.RiderStats

/** Periods offered by the Stats tab; the values match the server's `period` query param. */
enum class StatsPeriod(val key: String, val label: String) {
    TODAY("today", "Today"),
    WEEK("7d", "This Week"),
    MONTH("30d", "This Month"),
    ALL("all", "All Time"),
}

data class StatsState(
    val loading: Boolean = false,
    val refreshing: Boolean = false,
    val error: String? = null,
    val period: StatsPeriod = StatsPeriod.MONTH,
    val stats: RiderStats? = null,
    val ratingsLoading: Boolean = false,
    val ratingsAverage: Double? = null,
    val ratingsCount: Int = 0,
    val ratings: List<RiderRatingItem> = emptyList(),
)

class StatsViewModel(private val container: AppContainer) : ViewModel() {
    private val jobsRepo = container.jobsRepository
    private val _state = MutableStateFlow(StatsState())
    val state: StateFlow<StatsState> = _state.asStateFlow()

    /** Cached per period so switching back and forth doesn't re-hit the network. */
    private val cache = mutableMapOf<StatsPeriod, RiderStats>()

    fun load(period: StatsPeriod = _state.value.period, force: Boolean = false) {
        val cached = cache[period]
        if (cached != null && !force) {
            _state.value = _state.value.copy(period = period, stats = cached, loading = false, error = null)
            loadRatings(false)
            return
        }
        _state.value = _state.value.copy(
            period = period,
            loading = cached == null,
            refreshing = force,
            error = null,
        )
        viewModelScope.launch {
            try {
                val stats = jobsRepo.getMyStats(period.key)
                cache[period] = stats
                // A slow response for a period the rider has since left must not overwrite.
                if (_state.value.period != period) return@launch
                _state.value = _state.value.copy(stats = stats, loading = false, refreshing = false)
            } catch (e: Exception) {
                if (_state.value.period != period) return@launch
                _state.value = _state.value.copy(
                    loading = false,
                    refreshing = false,
                    error = e.message ?: "Could not load your stats",
                )
            }
        }
        loadRatings(force)
    }

    fun loadRatings(force: Boolean = false) {
        if (!force && (_state.value.ratings.isNotEmpty() || _state.value.ratingsLoading)) return
        _state.value = _state.value.copy(ratingsLoading = true)
        viewModelScope.launch {
            try {
                val payload = jobsRepo.getMyRatings()
                _state.value = _state.value.copy(
                    ratingsLoading = false,
                    ratingsAverage = payload.average,
                    ratingsCount = payload.count,
                    ratings = payload.ratings,
                )
            } catch (_: Exception) {
                _state.value = _state.value.copy(ratingsLoading = false)
            }
        }
    }
}
