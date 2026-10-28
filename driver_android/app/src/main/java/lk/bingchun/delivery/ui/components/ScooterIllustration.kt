package lk.bingchun.delivery.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/**
 * Line-art delivery scooter with rear carrier box in pastel green/mint tones,
 * matching the "On duty" card illustration in the design mockup.
 */
@Composable
fun ScooterIllustration(
    modifier: Modifier = Modifier.size(width = 96.dp, height = 56.dp),
    primaryColor: Color = Color(0xFF34D399),
    accentColor: Color = Color(0xFFA7F3D0),
    strokeColor: Color = Color(0xFF10B981),
) {
    Canvas(modifier = modifier) {
        val w = size.width
        val h = size.height
        val strokeWidth = 2.dp.toPx()
        val thinStroke = 1.2.dp.toPx()

        // Soft cloud / motion wave behind the scooter
        val cloudPath = Path().apply {
            moveTo(w * 0.15f, h * 0.72f)
            quadraticTo(w * 0.45f, h * 0.52f, w * 0.75f, h * 0.65f)
            quadraticTo(w * 0.95f, h * 0.70f, w, h * 0.78f)
        }
        drawPath(
            cloudPath,
            accentColor.copy(alpha = 0.5f),
            style = Stroke(width = 3.dp.toPx()),
        )

        // Rear Wheel (left-center)
        val rearWheelCenter = Offset(w * 0.28f, h * 0.78f)
        val wheelRadius = h * 0.18f
        // Tire fill
        drawCircle(
            color = accentColor.copy(alpha = 0.6f),
            radius = wheelRadius,
            center = rearWheelCenter,
        )
        // Tire stroke
        drawCircle(
            color = strokeColor,
            radius = wheelRadius,
            center = rearWheelCenter,
            style = Stroke(width = strokeWidth),
        )
        // Hub
        drawCircle(
            color = strokeColor,
            radius = wheelRadius * 0.35f,
            center = rearWheelCenter,
        )

        // Front Wheel (right)
        val frontWheelCenter = Offset(w * 0.78f, h * 0.78f)
        drawCircle(
            color = accentColor.copy(alpha = 0.6f),
            radius = wheelRadius,
            center = frontWheelCenter,
        )
        drawCircle(
            color = strokeColor,
            radius = wheelRadius,
            center = frontWheelCenter,
            style = Stroke(width = strokeWidth),
        )
        drawCircle(
            color = strokeColor,
            radius = wheelRadius * 0.35f,
            center = frontWheelCenter,
        )

        // Scooter Body Frame / Footboard
        val bodyPath = Path().apply {
            // From rear axle up to seat base
            moveTo(rearWheelCenter.x, rearWheelCenter.y)
            lineTo(w * 0.32f, h * 0.58f)
            // Seat dip
            lineTo(w * 0.46f, h * 0.58f)
            // Footboard step down
            lineTo(w * 0.50f, h * 0.72f)
            lineTo(w * 0.64f, h * 0.72f)
            // Steering column up
            lineTo(w * 0.70f, h * 0.36f)
            // Handlebar
            lineTo(w * 0.66f, h * 0.30f)
        }
        drawPath(
            bodyPath,
            strokeColor,
            style = Stroke(width = strokeWidth),
        )

        // Front fork to wheel
        drawLine(
            color = strokeColor,
            start = Offset(w * 0.70f, h * 0.44f),
            end = frontWheelCenter,
            strokeWidth = strokeWidth,
        )

        // Front Apron / Shield
        val shieldPath = Path().apply {
            moveTo(w * 0.66f, h * 0.34f)
            quadraticTo(w * 0.77f, h * 0.48f, w * 0.73f, h * 0.68f)
            lineTo(w * 0.64f, h * 0.70f)
        }
        drawPath(
            shieldPath,
            primaryColor.copy(alpha = 0.75f),
            style = Fill,
        )
        drawPath(
            shieldPath,
            strokeColor,
            style = Stroke(width = strokeWidth),
        )

        // Seat
        val seatPath = Path().apply {
            moveTo(w * 0.34f, h * 0.54f)
            quadraticTo(w * 0.44f, h * 0.50f, w * 0.50f, h * 0.54f)
            lineTo(w * 0.48f, h * 0.58f)
            lineTo(w * 0.35f, h * 0.58f)
            close()
        }
        drawPath(
            seatPath,
            strokeColor,
            style = Fill,
        )

        // Rear Delivery Carrier Box (Matching Bing Chun delivery food box)
        val boxWidth = w * 0.26f
        val boxHeight = h * 0.30f
        val boxLeft = w * 0.16f
        val boxTop = h * 0.28f

        val boxRoundRect = RoundRect(
            left = boxLeft,
            top = boxTop,
            right = boxLeft + boxWidth,
            bottom = boxTop + boxHeight,
            cornerRadius = CornerRadius(4.dp.toPx(), 4.dp.toPx()),
        )
        val boxPath = Path().apply { addRoundRect(boxRoundRect) }
        drawPath(boxPath, accentColor.copy(alpha = 0.9f), style = Fill)
        drawPath(boxPath, strokeColor, style = Stroke(width = strokeWidth))

        // Small lid line on box
        drawLine(
            color = strokeColor,
            start = Offset(boxLeft, boxTop + boxHeight * 0.28f),
            end = Offset(boxLeft + boxWidth, boxTop + boxHeight * 0.28f),
            strokeWidth = thinStroke,
        )

        // Headlight beam / accent dot
        drawCircle(
            color = Color(0xFFFDE047),
            radius = 2.5.dp.toPx(),
            center = Offset(w * 0.75f, h * 0.38f),
        )
    }
}
