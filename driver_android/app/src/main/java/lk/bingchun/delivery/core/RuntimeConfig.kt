package lk.bingchun.delivery.core

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import lk.bingchun.delivery.BuildConfig

/**
 * Persisted overrides for API hosts + premium UX prefs (theme, sound, haptics).
 */
object RuntimeConfig {
    private const val PREFS = "bc_delivery_runtime"
    private const val KEY_CORE = "core_api_base_url"
    private const val KEY_DELIVERY = "delivery_api_base_url"
    private const val KEY_STORE = "store_id"
    private const val KEY_THEME = "theme_mode"
    private const val DEFAULT_THEME = "LIGHT"
    private const val KEY_SOUND = "sound_enabled"
    private const val KEY_HAPTICS = "haptics_enabled"

    @Volatile private var prefs: SharedPreferences? = null

    /** Light-first, matching the customer app. Riders who pick a mode keep their choice. */
    private val _themeMode = MutableStateFlow(DEFAULT_THEME)
    val themeModeFlow: StateFlow<String> = _themeMode.asStateFlow()

    private val _soundEnabled = MutableStateFlow(true)
    val soundEnabledFlow: StateFlow<Boolean> = _soundEnabled.asStateFlow()

    private val _hapticsEnabled = MutableStateFlow(true)
    val hapticsEnabledFlow: StateFlow<Boolean> = _hapticsEnabled.asStateFlow()

    fun init(context: Context) {
        if (prefs == null) {
            prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            _themeMode.value = prefs?.getString(KEY_THEME, DEFAULT_THEME) ?: DEFAULT_THEME
            _soundEnabled.value = prefs?.getBoolean(KEY_SOUND, true) ?: true
            _hapticsEnabled.value = prefs?.getBoolean(KEY_HAPTICS, true) ?: true
        }
    }

    /** Host overrides are a debug-only tool; release builds always talk to the shipped hosts. */
    private val overridesAllowed: Boolean get() = BuildConfig.DEBUG

    var coreApiBaseUrl: String
        get() = prefs?.getString(KEY_CORE, null)
            ?.takeIf { overridesAllowed && it.isNotBlank() }
            ?: BuildConfig.CORE_API_BASE_URL
        set(value) {
            if (!overridesAllowed) return
            prefs?.edit()?.putString(KEY_CORE, value.trim().trimEnd('/'))?.apply()
        }

    var deliveryApiBaseUrl: String
        get() = prefs?.getString(KEY_DELIVERY, null)
            ?.takeIf { overridesAllowed && it.isNotBlank() }
            ?: BuildConfig.DELIVERY_API_BASE_URL
        set(value) {
            if (!overridesAllowed) return
            prefs?.edit()?.putString(KEY_DELIVERY, value.trim().trimEnd('/'))?.apply()
        }

    var storeId: String?
        get() {
            val override = prefs?.getString(KEY_STORE, null)
            return when {
                override != null -> override.takeIf { it.isNotBlank() }
                else -> BuildConfig.STORE_ID.takeIf { it.isNotBlank() }
            }
        }
        set(value) {
            prefs?.edit()?.apply {
                if (value.isNullOrBlank()) remove(KEY_STORE) else putString(KEY_STORE, value.trim())
            }?.apply()
        }

    var themeMode: String
        get() = _themeMode.value
        set(value) {
            _themeMode.value = value
            prefs?.edit()?.putString(KEY_THEME, value)?.apply()
        }

    var soundEnabled: Boolean
        get() = _soundEnabled.value
        set(value) {
            _soundEnabled.value = value
            prefs?.edit()?.putBoolean(KEY_SOUND, value)?.apply()
        }

    var hapticsEnabled: Boolean
        get() = _hapticsEnabled.value
        set(value) {
            _hapticsEnabled.value = value
            prefs?.edit()?.putBoolean(KEY_HAPTICS, value)?.apply()
        }

    val hasOverrides: Boolean
        get() = overridesAllowed && (
            prefs?.contains(KEY_CORE) == true ||
                prefs?.contains(KEY_DELIVERY) == true ||
                prefs?.contains(KEY_STORE) == true
            )

    fun resetToBuildDefaults() {
        prefs?.edit()?.remove(KEY_CORE)?.remove(KEY_DELIVERY)?.remove(KEY_STORE)?.apply()
    }
}
