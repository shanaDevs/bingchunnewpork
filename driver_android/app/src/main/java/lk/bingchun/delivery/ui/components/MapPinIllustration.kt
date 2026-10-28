package lk.bingchun.delivery.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp

/**
 * 3D-styled folded map illustration with soft trees, floating blue map pin,
 * and background clouds matching the design mockup.
 */
@Composable
fun MapPinIllustration(
    modifier: Modifier = Modifier.size(width = 180.dp, height = 110.dp),
) {
    Box(
        modifier = modifier,
        contentAlignment = Alignment.Center,
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height

            // --- Background soft clouds ---
            val cloudColor = Color(0xFFE2EDFB)
            // Left small cloud
            drawCircle(cloudColor, radius = 10.dp.toPx(), center = Offset(w * 0.20f, h * 0.40f))
            drawCircle(cloudColor, radius = 7.dp.toPx(), center = Offset(w * 0.25f, h * 0.42f))
            // Right small cloud
            drawCircle(cloudColor, radius = 12.dp.toPx(), center = Offset(w * 0.78f, h * 0.28f))
            drawCircle(cloudColor, radius = 8.dp.toPx(), center = Offset(w * 0.84f, h * 0.30f))

            // --- Soft trees on sides ---
            val treeColor = Color(0xFF99C2EC)
            // Left tree 1
            val leftTree1 = Path().apply {
                moveTo(w * 0.22f, h * 0.70f)
                lineTo(w * 0.20f, h * 0.52f)
                lineTo(w * 0.24f, h * 0.70f)
                close()
            }
            drawPath(leftTree1, treeColor)
            drawCircle(treeColor, radius = 8.dp.toPx(), center = Offset(w * 0.22f, h * 0.54f))

            // Left tree 2 (slightly smaller)
            drawCircle(Color(0xFFB3D4F5), radius = 6.dp.toPx(), center = Offset(w * 0.27f, h * 0.58f))

            // Right tree 1
            drawCircle(Color(0xFFB3D4F5), radius = 6.dp.toPx(), center = Offset(w * 0.72f, h * 0.58f))
            drawCircle(treeColor, radius = 8.dp.toPx(), center = Offset(w * 0.77f, h * 0.54f))

            // --- Folded Map (3 panels in perspective) ---
            // Overall map bounds:
            val mapTop = h * 0.48f
            val mapBottom = h * 0.88f
            val p0x = w * 0.26f // left edge
            val p1x = w * 0.42f // fold 1
            val p2x = w * 0.58f // fold 2
            val p3x = w * 0.74f // right edge

            // Panel 1 (left)
            val panel1 = Path().apply {
                moveTo(p0x, mapTop + 8f)
                lineTo(p1x, mapTop - 12f)
                lineTo(p1x, mapBottom - 12f)
                lineTo(p0x, mapBottom + 8f)
                close()
            }
            drawPath(
                panel1,
                Brush.verticalGradient(
                    listOf(Color(0xFFE3EDF8), Color(0xFFC7DCF3)),
                    startY = mapTop,
                    endY = mapBottom,
                ),
            )

            // Panel 2 (center, angled downward)
            val panel2 = Path().apply {
                moveTo(p1x, mapTop - 12f)
                lineTo(p2x, mapTop + 4f)
                lineTo(p2x, mapBottom + 4f)
                lineTo(p1x, mapBottom - 12f)
                close()
            }
            drawPath(
                panel2,
                Brush.verticalGradient(
                    listOf(Color(0xFFF1F6FC), Color(0xFFD6E6F7)),
                    startY = mapTop,
                    endY = mapBottom,
                ),
            )

            // Panel 3 (right, angled upward)
            val panel3 = Path().apply {
                moveTo(p2x, mapTop + 4f)
                lineTo(p3x, mapTop - 8f)
                lineTo(p3x, mapBottom - 8f)
                lineTo(p2x, mapBottom + 4f)
                close()
            }
            drawPath(
                panel3,
                Brush.verticalGradient(
                    listOf(Color(0xFFDCEAF7), Color(0xFFC2D9F0)),
                    startY = mapTop,
                    endY = mapBottom,
                ),
            )

            // Map grid / road lines (curved subtle white paths)
            val roadColor = Color.White.copy(alpha = 0.85f)
            val roadStroke = 2.dp.toPx()

            // Horizontal road across map
            val road1 = Path().apply {
                moveTo(p0x, mapTop + (mapBottom - mapTop) * 0.45f)
                lineTo(p1x, mapTop - 12f + (mapBottom - mapTop) * 0.45f)
                lineTo(p2x, mapTop + 4f + (mapBottom - mapTop) * 0.45f)
                lineTo(p3x, mapTop - 8f + (mapBottom - mapTop) * 0.45f)
            }
            drawPath(road1, roadColor, style = Stroke(width = roadStroke))

            val road2 = Path().apply {
                moveTo(p0x, mapTop + (mapBottom - mapTop) * 0.72f)
                lineTo(p1x, mapTop - 12f + (mapBottom - mapTop) * 0.72f)
                lineTo(p2x, mapTop + 4f + (mapBottom - mapTop) * 0.72f)
                lineTo(p3x, mapTop - 8f + (mapBottom - mapTop) * 0.72f)
            }
            drawPath(road2, roadColor, style = Stroke(width = roadStroke))

            // Subtle fold highlights
            drawLine(
                Color.White.copy(alpha = 0.9f),
                Offset(p1x, mapTop - 12f),
                Offset(p1x, mapBottom - 12f),
                strokeWidth = 1.5.dp.toPx(),
            )
            drawLine(
                Color(0x22003366),
                Offset(p2x, mapTop + 4f),
                Offset(p2x, mapBottom + 4f),
                strokeWidth = 1.2.dp.toPx(),
            )

            // --- Pin shadow on map ---
            drawOval(
                color = Color(0x33003366),
                topLeft = Offset(w * 0.45f, h * 0.68f),
                size = androidx.compose.ui.geometry.Size(w * 0.10f, 6.dp.toPx()),
            )

            // --- Floating Blue Location Pin in 3D perspective ---
            val pinCenterX = w * 0.50f
            val pinTipY = h * 0.58f
            val pinRadius = 14.dp.toPx()
            val pinHeadCenterY = pinTipY - pinRadius * 1.5f

            val pinPath = Path().apply {
                moveTo(pinCenterX, pinTipY)
                // Left curve up to head
                cubicTo(
                    pinCenterX - pinRadius * 0.95f, pinTipY - pinRadius * 0.7f,
                    pinCenterX - pinRadius, pinHeadCenterY + pinRadius * 0.2f,
                    pinCenterX - pinRadius, pinHeadCenterY,
                )
                // Top circular arc
                cubicTo(
                    pinCenterX - pinRadius, pinHeadCenterY - pinRadius * 1.1f,
                    pinCenterX + pinRadius, pinHeadCenterY - pinRadius * 1.1f,
                    pinCenterX + pinRadius, pinHeadCenterY,
                )
                // Right curve down to tip
                cubicTo(
                    pinCenterX + pinRadius, pinHeadCenterY + pinRadius * 0.2f,
                    pinCenterX + pinRadius * 0.95f, pinTipY - pinRadius * 0.7f,
                    pinCenterX, pinTipY,
                )
                close()
            }

            // Pin gradient fill
            drawPath(
                path = pinPath,
                brush = Brush.verticalGradient(
                    listOf(Color(0xFF3B82F6), Color(0xFF1D4ED8)),
                    startY = pinHeadCenterY - pinRadius,
                    endY = pinTipY,
                ),
                style = Fill,
            )

            // White dot inside pin
            drawCircle(
                color = Color.White,
                radius = pinRadius * 0.38f,
                center = Offset(pinCenterX, pinHeadCenterY),
            )
        }
    }
}
