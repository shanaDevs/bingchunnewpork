package lk.bingchun.delivery.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.viewmodel.compose.viewModel
import lk.bingchun.delivery.BingChunApp
import lk.bingchun.delivery.core.AppContainer

/**
 * Builds ViewModels with access to the [AppContainer]. Avoids a DI framework.
 */
class ContainerViewModelFactory(
    private val container: AppContainer,
) : ViewModelProvider.Factory {

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
        return when (modelClass) {
            AuthViewModel::class.java -> AuthViewModel(container) as T
            JobsListViewModel::class.java -> JobsListViewModel(container) as T
            JobDetailViewModel::class.java -> JobDetailViewModel(container) as T
            DashboardViewModel::class.java -> DashboardViewModel(container) as T
            OrderActionViewModel::class.java -> OrderActionViewModel(container) as T
            StatsViewModel::class.java -> StatsViewModel(container) as T
            else -> throw IllegalArgumentException("Unknown ViewModel: ${modelClass.name}")
        }
    }
}

@Composable
inline fun <reified T : ViewModel> containerViewModel(): T {
    val context = LocalContext.current
    val container = (context.applicationContext as BingChunApp).container
    return viewModel(factory = ContainerViewModelFactory(container))
}
