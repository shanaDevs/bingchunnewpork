package lk.bingchun.delivery.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.outlined.Logout
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material.icons.outlined.Vibration
import androidx.compose.material.icons.automirrored.outlined.VolumeUp
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.core.Intents
import lk.bingchun.delivery.core.LocalBcFeedback
import lk.bingchun.delivery.core.RuntimeConfig
import lk.bingchun.delivery.data.model.BranchOption
import lk.bingchun.delivery.data.model.DriverBranchRequest
import lk.bingchun.delivery.data.model.DriverShiftEntry
import lk.bingchun.delivery.ui.AuthViewModel
import lk.bingchun.delivery.ui.JobsListViewModel
import lk.bingchun.delivery.ui.StatsViewModel
import lk.bingchun.delivery.ui.components.BcButton
import lk.bingchun.delivery.ui.components.BcPinnedTabLayout
import lk.bingchun.delivery.ui.components.BcOutlineButton
import lk.bingchun.delivery.ui.components.DriverAvatar
import lk.bingchun.delivery.ui.components.RiderReviewsSection
import lk.bingchun.delivery.ui.components.ScooterIllustration
import coil3.compose.AsyncImage
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.ui.layout.ContentScale
import lk.bingchun.delivery.ui.containerViewModel
import lk.bingchun.delivery.ui.theme.BcLightStatusBarIcons
import lk.bingchun.delivery.ui.theme.BcSpacing
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

