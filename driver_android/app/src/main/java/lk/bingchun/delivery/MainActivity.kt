package lk.bingchun.delivery

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.viewmodel.compose.viewModel
import lk.bingchun.delivery.ui.AuthViewModel
import lk.bingchun.delivery.ui.ContainerViewModelFactory
import lk.bingchun.delivery.ui.navigation.AppNavHost
import lk.bingchun.delivery.ui.theme.BingChunTheme
import java.util.concurrent.atomic.AtomicBoolean

class MainActivity : ComponentActivity() {

    companion object {
        const val EXTRA_OPEN_JOB_ID = "openJobId"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as BingChunApp).container
        val keepSplash = AtomicBoolean(true)
        splash.setKeepOnScreenCondition { keepSplash.get() }
        setContent {
            BingChunTheme {
                val authViewModel: AuthViewModel = viewModel(factory = ContainerViewModelFactory(container))
                val auth by authViewModel.state.collectAsState()
                LaunchedEffect(auth.checking) { keepSplash.set(auth.checking) }
                AppNavHost(
                    authViewModel = authViewModel,
                    openJobId = intent.getStringExtra(EXTRA_OPEN_JOB_ID),
                )
            }
        }
    }
}
