import 'dart:math' as math;
import 'dart:typed_data';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/services.dart';

import 'runtime_config.dart';

/// Soft sonification via runtime-synthesized PCM tones — port of BcSound.kt.
enum BcSoundEvent { tap, success, error, notification, completed, refresh, newJob, scanOk, scanFail }

class BcSound {
  BcSound._();
  static final BcSound instance = BcSound._();

  final Map<String, Uint8List> _cache = {};

  Future<void> play(BcSoundEvent event) async {
    if (!RuntimeConfig.instance.soundEnabled) return;
    try {
      final (freq, ms, volume) = switch (event) {
        BcSoundEvent.tap => (880.0, 28, 0.12),
        BcSoundEvent.success => (784.0, 90, 0.18),
        BcSoundEvent.error => (220.0, 110, 0.16),
        BcSoundEvent.notification => (660.0, 70, 0.15),
        BcSoundEvent.completed => (988.0, 140, 0.2),
        BcSoundEvent.refresh => (520.0, 50, 0.12),
        BcSoundEvent.newJob => (740.0, 100, 0.18),
        BcSoundEvent.scanOk => (880.0, 60, 0.16),
        BcSoundEvent.scanFail => (180.0, 90, 0.16),
      };
      await _playTone(freq, ms, volume);
      // Soft second tick for success / completed
      if (event == BcSoundEvent.success || event == BcSoundEvent.completed) {
        await Future<void>.delayed(const Duration(milliseconds: 60));
        await _playTone(freq * 1.25, 70, volume * 0.85);
      }
    } catch (_) {
      // never crash on audio
    }
  }

  Future<void> _playTone(double freqHz, int durationMs, double volume) async {
    final key = '$freqHz-$durationMs-$volume';
    final wav = _cache.putIfAbsent(key, () => _synth(freqHz, durationMs, volume));
    final player = AudioPlayer(playerId: 'tone-${DateTime.now().microsecondsSinceEpoch}');
    player.positionUpdater = null;
    await player.setReleaseMode(ReleaseMode.release);
    await player.setAudioContext(
      AudioContext(
        android: const AudioContextAndroid(
          usageType: AndroidUsageType.assistanceSonification,
          contentType: AndroidContentType.sonification,
          audioFocus: AndroidAudioFocus.none,
        ),
        iOS: AudioContextIOS(category: AVAudioSessionCategory.ambient),
      ),
    );
    await player.play(BytesSource(wav, mimeType: 'audio/wav'));
    Future<void>.delayed(Duration(milliseconds: durationMs + 400), player.dispose);
  }

  /// 16-bit mono PCM sine with a short attack and linear decay, wrapped as WAV.
  static Uint8List _synth(double freqHz, int durationMs, double volume) {
    const sampleRate = 22050;
    final numSamples = sampleRate * durationMs ~/ 1000;
    final data = ByteData(44 + numSamples * 2);
    void ascii(int offset, String s) {
      for (var i = 0; i < s.length; i++) {
        data.setUint8(offset + i, s.codeUnitAt(i));
      }
    }

    ascii(0, 'RIFF');
    data.setUint32(4, 36 + numSamples * 2, Endian.little);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    data.setUint32(16, 16, Endian.little);
    data.setUint16(20, 1, Endian.little);
    data.setUint16(22, 1, Endian.little);
    data.setUint32(24, sampleRate, Endian.little);
    data.setUint32(28, sampleRate * 2, Endian.little);
    data.setUint16(32, 2, Endian.little);
    data.setUint16(34, 16, Endian.little);
    ascii(36, 'data');
    data.setUint32(40, numSamples * 2, Endian.little);

    final attack = numSamples / 12;
    for (var i = 0; i < numSamples; i++) {
      final t = i / sampleRate;
      final envelope = i < attack ? i / attack : 1.0 - ((i - attack) / (numSamples * 11.0 / 12.0)).clamp(0.0, 1.0);
      final sample = (math.sin(2 * math.pi * freqHz * t) * envelope * volume * 32767).round();
      data.setInt16(44 + i * 2, sample.clamp(-32768, 32767), Endian.little);
    }
    return data.buffer.asUint8List();
  }
}

enum BcHapticKind { tick, confirm, reject }

class BcHaptics {
  static void perform(BcHapticKind kind) {
    if (!RuntimeConfig.instance.hapticsEnabled) return;
    switch (kind) {
      case BcHapticKind.tick:
        HapticFeedback.selectionClick();
      case BcHapticKind.confirm:
        HapticFeedback.mediumImpact();
      case BcHapticKind.reject:
        HapticFeedback.heavyImpact();
    }
  }
}

/// Unified tap / success / error feedback (sound + haptic) — port of BcFeedback.
class BcFeedback {
  BcFeedback._();

  static void tap() {
    BcHaptics.perform(BcHapticKind.tick);
    BcSound.instance.play(BcSoundEvent.tap);
  }

  static void success() {
    BcHaptics.perform(BcHapticKind.confirm);
    BcSound.instance.play(BcSoundEvent.success);
  }

  static void error() {
    BcHaptics.perform(BcHapticKind.reject);
    BcSound.instance.play(BcSoundEvent.error);
  }

  static void completed() {
    BcHaptics.perform(BcHapticKind.confirm);
    BcSound.instance.play(BcSoundEvent.completed);
  }

  static void refresh() {
    BcHaptics.perform(BcHapticKind.tick);
    BcSound.instance.play(BcSoundEvent.refresh);
  }

  static void newJob() {
    BcHaptics.perform(BcHapticKind.confirm);
    BcSound.instance.play(BcSoundEvent.newJob);
  }

  static void notification() => BcSound.instance.play(BcSoundEvent.notification);
}