/**
 * Driver App "Me" (Profile & Settings) Screen designed to match the modern visual mockup.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MeScreen(
    authViewModel: AuthViewModel,
    modifier: Modifier = Modifier,
) {
    val colors = LocalBcColors.current
    val feedback = LocalBcFeedback.current
    val auth by authViewModel.state.collectAsState()
    val jobsVm: JobsListViewModel = containerViewModel()
    val statsVm: StatsViewModel = containerViewModel()
    val jobsState by jobsVm.state.collectAsState()
    val statsState by statsVm.state.collectAsState()

    var showServer by remember { mutableStateOf(false) }
    var logoTaps by remember { mutableIntStateOf(0) }
    var showBranchRequest by remember { mutableStateOf(false) }
    var branchStores by remember { mutableStateOf<List<BranchOption>>(emptyList()) }
    var branchRequestSubmitting by remember { mutableStateOf(false) }
    var branchRequestError by remember { mutableStateOf<String?>(null) }
    var myBranchRequests by remember { mutableStateOf<List<DriverBranchRequest>>(emptyList()) }

    var showVehicleFailure by remember { mutableStateOf(false) }
    var vehicleFailureSubmitting by remember { mutableStateOf(false) }
    var vehicleFailureError by remember { mutableStateOf<String?>(null) }

    var showShiftHistory by remember { mutableStateOf(false) }
    var shiftHistoryLoading by remember { mutableStateOf(false) }
    var shiftHistoryError by remember { mutableStateOf<String?>(null) }
    var shiftHistory by remember { mutableStateOf<List<DriverShiftEntry>>(emptyList()) }

    var showJobAlerts by remember { mutableStateOf(false) }
    var showProfileDetailsSheet by remember { mutableStateOf(false) }
    var showOffDutyConfirm by remember { mutableStateOf(false) }
    var showSignOutBlocked by remember { mutableStateOf(false) }

    val scope = rememberCoroutineScope()
    val themeMode = RuntimeConfig.themeModeFlow.collectAsState().value
    val soundOn = RuntimeConfig.soundEnabledFlow.collectAsState().value
    val hapticsOn = RuntimeConfig.hapticsEnabledFlow.collectAsState().value

    val context = LocalContext.current
    val fsiPrefs = remember {
        context.getSharedPreferences("bc_driver_prefs", android.content.Context.MODE_PRIVATE)
    }

    androidx.lifecycle.compose.LifecycleResumeEffect(Unit) {
        scope.launch {
            try {
                myBranchRequests = jobsVm.listMyBranchRequests()
            } catch (_: Exception) { }
        }
        onPauseOrDispose { }
    }

    androidx.compose.runtime.LaunchedEffect(jobsState.dutyError) {
        if (jobsState.dutyError != null) feedback.error()
    }

    androidx.compose.runtime.LaunchedEffect(Unit) {
        jobsVm.load()
        statsVm.loadRatings()
        try {
            myBranchRequests = jobsVm.listMyBranchRequests()
        } catch (_: Exception) {
            // Profile still works if request history fails to load.
        }
    }

    val branches = remember(jobsState.profile, auth.driver) {
        val fromProfile = jobsState.profile?.accessibleStores.orEmpty()
        if (fromProfile.isNotEmpty()) {
            fromProfile
        } else {
            listOfNotNull(
                jobsState.profile?.store,
                auth.driver?.storeName?.let {
                    lk.bingchun.delivery.data.model.StoreRef(
                        id = auth.driver?.storeId.orEmpty(),
                        name = it,
                        city = auth.driver?.storeCity,
                    )
                },
            )
        }
    }

    val driverName = jobsState.profile?.name ?: auth.driver?.name ?: "Driver"
    val storeName = (jobsState.profile?.store?.name ?: auth.driver?.storeName)?.takeIf { it.isNotBlank() }
    val storeCity = (jobsState.profile?.store?.city ?: auth.driver?.storeCity)?.takeIf { it.isNotBlank() }
    val avatarInitial = driverName.trim().take(1).uppercase().ifBlank { "D" }
    val meritPoints = jobsState.profile?.meritPoints
    val meritStatus = jobsState.profile?.meritStatus?.takeIf { it.isNotBlank() }?.uppercase()
    val profile = jobsState.profile

    Box(
        modifier = modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        BcPinnedTabLayout(
            overlap = 22.dp,
            header = {
                MeHeader(
                    onSettingsClick = {
                        feedback.tap()
                        showServer = true
                    },
                )
            },
        ) { topPad ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(top = topPad),
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                // 2. Floating Driver Profile Card
                DriverProfileCard(
                    driverName = driverName,
                    avatarInitial = avatarInitial,
                    profilePhotoUrl = profile?.profilePhotoUrl,
                    meritPoints = meritPoints,
                    meritStatus = meritStatus,
                    storeName = storeName,
                    storeCity = storeCity,
                    avgRating = profile?.avgRating,
                    ratingCount = profile?.ratingCount,
                    onCardClick = {
                        feedback.tap()
                        showProfileDetailsSheet = true
                    },
                    onRequestBranchChange = {
                        feedback.tap()
                        branchRequestError = null
                        scope.launch {
                            try {
                                val fromApi = jobsVm.listStoresForBranchRequest()
                                val known = branches.map {
                                    BranchOption(id = it.id, name = it.name, city = it.city)
                                }
                                branchStores = (fromApi + known)
                                    .distinctBy { it.id }
                                    .filter { it.id.isNotBlank() }
                                showBranchRequest = true
                            } catch (e: Exception) {
                                feedback.error()
                                branchRequestError = e.message ?: "Could not load branches"
                            }
                        }
                    },
                )

                // 3. Pastel Mint "On duty" Status Card with Delivery Scooter
                DutyStatusCard(
                    isOnline = jobsState.isOnline,
                    isLoading = jobsState.dutyLoading,
                    onToggleDuty = { online ->
                        feedback.tap()
                        if (online) {
                            jobsVm.setOnline(true)
                            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.UPSIDE_DOWN_CAKE &&
                                !lk.bingchun.delivery.core.BcNotifications.canUseFullScreenIntent(context) &&
                                !fsiPrefs.getBoolean("fsi_prompt_shown", false)
                            ) {
                                fsiPrefs.edit().putBoolean("fsi_prompt_shown", true).apply()
                                showJobAlerts = true
                            }
                        } else {
                            showOffDutyConfirm = true
                        }
                    },
                )
                jobsState.dutyError?.let { err ->
                    Text(
                        err,
                        style = BcType.caption,
                        color = colors.errorSoft,
                    )
                }

                // 4. Shift History Action Card
                NavigationActionCard(
                    icon = Icons.Outlined.Schedule,
                    iconBg = if (colors.isDark) Color(0xFF1E293B) else Color(0xFFE0EDFD),
                    iconTint = if (colors.isDark) Color(0xFF60A5FA) else Color(0xFF2563EB),
                    title = "Shift history",
                    subtitle = "See when you went on and off duty",
                    onClick = {
                        feedback.tap()
                        showShiftHistory = true
                        shiftHistoryError = null
                        shiftHistoryLoading = true
                        scope.launch {
                            try {
                                shiftHistory = jobsVm.getShiftHistory()
                            } catch (e: Exception) {
                                shiftHistoryError = e.message ?: "Could not load shift history"
                            } finally {
                                shiftHistoryLoading = false
                            }
                        }
                    },
                )

                // 5. Job Alerts Action Card
                NavigationActionCard(
                    icon = Icons.Outlined.Notifications,
                    iconBg = if (colors.isDark) Color(0xFF3B1E22) else Color(0xFFFDE8E8),
                    iconTint = if (colors.isDark) Color(0xFFF87171) else Color(0xFFDC2626),
                    title = "Job alerts",
                    subtitle = "Notification settings for new jobs",
                    onClick = {
                        feedback.tap()
                        showJobAlerts = true
                    },
                )

                // 6. Section: Appearance
                SectionHeader(title = "Appearance")
                AppearanceThemeCard(
                    themeMode = themeMode,
                    onSelectTheme = { isDark ->
                        feedback.tap()
                        RuntimeConfig.themeMode = if (isDark) "DARK" else "LIGHT"
                    },
                )

                // 7. Section: Feedback
                SectionHeader(title = "Feedback")
                FeedbackCard(
                    soundOn = soundOn,
                    hapticsOn = hapticsOn,
                    onSoundToggle = {
                        feedback.tap()
                        RuntimeConfig.soundEnabled = it
                    },
                    onHapticsToggle = {
                        feedback.tap()
                        RuntimeConfig.hapticsEnabled = it
                    },
                )

                // 8. Section: Vehicle
                SectionHeader(title = "Vehicle")
                VehicleBreakdownCard(
                    isOnline = jobsState.isOnline,
                    onReportFailure = {
                        feedback.tap()
                        vehicleFailureError = null
                        showVehicleFailure = true
                    },
                )

                // 9. Sign Out Button
                SignOutCard(
                    onSignOut = {
                        feedback.tap()
                        val startedRide = setOf("IN_PROGRESS", "RETURNING")
                        val onRide = jobsState.jobs.any { it.status in startedRide } ||
                            jobsState.activeJobDetail?.status in startedRide
                        if (onRide) {
                            feedback.error()
                            showSignOutBlocked = true
                        } else {
                            authViewModel.logout()
                        }
                    },
                )

                // Bottom breathing room
                Spacer(Modifier.height(32.dp))
                }
            }
        }
    }

    // Server URL Dialog for debugging / server configuration
    if (showServer) {
        ServerUrlDialog(onDismiss = { showServer = false })
    }

    // Shift History Bottom Sheet
    if (showShiftHistory) {
        ShiftHistorySheet(
            shifts = shiftHistory,
            loading = shiftHistoryLoading,
            error = shiftHistoryError,
            onDismiss = { showShiftHistory = false },
        )
    }

    // Job Alerts Bottom Sheet
    if (showJobAlerts) {
        JobAlertsSheet(onDismiss = { showJobAlerts = false })
    }

    // Profile details & rider reviews bottom sheet (accessible by tapping profile card)
    if (showProfileDetailsSheet) {
        ProfileDetailsSheet(
            driverName = driverName,
            avatarInitial = avatarInitial,
            profilePhotoUrl = profile?.profilePhotoUrl,
            meritPoints = meritPoints,
            meritStatus = meritStatus,
            phone = profile?.phone,
            nicNumber = profile?.nicNumber,
            vehicleNumber = profile?.vehicleNumber,
            vehicleType = profile?.vehicleType,
            vehicleColor = profile?.vehicleColor,
            licenseNumber = profile?.licenseNumber,
            licenseImageUrl = profile?.licenseImageUrl,
            address = profile?.address,
            disabilities = profile?.disabilities,
            consecutiveSuccessfulDeliveries = profile?.consecutiveSuccessfulDeliveries,
            branches = branches,
            myBranchRequests = myBranchRequests,
            ratings = statsState.ratings,
            ratingsLoading = statsState.ratingsLoading,
            ratingsAverage = statsState.ratingsAverage ?: jobsState.profile?.avgRating,
            ratingsCount = statsState.ratingsCount ?: jobsState.profile?.ratingCount,
            onDismiss = { showProfileDetailsSheet = false },
        )
    }

    // Branch Request Bottom Sheet
    if (showBranchRequest) {
        val accessibleIds = remember(jobsState.profile, auth.driver, branches) {
            branches.map { it.id }.filter { it.isNotBlank() }.toSet()
        }
        val homeId = jobsState.profile?.storeId ?: auth.driver?.storeId
        BranchRequestSheet(
            stores = branchStores,
            accessibleStoreIds = accessibleIds,
            homeStoreId = homeId,
            submitting = branchRequestSubmitting,
            submitError = branchRequestError,
            onDismiss = { if (!branchRequestSubmitting) showBranchRequest = false },
            onSubmit = { type, toStoreId, reason ->
                branchRequestSubmitting = true
                branchRequestError = null
                jobsVm.createBranchRequest(
                    type = type,
                    toStoreId = toStoreId,
                    reason = reason,
                    onDone = {
                        branchRequestSubmitting = false
                        showBranchRequest = false
                        branchRequestError = null
                        feedback.success()
                        scope.launch {
                            try {
                                myBranchRequests = jobsVm.listMyBranchRequests()
                            } catch (_: Exception) { }
                        }
                    },
                    onError = { msg ->
                        branchRequestSubmitting = false
                        feedback.error()
                        branchRequestError = msg
                    },
                )
            },
        )
    }

    if (showSignOutBlocked) {
        AlertDialog(
            onDismissRequest = { showSignOutBlocked = false },
            title = { Text("Can't sign out yet", style = BcType.bodyStrong) },
            text = {
                Text(
                    "Finish this delivery before signing out.",
                    style = BcType.caption,
                    color = colors.textMuted,
                )
            },
            confirmButton = {
                BcButton(label = "OK", onClick = { showSignOutBlocked = false })
            },
        )
    }

    // Off-duty confirmation dialog
    if (showOffDutyConfirm) {
        AlertDialog(
            onDismissRequest = { showOffDutyConfirm = false },
            title = { Text("Stop receiving jobs?", style = BcType.bodyStrong) },
            text = {
                Text(
                    "You will go off duty and stop getting new delivery rides. You can go back on duty from this screen at any time.",
                    style = BcType.caption,
                    color = colors.textMuted,
                )
            },
            confirmButton = {
                BcButton(
                    label = "Go off duty",
                    onClick = {
                        feedback.tap()
                        showOffDutyConfirm = false
                        jobsVm.setOnline(false)
                    },
                )
            },
            dismissButton = {
                BcOutlineButton(label = "Stay on duty", onClick = { showOffDutyConfirm = false })
            },
        )
    }

    // Vehicle breakdown dialog
    if (showVehicleFailure) {
        VehicleFailureDialog(
            submitting = vehicleFailureSubmitting,
            submitError = vehicleFailureError,
            onDismiss = { if (!vehicleFailureSubmitting) showVehicleFailure = false },
            onSubmit = { note ->
                vehicleFailureSubmitting = true
                vehicleFailureError = null
                jobsVm.reportVehicleFailure(
                    note = note,
                    onDone = {
                        vehicleFailureSubmitting = false
                        showVehicleFailure = false
                        feedback.success()
                    },
                    onError = { msg ->
                        vehicleFailureSubmitting = false
                        feedback.error()
                        vehicleFailureError = msg
                    },
                )
            },
        )
    }
}

/**
 * Curved Deep Navy Blue Header with Settings gear icon.
 */
