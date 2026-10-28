package lk.bingchun.delivery.core

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import kotlin.math.PI
import kotlin.math.sin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Soft Apple-like sonification via runtime-synthesized PCM tones.
 * Respects ringer mode and [RuntimeConfig.soundEnabled].
 */
enum class BcSoundEvent {
    TAP,
    SUCCESS,
    ERROR,
    NOTIFICATION,
    COMPLETED,
    REFRESH,
    NEW_JOB,
    SCAN_OK,
    SCAN_FAIL,
}

class BcSound(private val context: Context) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    fun play(event: BcSoundEvent) {
        if (!RuntimeConfig.soundEnabled) return
        if (audioManager.ringerMode != AudioManager.RINGER_MODE_NORMAL) return
        scope.launch {
            try {
                val (freq, ms, volume) = when (event) {
                    BcSoundEvent.TAP -> Triple(880.0, 28, 0.12)
                    BcSoundEvent.SUCCESS -> Triple(784.0, 90, 0.18)
                    BcSoundEvent.ERROR -> Triple(220.0, 110, 0.16)
                    BcSoundEvent.NOTIFICATION -> Triple(660.0, 70, 0.15)
                    BcSoundEvent.COMPLETED -> Triple(988.0, 140, 0.2)
                    BcSoundEvent.REFRESH -> Triple(520.0, 50, 0.12)
                    BcSoundEvent.NEW_JOB -> Triple(740.0, 100, 0.18)
                    BcSoundEvent.SCAN_OK -> Triple(880.0, 60, 0.16)
                    BcSoundEvent.SCAN_FAIL -> Triple(180.0, 90, 0.16)
                }
                playTone(freq, ms, volume.toFloat())
                // Soft second tick for success / completed
                if (event == BcSoundEvent.SUCCESS || event == BcSoundEvent.COMPLETED) {
                    Thread.sleep(60)
                    playTone(freq * 1.25, 70, volume.toFloat() * 0.85f)
                }
            } catch (_: Exception) {
                /* never crash on audio */
            }
        }
    }

    private fun playTone(freqHz: Double, durationMs: Int, volume: Float) {
        val sampleRate = 22050
        val numSamples = sampleRate * durationMs / 1000
        val buffer = ShortArray(numSamples)
        for (i in 0 until numSamples) {
            val t = i.toDouble() / sampleRate
            val envelope = when {
                i < numSamples / 12 -> i.toDouble() / (numSamples / 12.0) // attack
                else -> 1.0 - ((i - numSamples / 12.0) / (numSamples * 11.0 / 12.0)).coerceIn(0.0, 1.0)
            }
            val sample = (sin(2.0 * PI * freqHz * t) * envelope * volume * Short.MAX_VALUE).toInt()
            buffer[i] = sample.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }

        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        val format = AudioFormat.Builder()
            .setSampleRate(sampleRate)
            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
            .build()
        val track = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            AudioTrack.Builder()
                .setAudioAttributes(attrs)
                .setAudioFormat(format)
                .setBufferSizeInBytes(buffer.size * 2)
                .setTransferMode(AudioTrack.MODE_STATIC)
                .build()
        } else {
            @Suppress("DEPRECATION")
            AudioTrack(
                AudioManager.STREAM_NOTIFICATION,
                sampleRate,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT,
                buffer.size * 2,
                AudioTrack.MODE_STATIC,
            )
        }
        try {
            track.write(buffer, 0, buffer.size)
            track.play()
            Thread.sleep(durationMs.toLong() + 20)
        } finally {
            try {
                track.stop()
                track.release()
            } catch (_: Exception) {
            }
        }
    }
}
