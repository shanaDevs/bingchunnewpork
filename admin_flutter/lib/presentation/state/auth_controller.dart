import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/app_container.dart';
import '../../data/network/api_exception.dart';
import '../../domain/entities/admin_session.dart';
import '../../l10n/l10n.dart';

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
    final s = session;
    if (s != null && !s.isSuperAdmin && !s.isBranchAdmin) {
      await _c.authRepository.dropSession();
      session = null;
    }
    checking = false;
    notifyListeners();
  }

  /// Throws ApiException with the server message on failure.
  Future<void> login(String email, String password) async {
    final signedIn = await _c.authRepository.login(email, password);
    if (!signedIn.isSuperAdmin && !signedIn.isBranchAdmin) {
      // This app is for super admins and branch admins; cashiers have their own app.
      await _c.authRepository.logout();
      throw ApiException(
        signedIn.isCashier
            ? tr('Cashier accounts sign in to the BingChun Cashier app.')
            : tr('This app is for super admins and branch admins only.'),
      );
    }
    session = signedIn;
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