@Composable
private fun MeHeader(
    onSettingsClick: () -> Unit,
) {
    BcLightStatusBarIcons()
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(lk.bingchun.delivery.ui.components.BcWaveBottom)
            .background(lk.bingchun.delivery.ui.theme.heroGradient(true))
            .statusBarsPadding()
            .padding(horizontal = 20.dp)
            .padding(top = 16.dp, bottom = 38.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Driver Profile",
                    style = lk.bingchun.delivery.ui.theme.BcType.title,
                    color = Color.White,
                )
                Spacer(modifier = Modifier.height(3.dp))
                Text(
                    text = "Manage your account, branch & preferences",
                    style = lk.bingchun.delivery.ui.theme.BcType.caption,
                    color = Color.White.copy(alpha = 0.75f),
                )
            }

            IconButton(
                onClick = onSettingsClick,
                modifier = Modifier.size(36.dp),
            ) {
                Icon(
                    Icons.Outlined.Settings,
                    contentDescription = "Settings",
                    tint = Color.White,
                    modifier = Modifier.size(22.dp),
                )
            }
        }
    }
}

/**
 * Floating Profile Card matching the exact layout in the design mockup:
 * Avatar, Crown Merit Pill, Branch details, Chevron, and Request Branch Change button.
 */
@Composable
private fun DriverProfileCard(
    driverName: String,
    avatarInitial: String,
    profilePhotoUrl: String?,
    meritPoints: Int?,
    meritStatus: String?,
    storeName: String?,
    storeCity: String?,
    avgRating: Double?,
    ratingCount: Int?,
    onCardClick: () -> Unit,
    onRequestBranchChange: () -> Unit,
) {
    val colors = LocalBcColors.current
    val branchLine = listOfNotNull(storeName, storeCity).joinToString(" · ").ifBlank { "—" }
    lk.bingchun.delivery.ui.components.BcCard(
        modifier = Modifier.fillMaxWidth(),
        contentPadding = PaddingValues(16.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = onCardClick,
                    ),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                DriverAvatar(
                    profilePhotoUrl = profilePhotoUrl,
                    initials = avatarInitial,
                    size = 52.dp,
                )
                Spacer(Modifier.width(14.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = driverName,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.text,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = branchLine,
                        fontSize = 13.sp,
                        color = colors.textMuted,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        text = meritLabel(meritPoints, meritStatus),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = colors.brand,
                        modifier = Modifier
                            .clip(CircleShape)
                            .background(colors.brandSubtle)
                            .padding(horizontal = 10.dp, vertical = 4.dp),
                    )
                    if (avgRating != null) {
                        Spacer(Modifier.height(6.dp))
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Outlined.Star,
                                contentDescription = null,
                                tint = colors.warning,
                                modifier = Modifier.size(14.dp),
                            )
                            Spacer(Modifier.width(4.dp))
                            Text(
                                text = ratingLine(avgRating, ratingCount),
                                fontSize = 12.sp,
                                color = colors.text,
                                fontWeight = FontWeight.Medium,
                            )
                        }
                    }
                }
                Icon(
                    Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                    contentDescription = "Details",
                    tint = colors.textMuted,
                    modifier = Modifier.size(20.dp),
                )
            }

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(colors.brandSubtle)
                    .border(1.dp, colors.brand.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                    .clickable(onClick = onRequestBranchChange)
                    .padding(horizontal = 14.dp, vertical = 11.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        Icons.Outlined.SwapHoriz,
                        contentDescription = null,
                        tint = colors.brand,
                        modifier = Modifier.size(18.dp),
                    )
                    Text(
                        text = "Request branch change",
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = colors.brand,
                    )
                }
                Icon(
                    Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                    contentDescription = null,
                    tint = colors.brand,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
    }
}

