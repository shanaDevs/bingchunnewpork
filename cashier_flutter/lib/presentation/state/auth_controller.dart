import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/app_container.dart';
import '../../domain/entities/admin_session.dart';

/// Staff session for the whole app. Signs out when the server rejects the session.
class AuthController extends ChangeNotifier {
  AuthController(this._c) {
    _sub = _c.sessionInvalidator.events.listen(_onSessionLost);
    _restore();
  }

  final AppContainer _c;
  late final StreamSubscription<String> _sub;

  bool checking = true;
  AdminSession? session;

  /// Why the cashier was signed out (shown once on the sign-in screen).
  String? signedOutReason;

  bool get isAuthenticated => session != null;

  Future<void> _restore() async {
    try {
      session = await _c.authRepository.restore();
    } catch (_) {
      session = _c.authRepository.current;
    }
    checking = false;
    notifyListeners();
  }

  /// Throws ApiException with the server message on failure.
  Future<void> login(String email, String password) async {
    session = await _c.authRepository.login(email, password);
    signedOutReason = null;
    notifyListeners();
  }

  Future<void> logout() async {
    _c.socket.disconnect();
    await _c.authRepository.logout();
    session = null;
    notifyListeners();
  }

  Future<void> _onSessionLost(String reason) async {
    if (session == null) return;
    _c.socket.disconnect();
    await _c.authRepository.dropSession();
    session = null;
    signedOutReason = reason;
    notifyListeners();
  }

  @override
  void dispose() {
    _sub.cancel();
    super.dispose();
  }
}
