import 'dart:async';

/// Broadcasts "the staff session is gone" (refresh rejected, account disabled)
/// so the auth controller can sign the cashier out from anywhere.
class SessionInvalidator {
  final _controller = StreamController<String>.broadcast();

  Stream<String> get events => _controller.stream;

  void notify(String reason) => _controller.add(reason);
}