private fun meritLabel(points: Int?, status: String?): String {
    val standing = status?.takeIf { it.isNotBlank() }?.uppercase()
    return when {
        points == null && standing == null -> "—"
        points != null && standing != null -> "Merit $points · $standing"
        points != null -> "Merit $points"
        else -> standing ?: "—"
    }
}

private fun ratingLine(average: Double, count: Int?): String {
    val score = "%.1f".format(average)
    val reviews = count ?: 0
    return if (reviews > 0) "$score · $reviews reviews" else score
}

/**
 * Pastel Mint "On duty" Status Card with delivery scooter illustration and blue toggle switch.
 */
@Composable
private fun DutyStatusCard(
    isOnline: Boolean,
    isLoading: Boolean,
    onToggleDuty: (Boolean) -> Unit,
) {
    val colors = LocalBcColors.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(
                Brush.horizontalGradient(
                    if (colors.isDark) {
                        listOf(
                            Color(0xFF064E3B).copy(alpha = 0.35f),
                            Color(0xFF022C22).copy(alpha = 0.45f),
                        )
                    } else {
                        listOf(
                            Color(0xFFECFDF5),
                            Color(0xFFE2F8EE),
                        )
                    },
                ),
            )
            .border(
                BorderStroke(
                    1.dp,
                    if (colors.isDark) Color(0xFF065F46) else Color(0xFFA7F3D0),
                ),
                RoundedCornerShape(20.dp),
            )
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            // Left Status
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(
                                if (isOnline) Color(0xFF10B981) else (if (colors.isDark) Color(0xFF64748B) else Color(0xFF94A3B8)),
                            ),
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        text = if (isOnline) "On duty" else "Off duty",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.text,
                    )
                }
                Spacer(Modifier.height(3.dp))
                Text(
                    text = if (isOnline) "Ready to receive jobs" else "You're not receiving new jobs",
                    fontSize = 12.5.sp,
                    color = colors.textMuted,
                )
            }

            // Center: Scooter Artwork
            ScooterIllustration(
                modifier = Modifier
                    .size(width = 86.dp, height = 48.dp)
                    .padding(horizontal = 4.dp),
            )

            // Right: Royal Blue Toggle Switch matching mockup
            Switch(
                checked = isOnline,
                onCheckedChange = onToggleDuty,
                enabled = !isLoading,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = if (colors.isDark) colors.brand else Color(0xFF0A58CA),
                    uncheckedThumbColor = if (colors.isDark) Color(0xFF64748B) else Color(0xFF94A3B8),
                    uncheckedTrackColor = if (colors.isDark) Color(0xFF334155) else Color(0xFFCBD5E1),
                ),
            )
        }
    }
}

