package lk.bingchun.delivery.ui.screens

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Visibility
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.Image
import lk.bingchun.delivery.R
import lk.bingchun.delivery.core.LocalBcFeedback
import lk.bingchun.delivery.core.RuntimeConfig
import lk.bingchun.delivery.data.model.BranchOption
import lk.bingchun.delivery.ui.AuthViewModel
import lk.bingchun.delivery.ui.components.BcButton
import lk.bingchun.delivery.ui.components.BcCard
import lk.bingchun.delivery.ui.components.BcTextField
import lk.bingchun.delivery.ui.components.BcWaveBottom
import lk.bingchun.delivery.ui.theme.BcLightStatusBarIcons
import lk.bingchun.delivery.ui.theme.BcRadius
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors
import lk.bingchun.delivery.ui.theme.heroGradient
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation

private const val PIN_MIN = 3
private const val PIN_MAX = 12

@Composable
fun LoginScreen(authViewModel: AuthViewModel) {
    val auth by authViewModel.state.collectAsState()
    val colors = LocalBcColors.current
    val feedback = LocalBcFeedback.current
    var pin by remember { mutableStateOf("") }
    var pinVisible by remember { mutableStateOf(false) }
    var logoTaps by remember { mutableIntStateOf(0) }
    var showServer by remember { mutableStateOf(false) }
    var appeared by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) { appeared = true }
    LaunchedEffect(auth.error) { if (auth.error != null) feedback.error() }
    LaunchedEffect(auth.isAuthenticated) { if (auth.isAuthenticated) feedback.success() }

    val logoAlpha by animateFloatAsState(if (appeared) 1f else 0f, label = "logoAlpha")
    val logoScale by animateFloatAsState(if (appeared) 1f else 0.92f, label = "logoScale")

    val pinReady = pin.length in PIN_MIN..PIN_MAX

    // Dark hero panel with the customer app's bottom scoop, white form card beneath.
    BcLightStatusBarIcons()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.background),
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .navigationBarsPadding()
                .imePadding()
                .verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(BcWaveBottom)
                    .background(heroGradient(true))
                    .statusBarsPadding()
                    .padding(horizontal = 24.dp)
                    .padding(top = 36.dp, bottom = 56.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Image(
                    painter = painterResource(R.drawable.logo),
                    contentDescription = "Bing Chun",
                    contentScale = ContentScale.Fit,
                    modifier = Modifier
                        .size(88.dp)
                        .graphicsLayer { scaleX = logoScale; scaleY = logoScale; alpha = logoAlpha }
                        .clip(BcRadius.xlShape)
                        .clickable {
                            if (!lk.bingchun.delivery.BuildConfig.DEBUG) return@clickable
                            logoTaps += 1
                            if (logoTaps >= 5) {
                                logoTaps = 0
                                showServer = true
                            }
                        },
                )
                Spacer(Modifier.height(20.dp))
                Text("Delivery Staff", style = BcType.title, color = colors.white)
                Spacer(Modifier.height(6.dp))
                Text(
                    "Enter your staff PIN to continue",
                    style = BcType.caption,
                    color = colors.white.copy(alpha = 0.75f),
                    textAlign = TextAlign.Center,
                )
            }

            Spacer(Modifier.height(24.dp))

            BcCard(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp)
                    .alpha(logoAlpha),
            ) {
                BcTextField(
                    value = pin,
                    onValueChange = { new ->
                        if (new.length <= PIN_MAX && new.all { it.isDigit() }) {
                            pin = new
                            authViewModel.clearError()
                        }
                    },
                    label = "Staff PIN",
                    placeholder = "Your PIN",
                    isError = auth.error != null,
                    supportingText = auth.error ?: "Any length from $PIN_MIN to $PIN_MAX digits",
                    keyboardType = KeyboardType.NumberPassword,
                    visualTransformation = if (pinVisible) {
                        VisualTransformation.None
                    } else {
                        PasswordVisualTransformation()
                    },
                    trailingIcon = {
                        IconButton(onClick = { pinVisible = !pinVisible }) {
                            Icon(
                                imageVector = if (pinVisible) {
                                    Icons.Outlined.VisibilityOff
                                } else {
                                    Icons.Outlined.Visibility
                                },
                                contentDescription = if (pinVisible) "Hide PIN" else "Show PIN",
                                tint = colors.textMuted,
                            )
                        }
                    },
                )
                Spacer(Modifier.height(16.dp))
                BcButton(
                    label = if (auth.loading) "Signing in…" else "Sign in",
                    loading = auth.loading,
                    enabled = pinReady && !auth.loading,
                    onClick = {
                        feedback.tap()
                        authViewModel.login(pin, RuntimeConfig.storeId)
                    },
                )
            }

            Spacer(Modifier.height(16.dp))
            if (lk.bingchun.delivery.BuildConfig.DEBUG) {
                DemoDriverBox(onFill = { pin = it })
            }
            Spacer(Modifier.height(24.dp))
        }
    }

    if (showServer) {
        ServerUrlDialog(onDismiss = { showServer = false })
    }
}

@Composable
private fun DemoDriverBox(onFill: (String) -> Unit) {
    val colors = LocalBcColors.current
    Text(
        "Demo: tap to fill PIN 123456",
        style = BcType.tiny,
        color = colors.textMuted,
        modifier = Modifier.clickable { onFill("123456") },
    )
}
