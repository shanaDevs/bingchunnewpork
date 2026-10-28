package lk.bingchun.delivery.ui.navigation

import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import lk.bingchun.delivery.ui.AuthViewModel
import lk.bingchun.delivery.ui.components.DeviceLockLayer
import lk.bingchun.delivery.ui.components.IncomingRideOverlay
import lk.bingchun.delivery.ui.components.OrderCancelledOverlay
import lk.bingchun.delivery.ui.screens.DashboardScreen
import lk.bingchun.delivery.ui.screens.HomeShellScreen
import lk.bingchun.delivery.ui.screens.JobDetailScreen
import lk.bingchun.delivery.ui.screens.LoginScreen
import lk.bingchun.delivery.ui.screens.OrderDetailScreen
import lk.bingchun.delivery.ui.screens.RouteMapScreen
import lk.bingchun.delivery.ui.theme.BcMotion
import lk.bingchun.delivery.ui.theme.LocalBcColors

object Routes {
    const val LOGIN = "login"
    const val HOME = "home"
    const val JOB_DETAIL = "jobDetail/{jobId}"
    const val DASHBOARD = "dashboard/{jobId}"
    const val MAP = "map/{jobId}"
    const val ORDER_DETAIL = "order/{jobId}/{orderId}"

    fun jobDetail(jobId: String) = "jobDetail/$jobId"
    fun dashboard(jobId: String) = "dashboard/$jobId"
    fun map(jobId: String) = "map/$jobId"
    fun orderDetail(jobId: String, orderId: String) = "order/$jobId/$orderId"
}

private val enterTween = tween<Float>(BcMotion.StandardMs, easing = BcMotion.EaseOut)
private val exitTween = tween<Float>(BcMotion.FastMs, easing = BcMotion.EaseInOut)

@Composable
fun AppNavHost(
    authViewModel: AuthViewModel,
    openJobId: String? = null,
) {
    val navController = rememberNavController()
    val auth by authViewModel.state.collectAsState()
    val colors = LocalBcColors.current

    Box(modifier = Modifier.fillMaxSize()) {
        if (auth.checking) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = colors.brand)
            }
        } else {
            val startDestination = if (auth.isAuthenticated) Routes.HOME else Routes.LOGIN

            LaunchedEffect(auth.isAuthenticated) {
                if (auth.isAuthenticated) {
                    if (navController.currentDestination?.route == Routes.LOGIN) {
                        navController.navigateToTop(Routes.HOME)
                    }
                } else {
                    navController.navigateToTop(Routes.LOGIN)
                }
            }

            LaunchedEffect(auth.isAuthenticated, openJobId) {
                if (auth.isAuthenticated && !openJobId.isNullOrBlank()) {
                    navController.navigate(Routes.dashboard(openJobId)) {
                        launchSingleTop = true
                    }
                }
            }

            NavHost(
                navController = navController,
                startDestination = startDestination,
                enterTransition = {
                    fadeIn(enterTween) + slideIntoContainer(
                        towards = AnimatedContentTransitionScope.SlideDirection.Start,
                        animationSpec = tween(BcMotion.StandardMs, easing = BcMotion.EaseOut),
                        initialOffset = { it / 24 },
                    )
                },
                exitTransition = {
                    fadeOut(exitTween) + slideOutOfContainer(
                        towards = AnimatedContentTransitionScope.SlideDirection.Start,
                        animationSpec = tween(BcMotion.FastMs, easing = BcMotion.EaseInOut),
                        targetOffset = { it / 24 },
                    )
                },
                popEnterTransition = {
                    fadeIn(enterTween) + slideIntoContainer(
                        towards = AnimatedContentTransitionScope.SlideDirection.End,
                        animationSpec = tween(BcMotion.StandardMs, easing = BcMotion.EaseOut),
                        initialOffset = { it / 24 },
                    )
                },
                popExitTransition = {
                    fadeOut(exitTween) + slideOutOfContainer(
                        towards = AnimatedContentTransitionScope.SlideDirection.End,
                        animationSpec = tween(BcMotion.FastMs, easing = BcMotion.EaseInOut),
                        targetOffset = { it / 24 },
                    )
                },
            ) {
                composable(Routes.LOGIN) {
                    LoginScreen(authViewModel = authViewModel)
                }
                composable(Routes.HOME) {
                    HomeShellScreen(
                        authViewModel = authViewModel,
                        onOpenJob = { job ->
                            if (job.status == "IN_PROGRESS" || job.status == "ASSIGNED" || job.status == "RETURNING") {
                                navController.navigate(Routes.dashboard(job.id))
                            } else {
                                navController.navigate(Routes.jobDetail(job.id))
                            }
                        },
                    )
                }
                composable(
                    Routes.JOB_DETAIL,
                    arguments = listOf(navArgument("jobId") { type = NavType.StringType }),
                ) { entry ->
                    val jobId = entry.arguments?.getString("jobId").orEmpty()
                    JobDetailScreen(
                        jobId = jobId,
                        onBack = { navController.popBackStack() },
                        onOpenMap = { navController.navigate(Routes.map(jobId)) },
                        onOpenDashboard = {
                            navController.navigate(Routes.dashboard(jobId)) {
                                popUpTo(Routes.jobDetail(jobId)) { inclusive = true }
                            }
                        },
                        onOpenOrder = { orderId -> navController.navigate(Routes.orderDetail(jobId, orderId)) },
                    )
                }
                composable(
                    Routes.DASHBOARD,
                    arguments = listOf(navArgument("jobId") { type = NavType.StringType }),
                ) { entry ->
                    val jobId = entry.arguments?.getString("jobId").orEmpty()
                    DashboardScreen(
                        jobId = jobId,
                        onBack = { navController.navigateToTop(Routes.HOME) },
                        onOpenMap = { navController.navigate(Routes.map(jobId)) },
                        onOpenOrder = { orderId -> navController.navigate(Routes.orderDetail(jobId, orderId)) },
                    )
                }
                composable(
                    Routes.MAP,
                    arguments = listOf(navArgument("jobId") { type = NavType.StringType }),
                ) { entry ->
                    val jobId = entry.arguments?.getString("jobId").orEmpty()
                    RouteMapScreen(
                        jobId = jobId,
                        onBack = { navController.popBackStack() },
                        onOpenOrder = { orderId -> navController.navigate(Routes.orderDetail(jobId, orderId)) },
                        onFinishRun = { navController.navigateToTop(Routes.HOME) },
                    )
                }
                composable(
                    Routes.ORDER_DETAIL,
                    arguments = listOf(
                        navArgument("jobId") { type = NavType.StringType },
                        navArgument("orderId") { type = NavType.StringType },
                    ),
                ) { entry ->
                    val jobId = entry.arguments?.getString("jobId").orEmpty()
                    val orderId = entry.arguments?.getString("orderId").orEmpty()
                    OrderDetailScreen(
                        jobId = jobId,
                        orderId = orderId,
                        onBack = { navController.popBackStack() },
                    )
                }
            }
        }

        // Blocks login, home, dashboard, and all other screens until GPS + data are on.
        DeviceLockLayer()

        if (auth.isAuthenticated) {
            IncomingRideOverlay(
                onOpenJob = { jobId ->
                    navController.navigate(Routes.dashboard(jobId)) {
                        launchSingleTop = true
                    }
                },
            )
            OrderCancelledOverlay()
        }
    }
}

private fun NavHostController.navigateToTop(route: String) {
    navigate(route) {
        popUpTo(graph.startDestinationId) { inclusive = true }
        launchSingleTop = true
    }
}