/**
 * Reusable Action Item Card with tinted icon container, title, subtitle, and chevron.
 */
@Composable
private fun NavigationActionCard(
    icon: ImageVector,
    iconBg: Color,
    iconTint: Color,
    title: String,
    subtitle: String,
    onClick: () -> Unit,
) {
    val colors = LocalBcColors.current
    lk.bingchun.delivery.ui.components.BcCard(
        modifier = Modifier.fillMaxWidth(),
        onClick = onClick,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.weight(1f),
            ) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(RoundedCornerShape(13.dp))
                        .background(iconBg),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        icon,
                        contentDescription = null,
                        tint = iconTint,
                        modifier = Modifier.size(22.dp),
                    )
                }
                Column {
                    Text(
                        text = title,
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = colors.text,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = subtitle,
                        fontSize = 12.5.sp,
                        color = colors.textMuted,
                    )
                }
            }

            Icon(
                Icons.AutoMirrored.Outlined.KeyboardArrowRight,
                contentDescription = null,
                tint = colors.textMuted,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}

/**
 * Section title label.
 */
@Composable
private fun SectionHeader(title: String) {
    val colors = LocalBcColors.current
    Text(
        text = title,
        fontSize = 13.5.sp,
        fontWeight = FontWeight.SemiBold,
        color = colors.textMuted,
        modifier = Modifier.padding(start = 4.dp, top = 6.dp),
    )
}

/**
 * Appearance Card with App Theme and dual Light/Dark segmented toggle.
 */
@Composable
private fun AppearanceThemeCard(
    themeMode: String,
    onSelectTheme: (Boolean) -> Unit,
) {
    val colors = LocalBcColors.current
    val isDark = themeMode.equals("DARK", ignoreCase = true)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(colors.card)
            .border(BorderStroke(1.dp, colors.border), RoundedCornerShape(20.dp))
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier.weight(1f),
            ) {
                Box(
                    modifier = Modifier
                        .size(42.dp)
                        .clip(RoundedCornerShape(13.dp))
                        .background(if (colors.isDark) Color(0xFF2E2415) else Color(0xFFFEF3C7)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        Icons.Outlined.LightMode,
                        contentDescription = null,
                        tint = if (colors.isDark) Color(0xFFFBBF24) else Color(0xFFD97706),
                        modifier = Modifier.size(22.dp),
                    )
                }
                Column {
                    Text(
                        text = "App theme",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = colors.text,
                    )
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = "Choose your preferred appearance",
                        fontSize = 12.5.sp,
                        color = colors.textMuted,
                    )
                }
            }

            // Dual Segmented Pill: [ Light | Dark ]
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(22.dp))
                    .background(if (colors.isDark) Color(0xFF1E293B) else Color(0xFFEFF3F8))
                    .padding(3.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Light Pill
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(if (!isDark) (if (colors.isDark) colors.brand else Color(0xFF0A58CA)) else Color.Transparent)
                            .clickable { onSelectTheme(false) }
                            .padding(horizontal = 16.dp, vertical = 7.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "Light",
                            fontSize = 13.sp,
                            fontWeight = if (!isDark) FontWeight.Bold else FontWeight.Medium,
                            color = if (!isDark) Color.White else colors.textMuted,
                        )
                    }

                    // Dark Pill
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(20.dp))
                            .background(if (isDark) (if (colors.isDark) colors.brand else Color(0xFF0A58CA)) else Color.Transparent)
                            .clickable { onSelectTheme(true) }
                            .padding(horizontal = 16.dp, vertical = 7.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        Text(
                            text = "Dark",
                            fontSize = 13.sp,
                            fontWeight = if (isDark) FontWeight.Bold else FontWeight.Medium,
                            color = if (isDark) Color.White else colors.textMuted,
                        )
                    }
                }
            }
        }
    }
}

