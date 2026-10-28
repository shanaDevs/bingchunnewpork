package lk.bingchun.delivery.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import lk.bingchun.delivery.ui.theme.BcMotion
import lk.bingchun.delivery.ui.theme.BcRadius
import lk.bingchun.delivery.ui.theme.BcType
import lk.bingchun.delivery.ui.theme.LocalBcColors

@Composable
fun BcTextField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    label: String? = null,
    placeholder: String = "",
    singleLine: Boolean = true,
    isError: Boolean = false,
    supportingText: String? = null,
    keyboardType: KeyboardType = KeyboardType.Text,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    trailingIcon: (@Composable () -> Unit)? = null,
) {
    val colors = LocalBcColors.current
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (label != null) {
            // Brand-tinted field labels, as in the customer app's `bcAuthInputDecoration`.
            Text(label, style = BcType.label, color = colors.brand)
        }
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = singleLine,
            isError = isError,
            placeholder = { Text(placeholder, color = colors.textMuted) },
            visualTransformation = visualTransformation,
            keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
            trailingIcon = trailingIcon,
            shape = BcRadius.buttonShape,
            colors = OutlinedTextFieldDefaults.colors(
                focusedContainerColor = colors.surface,
                unfocusedContainerColor = colors.surface,
                errorContainerColor = colors.surface,
                focusedBorderColor = colors.brand,
                unfocusedBorderColor = colors.inputBorder,
                errorBorderColor = colors.danger,
                focusedTextColor = colors.text,
                unfocusedTextColor = colors.text,
                cursorColor = colors.brand,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
        if (supportingText != null) {
            Text(
                supportingText,
                style = BcType.tiny,
                color = if (isError) colors.danger else colors.textMuted,
            )
        }
    }
}

/** Premium per-digit OTP / PIN boxes with shake on error. */
@Composable
fun BcPinBoxes(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    length: Int = 6,
    isError: Boolean = false,
    masked: Boolean = false,
) {
    val colors = LocalBcColors.current
    val shake = remember { Animatable(0f) }
    val focus = remember { FocusRequester() }

    LaunchedEffect(isError) {
        if (isError) {
            repeat(3) {
                shake.animateTo(8f, tween(40))
                shake.animateTo(-8f, tween(40))
            }
            shake.animateTo(0f, tween(40))
        }
    }

    LaunchedEffect(Unit) { focus.requestFocus() }

    Column(
        modifier = modifier
            .graphicsLayer { translationX = shake.value }
            .semantics {
                stateDescription = "${value.length} of $length digits entered"
            },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        BasicTextField(
            value = value,
            onValueChange = { new ->
                if (new.length <= length && new.all { it.isDigit() }) onValueChange(new)
            },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
            cursorBrush = SolidColor(colors.brand),
            textStyle = TextStyle(color = colors.text.copy(alpha = 0f), fontSize = 1.sp),
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp)
                .focusRequester(focus),
            decorationBox = {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    repeat(length) { i ->
                        val char = value.getOrNull(i)?.let { if (masked) '•' else it }
                        val filled = char != null
                        val isNextDigit = i == value.length
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(56.dp)
                                .clip(BcRadius.mdShape)
                                .background(colors.surface)
                                .border(
                                    width = 1.5.dp,
                                    color = when {
                                        isError -> colors.danger
                                        filled -> colors.brand
                                        isNextDigit -> colors.brandLight
                                        else -> colors.border
                                    },
                                    shape = BcRadius.mdShape,
                                ),
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text = char?.toString() ?: "",
                                style = BcType.title.copy(fontWeight = FontWeight.Bold),
                                color = colors.text,
                                textAlign = TextAlign.Center,
                            )
                        }
                    }
                }
            },
        )
        Text(
            text = when {
                value.length == length -> "All $length digits entered"
                value.isEmpty() -> "0 of $length digits entered"
                else -> "${value.length} of $length digits entered"
            },
            modifier = Modifier.fillMaxWidth(),
            style = BcType.tiny,
            color = when {
                isError -> colors.danger
                value.length == length -> colors.success
                else -> colors.textMuted
            },
            textAlign = TextAlign.End,
        )
    }
}
