import 'dart:async';

/// Fan-out when the current rider JWT is no longer valid — another device
/// signed in (`SESSION_SUPERSEDED`) or the token was rejected with 401.
class SessionInvalidator {
  SessionInvalidator._();
  static final instance = SessionInvalidator._();

  static const sessionSuperseded = 'SESSION_SUPERSEDED';

  final _controller = StreamController<String>.broadcast();
  Stream<String> get events => _controller.stream;

  void notify(String reason) {
    if (!_controller.isClosed) _controller.add(reason);
  }
}