/**
 * Feedback Card housing Sounds and Haptics toggles with a soft divider.
 */
@Composable
private fun FeedbackCard(
    soundOn: Boolean,
    hapticsOn: Boolean,
    onSoundToggle: (Boolean) -> Unit,
    onHapticsToggle: (Boolean) -> Unit,
) {
    val colors = LocalBcColors.current
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(colors.card)
            .border(BorderStroke(1.dp, colors.border), RoundedCornerShape(20.dp))
            .padding(horizontal = 16.dp, vertical = 6.dp),
    ) {
        Column {
            // Row 1: Sounds
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(RoundedCornerShape(13.dp))
                            .background(if (colors.isDark) Color(0xFF2E1065).copy(alpha = 0.45f) else Color(0xFFEDE9FE)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.AutoMirrored.Outlined.VolumeUp,
                            contentDescription = null,
                            tint = if (colors.isDark) Color(0xFFA78BFA) else Color(0xFF7C3AED),
                            modifier = Modifier.size(22.dp),
                        )
                    }
                    Column {
                        Text(
                            text = "Sounds",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = colors.text,
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = "Job alerts and completion tones",
                            fontSize = 12.5.sp,
                            color = colors.textMuted,
                        )
                    }
                }

                Switch(
                    checked = soundOn,
                    onCheckedChange = onSoundToggle,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Color.White,
                        checkedTrackColor = if (colors.isDark) colors.brand else Color(0xFF0A58CA),
                        uncheckedThumbColor = if (colors.isDark) Color(0xFF64748B) else Color(0xFF94A3B8),
                        uncheckedTrackColor = if (colors.isDark) Color(0xFF334155) else Color(0xFFCBD5E1),
                    ),
                )
            }

            HorizontalDivider(
                color = colors.border,
                thickness = 1.dp,
                modifier = Modifier.padding(start = 56.dp),
            )

            // Row 2: Haptics
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                    modifier = Modifier.weight(1f),
                ) {
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(RoundedCornerShape(13.dp))
                            .background(if (colors.isDark) Color(0xFF064E3B).copy(alpha = 0.45f) else Color(0xFFDCFCE7)),
                        contentAlignment = Alignment.Center,
                    ) {
                        Icon(
                            Icons.Outlined.Vibration,
                            contentDescription = null,
                            tint = if (colors.isDark) Color(0xFF34D399) else Color(0xFF16A34A),
                            modifier = Modifier.size(22.dp),
                        )
                    }
                    Column {
                        Text(
                            text = "Haptics",
                            fontSize = 15.sp,
                            fontWeight = FontWeight.SemiBold,
                            color = colors.text,
                        )
                        Spacer(Modifier.height(2.dp))
                        Text(
                            text = "For claim, start, verify, and errors",
                            fontSize = 12.5.sp,
                            color = colors.textMuted,
                        )
                    }
                }

                Switch(
                    checked = hapticsOn,
                    onCheckedChange = onHapticsToggle,
                    colors = SwitchDefaults.colors(
                        checkedThumbColor = Color.White,
                        checkedTrackColor = if (colors.isDark) colors.brand else Color(0xFF0A58CA),
                        uncheckedThumbColor = if (colors.isDark) Color(0xFF64748B) else Color(0xFF94A3B8),
                        uncheckedTrackColor = if (colors.isDark) Color(0xFF334155) else Color(0xFFCBD5E1),
                    ),
                )
            }
        }
    }
}

/**
 * Pastel Red Vehicle Breakdown Card with pill button matching the mockup.
 */
@Composable
private fun VehicleBreakdownCard(
    isOnline: Boolean,
    onReportFailure: () -> Unit,
) {
    val colors = LocalBcColors.current
    val bg = if (colors.isDark) Color(0xFF2A1417) else Color(0xFFFEF2F2)
    val borderCol = if (colors.isDark) Color(0xFF4A1B22) else Color(0xFFFEE2E2)
    val iconBg = if (colors.isDark) Color(0xFF3E171E) else Color(0xFFFEE2E2)
    val iconTint = if (colors.isDark) Color(0xFFF87171) else Color(0xFFDC2626)
    val titleCol = if (colors.isDark) Color(0xFFFCA5A5) else Color(0xFF991B1B)
    val descCol = if (colors.isDark) Color(0xFFF87171).copy(alpha = 0.85f) else Color(0xFF7F1D1D).copy(alpha = 0.85f)
    val pillBg = if (colors.isDark) Color(0xFF3E171E) else Color(0xFFFEE2E2)
    val pillBorder = if (colors.isDark) Color(0xFF5A1D27) else Color(0xFFFECACA)
    val pillTint = if (isOnline) (if (colors.isDark) Color(0xFFFCA5A5) else Color(0xFFB91C1C)) else Color(0xFF9CA3AF)

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(bg)
            .border(BorderStroke(1.dp, borderCol), RoundedCornerShape(20.dp))
            .padding(14.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            // Left Wrench Icon
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(13.dp))
                    .background(iconBg),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    Icons.Outlined.Build,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(20.dp),
                )
            }

            // Description
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Vehicle broke down?",
                    fontSize = 14.5.sp,
                    fontWeight = FontWeight.Bold,
                    color = titleCol,
                )
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "Report it so admin can send another rider and knows where to find you.",
                    fontSize = 11.5.sp,
                    color = descCol,
                    lineHeight = 15.sp,
                )
            }

            // Pill Button: "Report vehicle failure ->"
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(20.dp))
                    .background(pillBg)
                    .border(1.dp, pillBorder, RoundedCornerShape(20.dp))
                    .clickable(enabled = isOnline, onClick = onReportFailure)
                    .padding(horizontal = 10.dp, vertical = 7.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Text(
                        text = "Report vehicle failure",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = pillTint,
                    )
                    Icon(
                        Icons.AutoMirrored.Outlined.ArrowForward,
                        contentDescription = null,
                        tint = pillTint,
                        modifier = Modifier.size(12.dp),
                    )
                }
            }
        }
    }
}

