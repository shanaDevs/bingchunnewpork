package lk.bingchun.delivery.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import lk.bingchun.delivery.core.AppContainer
import lk.bingchun.delivery.core.SessionInvalidator
import lk.bingchun.delivery.data.model.DriverSession

data class AuthState(
    val loading: Boolean = false,
    val checking: Boolean = true,
    val driver: DriverSession? = null,
    val error: String? = null,
) {
    val isAuthenticated: Boolean get() = driver != null
}

/** Port of mobile/lib/providers/auth_provider.dart (AuthNotifier). */
class AuthViewModel(private val container: AppContainer) : ViewModel() {

    private val repo = container.authRepository

    private val _state = MutableStateFlow(AuthState())
    val state: StateFlow<AuthState> = _state.asStateFlow()
    private var handlingInvalidation = false

    init {
        restore()
        viewModelScope.launch {
            container.sessionInvalidator.events.collect { reason ->
                onSessionInvalidated(reason)
            }
        }
    }

    private fun restore() {
        val driver = repo.restore()
        _state.value = _state.value.copy(checking = false, driver = driver)
        if (driver != null) {
            lk.bingchun.delivery.core.PushTokens.register(container)
        }
    }

    /**
     * The backend resolves the branch from the PIN and grants access to every branch the
     * rider works at, so the app never asks them to choose one.
     */
    fun login(pin: String, storeId: String? = null) {
        if (_state.value.loading) return
        _state.value = _state.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                val driver = repo.login(pin.trim(), storeId)
                handlingInvalidation = false
                _state.value = AuthState(checking = false, loading = false, driver = driver)
                lk.bingchun.delivery.core.PushTokens.register(container)
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false, error = e.message ?: "Login failed")
            }
        }
    }

    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }

    private fun onSessionInvalidated(reason: String) {
        if (_state.value.driver == null || handlingInvalidation) return
        handlingInvalidation = true
        val message = if (reason == SessionInvalidator.SESSION_SUPERSEDED) {
            "Signed in on another device"
        } else {
            "Session expired. Please sign in again."
        }
        logout(message)
    }

    fun logout(message: String? = null) {
        viewModelScope.launch {
            // Do not force OFF_DUTY here — an active/queued run would 409, and
            // silently flipping duty on logout hid that. Duty stays as-is until
            // the driver toggles it from Me.
            lk.bingchun.delivery.core.PushTokens.unregister(container)
            repo.logout()
            lk.bingchun.delivery.core.DriverAlertService.stop(container.appContext)
            container.deliverySocket.disconnect()
            container.locationTracker.stop()
            _state.value = AuthState(checking = false, driver = null, error = message)
        }
    }
}
