import 'package:audioplayers/audioplayers.dart';

/// Long-lived cart SFX player — survives bottom-sheet / route dispose so
/// “add to cup” still hears the full cart-add ding.
class CartSfx {
  CartSfx._();
  static final CartSfx instance = CartSfx._();

  final AudioPlayer _player = AudioPlayer();
  bool _configured = false;

  Future<void> _ensureConfigured() async {
    if (_configured) return;
    await _player.setReleaseMode(ReleaseMode.stop);
    await _player.setPlayerMode(PlayerMode.lowLatency);
    await _player.setVolume(1.0);
    _configured = true;
  }

  Future<void> playAdd() async {
    try {
      await _ensureConfigured();
      await _player.stop();
      await _player.play(AssetSource('sounds/cart_add_v2.wav'));
    } catch (_) {
      /* ignore playback errors */
    }
  }
}
