package lk.bingchun.delivery.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import lk.bingchun.delivery.ui.theme.LocalBcColors

@Composable
fun DriverAvatar(
    profilePhotoUrl: String?,
    initials: String,
    modifier: Modifier = Modifier,
    size: Dp = 52.dp,
    textSize: TextUnit = 22.sp,
) {
    val colors = LocalBcColors.current
    val initial = initials.trim().take(1).uppercase().ifBlank { "D" }
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(colors.brandSubtle),
        contentAlignment = Alignment.Center,
    ) {
        val url = profilePhotoUrl?.trim()?.takeIf { it.isNotBlank() }
        if (url != null) {
            AsyncImage(
                model = url,
                contentDescription = "Profile photo",
                modifier = Modifier
                    .fillMaxSize()
                    .clip(CircleShape),
                contentScale = ContentScale.Crop,
            )
        } else {
            Text(
                text = initial,
                fontSize = textSize,
                fontWeight = FontWeight.Bold,
                color = colors.brand,
            )
        }
    }
}
