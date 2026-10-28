package lk.bingchun.delivery.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/**
 * Visual route line between pickup and delivery stops:
 * Pin icon -> Dashed wavy route line -> Destination circle ring.
 */
@Composable
fun RouteVisualizer(
    modifier: Modifier = Modifier,
    color: Color = Color.White.copy(alpha = 0.65f),
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(36.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Canvas(
            modifier = Modifier
                .fillMaxWidth()
                .height(36.dp)
                .padding(horizontal = 24.dp),
        ) {
            val width = size.width
            val height = size.height
            val midY = height / 2f

            val path = Path().apply {
                moveTo(0f, midY)
                // Smooth wave curve across the card
                cubicTo(
                    width * 0.25f, midY + 8f,
                    width * 0.45f, midY - 10f,
                    width * 0.70f, midY + 4f,
                )
                quadraticTo(
                    width * 0.88f, midY,
                    width, midY,
                )
            }

            drawPath(
                path = path,
                color = color,
                style = Stroke(
                    width = 2.5f.dp.toPx(),
                    pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 10f), 0f),
                ),
            )

            // Destination target ring on the right
            drawCircle(
                color = color,
                radius = 5.5f.dp.toPx(),
                center = Offset(width, midY),
                style = Stroke(width = 2.2f.dp.toPx()),
            )
        }

        // Origin pin icon on the left
        Icon(
            imageVector = Icons.Default.LocationOn,
            contentDescription = null,
            tint = color,
            modifier = Modifier
                .size(24.dp)
                .align(Alignment.CenterStart),
        )
    }
}
