import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/dev_config.dart';
import '../core/network/session_invalidator.dart';
import '../data/mock_delivery_route.dart';
import '../features/auth/data/auth_repository.dart';
import '../features/tracking/data/socket_service.dart';
import '../models/driver_session.dart';
import '../services/api_client.dart';
import '../services/auth_service.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) => AuthRepository());

final authServiceProvider = Provider<AuthService>((ref) {
  return AuthService(repository: ref.watch(authRepositoryProvider));
});

class AuthState {
  final bool loading;
  final bool checking;
  final DriverSession? driver;
  final String? error;

  const AuthState({
    this.loading = false,
    this.checking = true,
    this.driver,
    this.error,
  });

  bool get isAuthenticated => driver != null;

  AuthState copyWith({
    bool? loading,
    bool? checking,
    DriverSession? driver,
    String? error,
    bool clearDriver = false,
    bool clearError = false,
  }) {
    return AuthState(
      loading: loading ?? this.loading,
      checking: checking ?? this.checking,
      driver: clearDriver ? null : (driver ?? this.driver),
      error: clearError ? null : (error ?? this.error),
    );
  }
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._auth, {bool restoreSession = true}) : super(const AuthState()) {
    if (kUiPreviewMode) {
      state = const AuthState(checking: false);
    } else if (restoreSession) {
      _restore();
    } else {
      state = const AuthState(checking: false);
    }
    _sessionSub = SessionInvalidator.instance.events.listen(_onSessionInvalidated);
  }

  final AuthService _auth;
  StreamSubscription<String>? _sessionSub;
  bool _handlingInvalidation = false;

  Future<void> _restore() async {
    final driver = await _auth.getStoredDriver();
    final token = await _auth.getToken();
    state = AuthState(
      checking: false,
      driver: token != null ? driver : null,
    );
  }

  Future<bool> login(String pin) async {
    state = state.copyWith(loading: true, clearError: true);
    if (kUiPreviewMode) {
      await Future<void>.delayed(const Duration(milliseconds: 400));
      state = const AuthState(driver: previewDriver);
      return true;
    }
    try {
      final driver = await _auth.login(pin);
      _handlingInvalidation = false;
      state = AuthState(driver: driver);
      return true;
    } on ApiException catch (e) {
      state = state.copyWith(loading: false, error: e.message);
      return false;
    } catch (_) {
      state = state.copyWith(loading: false, error: 'Login failed');
      return false;
    }
  }

  void _onSessionInvalidated(String reason) {
    if (state.driver == null || _handlingInvalidation) return;
    unawaited(_forceLogout(reason));
  }

  Future<void> _forceLogout(String reason) async {
    _handlingInvalidation = true;
    try {
      socketService.disconnect();
    } catch (_) {}
    await _auth.logout();
    state = AuthState(
      checking: false,
      error: reason == SessionInvalidator.sessionSuperseded
          ? 'Signed in on another device'
          : 'Session expired. Please sign in again.',
    );
  }

  Future<void> logout() async {
    if (kUiPreviewMode) return;
    try {
      socketService.disconnect();
    } catch (_) {}
    await _auth.logout();
    state = const AuthState(checking: false);
  }

  @override
  void dispose() {
    _sessionSub?.cancel();
    super.dispose();
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  return AuthNotifier(ref.watch(authServiceProvider));
});
