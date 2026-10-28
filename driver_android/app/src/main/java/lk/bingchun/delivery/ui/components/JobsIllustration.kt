package lk.bingchun.delivery.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/**
 * Line-art illustration of a delivery van and parcel boxes matching the empty state design.
 */
@Composable
fun DeliveryIllustration(
    modifier: Modifier = Modifier.size(width = 86.dp, height = 54.dp),
    strokeColor: Color = Color(0xFF2563EB),
    tintColor: Color = Color(0xFFE0E7FF),
) {
    Canvas(modifier = modifier) {
        val strokeWidth = 2.dp.toPx()
        val thinStroke = 1.2.dp.toPx()

        // Background speed/motion lines
        drawLine(
            color = strokeColor.copy(alpha = 0.35f),
            start = Offset(0f, size.height * 0.45f),
            end = Offset(size.width * 0.18f, size.height * 0.45f),
            strokeWidth = thinStroke,
        )
        drawLine(
            color = strokeColor.copy(alpha = 0.35f),
            start = Offset(size.width * 0.04f, size.height * 0.65f),
            end = Offset(size.width * 0.16f, size.height * 0.65f),
            strokeWidth = thinStroke,
        )

        // Small sparkle plus on top left
        val spX = size.width * 0.12f
        val spY = size.height * 0.18f
        drawLine(strokeColor.copy(alpha = 0.5f), Offset(spX - 4f, spY), Offset(spX + 4f, spY), thinStroke)
        drawLine(strokeColor.copy(alpha = 0.5f), Offset(spX, spY - 4f), Offset(spX, spY + 4f), thinStroke)

        // Small circle accent
        drawCircle(
            color = strokeColor.copy(alpha = 0.4f),
            radius = 2.5f.dp.toPx(),
            center = Offset(size.width * 0.72f, size.height * 0.15f),
            style = Stroke(width = thinStroke),
        )

        // Delivery Van Body (outlined)
        val vanLeft = size.width * 0.18f
        val vanTop = size.height * 0.22f
        val vanWidth = size.width * 0.54f
        val vanHeight = size.height * 0.55f

        val vanPath = Path().apply {
            moveTo(vanLeft, vanTop + 6f)
            quadraticTo(vanLeft, vanTop, vanLeft + 6f, vanTop)
            lineTo(vanLeft + vanWidth * 0.65f, vanTop)
            // Windshield slope
            lineTo(vanLeft + vanWidth * 0.85f, vanTop + vanHeight * 0.35f)
            lineTo(vanLeft + vanWidth, vanTop + vanHeight * 0.35f)
            // Front bumper
            lineTo(vanLeft + vanWidth, vanTop + vanHeight)
            lineTo(vanLeft, vanTop + vanHeight)
            close()
        }

        drawPath(
            path = vanPath,
            color = Color.White,
        )
        drawPath(
            path = vanPath,
            color = strokeColor.copy(alpha = 0.7f),
            style = Stroke(width = strokeWidth),
        )

        // Window
        val windowPath = Path().apply {
            moveTo(vanLeft + vanWidth * 0.62f, vanTop + 6f)
            lineTo(vanLeft + vanWidth * 0.80f, vanTop + vanHeight * 0.35f)
            lineTo(vanLeft + vanWidth * 0.55f, vanTop + vanHeight * 0.35f)
            lineTo(vanLeft + vanWidth * 0.55f, vanTop + 6f)
            close()
        }
        drawPath(
            path = windowPath,
            color = strokeColor.copy(alpha = 0.5f),
            style = Stroke(width = thinStroke),
        )

        // Wheels
        val wheelRadius = 5.dp.toPx()
        val wheel1Center = Offset(vanLeft + vanWidth * 0.22f, vanTop + vanHeight + 2f)
        val wheel2Center = Offset(vanLeft + vanWidth * 0.80f, vanTop + vanHeight + 2f)

        drawCircle(color = Color.White, radius = wheelRadius, center = wheel1Center)
        drawCircle(color = strokeColor, radius = wheelRadius, center = wheel1Center, style = Stroke(width = strokeWidth))
        drawCircle(color = Color.White, radius = wheelRadius, center = wheel2Center)
        drawCircle(color = strokeColor, radius = wheelRadius, center = wheel2Center, style = Stroke(width = strokeWidth))

        // Parcel Box in foreground
        val boxLeft = size.width * 0.52f
        val boxTop = size.height * 0.48f
        val boxWidth = size.width * 0.36f
        val boxHeight = size.height * 0.46f

        // Box background fill
        drawRoundRect(
            color = Color.White,
            topLeft = Offset(boxLeft, boxTop),
            size = Size(boxWidth, boxHeight),
            cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx()),
        )
        drawRoundRect(
            color = tintColor,
            topLeft = Offset(boxLeft, boxTop),
            size = Size(boxWidth, boxHeight),
            cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx()),
        )
        // Box outline
        drawRoundRect(
            color = strokeColor,
            topLeft = Offset(boxLeft, boxTop),
            size = Size(boxWidth, boxHeight),
            cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx()),
            style = Stroke(width = strokeWidth),
        )

        // Box tape / flap details
        drawLine(
            color = strokeColor,
            start = Offset(boxLeft + boxWidth * 0.35f, boxTop),
            end = Offset(boxLeft + boxWidth * 0.35f, boxTop + boxHeight * 0.4f),
            strokeWidth = thinStroke,
        )
        drawLine(
            color = strokeColor,
            start = Offset(boxLeft + boxWidth * 0.65f, boxTop),
            end = Offset(boxLeft + boxWidth * 0.65f, boxTop + boxHeight * 0.4f),
            strokeWidth = thinStroke,
        )
        drawLine(
            color = strokeColor,
            start = Offset(boxLeft, boxTop + boxHeight * 0.4f),
            end = Offset(boxLeft + boxWidth, boxTop + boxHeight * 0.4f),
            strokeWidth = thinStroke,
        )
    }
}
