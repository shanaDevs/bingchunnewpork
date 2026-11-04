import 'package:audioplayers/audioplayers.dart';

import 'runtime_config.dart';

/// New-order chime (web: branch order audio). Respects the Sound setting.
class OrderChime {
  final AudioPlayer _player = AudioPlayer()..setReleaseMode(ReleaseMode.stop);

  Future<void> play() async {
    if (!RuntimeConfig.instance.soundEnabled) return;
    try {
      await _player.stop();
      await _player.play(AssetSource('sounds/new_order_alert.wav'));
    } catch (_) {
      // Audio focus lost or no output device — the visual alert still shows.
    }
  }
}
