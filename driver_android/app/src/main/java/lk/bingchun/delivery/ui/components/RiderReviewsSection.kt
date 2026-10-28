package lk.bingchun.delivery.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import lk.bingchun.delivery.core.Format
import lk.bingchun.delivery.data.model.RiderRatingItem
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

@Composable
fun RiderReviewsSection(
    ratings: List<RiderRatingItem>,
    loading: Boolean,
    modifier: Modifier = Modifier,
    emptyLabel: String = "No reviews yet",
) {
    val colors = LocalBcColors.current
    BcCard(modifier = modifier) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Customer reviews", style = BcType.subtitle, color = colors.text)
            when {
                loading && ratings.isEmpty() -> {
                    Text("Loading reviews…", style = BcType.caption, color = colors.textMuted)
                }
                ratings.isEmpty() -> {
                    Text(emptyLabel, style = BcType.caption, color = colors.textMuted)
                }
                else -> {
                    ratings.forEach { review ->
                        RiderReviewRow(review)
                    }
                }
            }
        }
    }
}

@Composable
private fun RiderReviewRow(review: RiderRatingItem) {
    val colors = LocalBcColors.current
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(2.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                repeat(5) { index ->
                    Icon(
                        Icons.Outlined.Star,
                        contentDescription = null,
                        tint = if (index < review.stars) Color(0xFFF59E0B) else colors.textMuted.copy(alpha = 0.35f),
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
            Text(Format.dateTime(review.createdAt), style = BcType.tiny, color = colors.textMuted)
        }
        review.comment?.takeIf { it.isNotBlank() }?.let { comment ->
            Spacer(Modifier.height(4.dp))
            Text(comment, style = BcType.body, color = colors.text)
        }
        review.orderNumber?.takeIf { it.isNotBlank() }?.let { orderNumber ->
            Spacer(Modifier.height(2.dp))
            Text("Order #$orderNumber", style = BcType.tiny, color = colors.textMuted)
        }
    }
}