/**
 * Centered Sign Out Card Button with red icon and text.
 */
@Composable
private fun SignOutCard(
    onSignOut: () -> Unit,
) {
    val colors = LocalBcColors.current
    val dangerTint = if (colors.isDark) Color(0xFFF87171) else Color(0xFFDC2626)
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(colors.card)
            .border(BorderStroke(1.dp, colors.border), RoundedCornerShape(18.dp))
            .clickable(onClick = onSignOut)
            .padding(vertical = 15.dp),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(
                Icons.AutoMirrored.Outlined.Logout,
                contentDescription = "Sign out",
                tint = dangerTint,
                modifier = Modifier.size(18.dp),
            )
            Text(
                text = "Sign out",
                fontSize = 15.sp,
                fontWeight = FontWeight.Bold,
                color = dangerTint,
            )
        }
    }
}

/**
 * Profile details & rider reviews bottom sheet for viewing rating history and branch requests.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ProfileDetailsSheet(
    driverName: String,
    avatarInitial: String,
    profilePhotoUrl: String?,
    meritPoints: Int?,
    meritStatus: String?,
    phone: String?,
    nicNumber: String?,
    vehicleNumber: String?,
    vehicleType: String?,
    vehicleColor: String?,
    licenseNumber: String?,
    licenseImageUrl: String?,
    address: String?,
    disabilities: String?,
    consecutiveSuccessfulDeliveries: Int?,
    branches: List<lk.bingchun.delivery.data.model.StoreRef>,
    myBranchRequests: List<DriverBranchRequest>,
    ratings: List<lk.bingchun.delivery.data.model.RiderRatingItem>,
    ratingsLoading: Boolean,
    ratingsAverage: Double?,
    ratingsCount: Int?,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val colors = LocalBcColors.current
    val context = LocalContext.current
    var showLicenseFullscreen by remember { mutableStateOf(false) }
    val vehicleLine = listOfNotNull(
        vehicleType?.takeIf { it.isNotBlank() },
        vehicleColor?.takeIf { it.isNotBlank() },
    ).joinToString(" · ")

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = colors.card,
        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .padding(bottom = 36.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                DriverAvatar(
                    profilePhotoUrl = profilePhotoUrl,
                    initials = avatarInitial,
                    size = 56.dp,
                    textSize = 24.sp,
                )
                Spacer(Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = driverName,
                        fontSize = 20.sp,
                        fontWeight = FontWeight.Bold,
                        color = colors.text,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = meritLabel(meritPoints, meritStatus),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.SemiBold,
                        color = colors.brand,
                    )
                    if (ratingsAverage != null) {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = ratingLine(ratingsAverage, ratingsCount),
                            fontSize = 13.sp,
                            color = colors.textMuted,
                        )
                    }
                }
                IconButton(onClick = onDismiss) {
                    Icon(
                        Icons.Outlined.Close,
                        contentDescription = "Close",
                        tint = colors.textMuted,
                    )
                }
            }

            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                phone?.takeIf { it.isNotBlank() }?.let { number ->
                    ProfileInfoRow(
                        label = "Phone",
                        value = number,
                        valueColor = colors.brand,
                        onClick = { Intents.dial(context, number) },
                    )
                }
                nicNumber?.takeIf { it.isNotBlank() }?.let {
                    ProfileInfoRow(label = "NIC", value = it)
                }
                vehicleNumber?.takeIf { it.isNotBlank() }?.let {
                    ProfileInfoRow(label = "Vehicle number", value = it)
                }
                vehicleLine.takeIf { it.isNotBlank() }?.let {
                    ProfileInfoRow(label = "Vehicle", value = it)
                }
                licenseNumber?.takeIf { it.isNotBlank() }?.let {
                    ProfileInfoRow(label = "License number", value = it)
                }
                address?.takeIf { it.isNotBlank() }?.let {
                    ProfileInfoRow(label = "Address", value = it)
                }
                disabilities?.takeIf { it.isNotBlank() }?.let {
                    ProfileInfoRow(label = "Accessibility notes", value = it)
                }
                val streak = consecutiveSuccessfulDeliveries
                if (streak != null && streak > 0) {
                    ProfileInfoRow(
                        label = "Successful delivery streak",
                        value = streak.toString(),
                    )
                }
            }

            if (branches.isNotEmpty()) {
                Text(
                    text = "Branches",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = colors.text,
                )
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    branches.forEach { store ->
                        val line = listOfNotNull(
                            Format.shortBranchName(store.name),
                            store.city?.takeIf { it.isNotBlank() },
                        ).joinToString(" · ")
                        ProfileInfoRow(label = "Branch", value = line)
                    }
                }
            }

            LicenseDocumentSection(
                licenseImageUrl = licenseImageUrl,
                onViewFullscreen = { showLicenseFullscreen = true },
            )

            RiderReviewsSection(
                ratings = ratings.take(8),
                loading = ratingsLoading,
            )

            if (myBranchRequests.isNotEmpty()) {
                Text(
                    text = "Branch requests",
                    fontSize = 15.sp,
                    fontWeight = FontWeight.Bold,
                    color = colors.text,
                )
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    myBranchRequests.forEach { req ->
                        val (statusLabel, statusColor) = branchRequestStatus(req.status, colors)
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(colors.surface)
                                .border(1.dp, colors.border, RoundedCornerShape(12.dp))
                                .padding(12.dp),
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text(
                                    text = "${req.type} · ${req.toStoreName ?: req.toStoreId}",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    color = colors.text,
                                    modifier = Modifier.weight(1f),
                                )
                                Spacer(Modifier.width(8.dp))
                                Text(
                                    text = statusLabel,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = statusColor,
                                )
                            }
                            Text(
                                text = Format.jobDateTime(req.createdAt),
                                fontSize = 11.sp,
                                color = colors.textMuted,
                            )
                        }
                    }
                }
            }
        }
    }

    val licenseFullscreenUrl = licenseImageUrl?.trim()?.takeIf { it.isNotBlank() }
    if (showLicenseFullscreen && licenseFullscreenUrl != null) {
        LicenseImageFullscreenDialog(
            imageUrl = licenseFullscreenUrl,
            onDismiss = { showLicenseFullscreen = false },
        )
    }
}

@Composable
private fun LicenseDocumentSection(
    licenseImageUrl: String?,
    onViewFullscreen: () -> Unit,
) {
    val colors = LocalBcColors.current
    val url = licenseImageUrl?.trim()?.takeIf { it.isNotBlank() }
    var licenseLoadFailed by remember(url) { mutableStateOf(false) }
    Text(
        text = "License document",
        fontSize = 15.sp,
        fontWeight = FontWeight.Bold,
        color = colors.text,
    )
    if (url == null) {
        Text(
            text = "Not uploaded yet",
            fontSize = 13.sp,
            color = colors.textMuted,
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(colors.surface)
                .border(1.dp, colors.border, RoundedCornerShape(14.dp))
                .padding(14.dp),
        )
    } else {
        AsyncImage(
            model = url,
            contentDescription = "Driving license",
            modifier = Modifier
                .fillMaxWidth()
                .aspectRatio(16f / 10f)
                .clip(RoundedCornerShape(14.dp))
                .border(1.dp, colors.border, RoundedCornerShape(14.dp))
                .clickable(onClick = onViewFullscreen),
            contentScale = ContentScale.Crop,
            onError = { licenseLoadFailed = true },
            onSuccess = { licenseLoadFailed = false },
        )
        Text(
            text = if (licenseLoadFailed) "Could not load license" else "Tap to view full size",
            fontSize = 12.sp,
            color = if (licenseLoadFailed) colors.danger else colors.textMuted,
        )
    }
}

@Composable
private fun LicenseImageFullscreenDialog(
    imageUrl: String,
    onDismiss: () -> Unit,
) {
    val colors = LocalBcColors.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("License document", style = BcType.bodyStrong) },
        text = {
            var licenseLoadFailed by remember(imageUrl) { mutableStateOf(false) }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                AsyncImage(
                    model = imageUrl,
                    contentDescription = "Driving license full size",
                    modifier = Modifier
                        .fillMaxWidth()
                        .aspectRatio(3f / 4f)
                        .clip(RoundedCornerShape(12.dp)),
                    contentScale = ContentScale.Fit,
                    onError = { licenseLoadFailed = true },
                    onSuccess = { licenseLoadFailed = false },
                )
                if (licenseLoadFailed) {
                    Text(
                        text = "Could not load license",
                        fontSize = 12.sp,
                        color = colors.danger,
                    )
                }
            }
        },
        confirmButton = {
            BcOutlineButton(label = "Close", onClick = onDismiss)
        },
        containerColor = colors.card,
    )
}

@Composable
private fun ProfileInfoRow(
    label: String,
    value: String,
    valueColor: Color? = null,
    onClick: (() -> Unit)? = null,
) {
    val colors = LocalBcColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(colors.surface)
            .border(1.dp, colors.border, RoundedCornerShape(14.dp))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(14.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, fontSize = 13.sp, color = colors.textMuted)
        Spacer(Modifier.width(12.dp))
        Text(
            value,
            fontSize = 13.sp,
            fontWeight = FontWeight.SemiBold,
            color = valueColor ?: colors.text,
        )
    }
}

private fun branchRequestStatus(status: String, colors: lk.bingchun.delivery.ui.theme.BcColorScheme): Pair<String, Color> {
    return when (status.uppercase()) {
        "APPROVED" -> "Approved" to colors.success
        "REJECTED" -> "Rejected" to colors.danger
        "PENDING" -> "Pending" to colors.brand
        else -> status.lowercase().replaceFirstChar { it.uppercase() } to colors.brand
    }
}
