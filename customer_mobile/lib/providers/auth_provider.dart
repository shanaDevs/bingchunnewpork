import 'dart:async';
import 'dart:convert';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../models/user.dart';
import '../services/api_client.dart';
import '../services/notification_service.dart';

enum AuthStatus { initial, authenticating, authenticated, unauthenticated, error }

const Object _unset = Object();

class AuthState {
  final AuthStatus status;
  final CustomerUser? user;
  final String? errorMessage;
  final bool isProfileConfirmed;

  AuthState({
    required this.status,
    this.user,
    this.errorMessage,
    this.isProfileConfirmed = false,
  });

  factory AuthState.initial() => AuthState(
        status: AuthStatus.initial,
        isProfileConfirmed: false,
      );

  AuthState copyWith({
    AuthStatus? status,
    Object? user = _unset,
    Object? errorMessage = _unset,
    bool? isProfileConfirmed,
  }) {
    return AuthState(
      status: status ?? this.status,
      user: identical(user, _unset) ? this.user : user as CustomerUser?,
      errorMessage: identical(errorMessage, _unset) ? this.errorMessage : errorMessage as String?,
      isProfileConfirmed: isProfileConfirmed ?? this.isProfileConfirmed,
    );
  }
}

final apiClientProvider = Provider<ApiClient>((ref) {
  return ApiClient();
});

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>((ref) {
  final api = ref.watch(apiClientProvider);
  final notifier = AuthNotifier(api);
  api.onUnauthenticated = () {
    unawaited(notifier.logout());
  };
  return notifier;
});

class AuthNotifier extends StateNotifier<AuthState> {
  final ApiClient _api;
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  static const _userCacheKey = 'bc_customer_cached_user';

  /// Bumped on logout so in-flight [tryStartup] cannot re-authenticate.
  int _sessionGen = 0;
  bool _loggingOut = false;

  AuthNotifier(this._api) : super(AuthState.initial()) {
    tryStartup();
  }

  Future<void> tryStartup() async {
    final gen = _sessionGen;
    final cached = await _storage.read(key: _userCacheKey);
    if (gen != _sessionGen) return;

    if (cached != null) {
      try {
        final user = CustomerUser.fromJson(jsonDecode(cached) as Map<String, dynamic>);
        if (gen != _sessionGen) return;
        state = AuthState(
          status: AuthStatus.authenticated,
          user: user,
          isProfileConfirmed: user.isProfileComplete,
        );
      } catch (_) {}
    }

    final hasToken = await _api.hasAuthToken();
    if (gen != _sessionGen) return;

    if (cached == null && !hasToken) {
      state = AuthState(status: AuthStatus.unauthenticated);
      return;
    }

    try {
      final user = await _api.get<CustomerUser>(
        '/auth/me',
        parser: (json) => CustomerUser.fromJson(json),
      );
      if (gen != _sessionGen) return;
      await _storage.write(key: _userCacheKey, value: jsonEncode(user.toJson()));
      if (gen != _sessionGen) return;
      state = AuthState(
        status: AuthStatus.authenticated,
        user: user,
        isProfileConfirmed: user.isProfileComplete,
      );
      NotificationService.instance.registerToken(_api);
    } catch (e) {
      if (gen != _sessionGen) return;
      if (state.status != AuthStatus.authenticated) {
        state = AuthState(status: AuthStatus.unauthenticated);
      }
    }
  }

  Future<bool> login(String phone, String password) async {
    state = state.copyWith(status: AuthStatus.authenticating);
    try {
      final data = await _api.post<Map<String, dynamic>>(
        '/auth/login',
        {
          'phone': phone,
          'password': password,
        },
        requireAuth: false,
      );

      final token = data['token'] as String;
      final refreshToken = data['refreshToken'] as String?;
      final user = CustomerUser.fromJson(data['user'] as Map<String, dynamic>);

      await _api.saveToken(token);
      if (refreshToken != null) {
        await _api.saveRefreshToken(refreshToken);
      }
      await _storage.write(key: _userCacheKey, value: jsonEncode(user.toJson()));

      state = AuthState(
        status: AuthStatus.authenticated,
        user: user,
        isProfileConfirmed: user.isProfileComplete,
      );
      NotificationService.instance.registerToken(_api);
      return true;
    } catch (e) {
      state = AuthState(
        status: AuthStatus.error,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  Future<bool> register(String name, String phone, String password, {String? email}) async {
    state = state.copyWith(status: AuthStatus.authenticating);
    try {
      final data = await _api.post<Map<String, dynamic>>(
        '/auth/register',
        {
          'name': name,
          'phone': phone,
          'password': password,
          if (email != null && email.isNotEmpty) 'email': email,
        },
        requireAuth: false,
      );

      final token = data['token'] as String;
      final refreshToken = data['refreshToken'] as String?;
      final user = CustomerUser.fromJson(data['user'] as Map<String, dynamic>);

      await _api.saveToken(token);
      if (refreshToken != null) {
        await _api.saveRefreshToken(refreshToken);
      }
      await _storage.write(key: _userCacheKey, value: jsonEncode(user.toJson()));

      state = AuthState(
        status: AuthStatus.authenticated,
        user: user,
        isProfileConfirmed: user.isProfileComplete,
      );
      NotificationService.instance.registerToken(_api);
      return true;
    } catch (e) {
      state = AuthState(
        status: AuthStatus.error,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  Future<bool> loginOrRegisterWithPhone(String name, String phone, {String? email}) async {
    state = state.copyWith(status: AuthStatus.authenticating);
    try {
      final data = await _api.post<Map<String, dynamic>>(
        '/auth/phone/login',
        {
          'name': name,
          'phone': phone,
          if (email != null && email.isNotEmpty) 'email': email,
        },
        requireAuth: false,
      );

      final token = data['token'] as String;
      final refreshToken = data['refreshToken'] as String?;
      final user = CustomerUser.fromJson(data['user'] as Map<String, dynamic>);

      await _api.saveToken(token);
      if (refreshToken != null) {
        await _api.saveRefreshToken(refreshToken);
      }
      await _storage.write(key: _userCacheKey, value: jsonEncode(user.toJson()));

      state = AuthState(
        status: AuthStatus.authenticated,
        user: user,
        isProfileConfirmed: user.isProfileComplete,
      );
      NotificationService.instance.registerToken(_api);
      return true;
    } catch (e) {
      state = AuthState(
        status: AuthStatus.error,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  Future<({bool success, String? testCode, String? errorMessage})> requestOtp(
    String phone, {
    String? appSignature,
  }) async {
    state = state.copyWith(status: AuthStatus.authenticating, errorMessage: null);
    try {
      final data = await _api.post<Map<String, dynamic>>(
        '/auth/otp/request',
        {
          'phone': phone,
          if (appSignature != null && appSignature.isNotEmpty) 'appSignature': appSignature,
        },
        requireAuth: false,
      );
      state = state.copyWith(status: AuthStatus.unauthenticated);
      final testCode = data['code']?.toString();
      return (success: true, testCode: testCode, errorMessage: null);
    } catch (e) {
      final message = e.toString().replaceFirst('ApiException: ', '');
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        errorMessage: message,
      );
      return (success: false, testCode: null, errorMessage: message);
    }
  }

  Future<({bool success, String? errorMessage})> verifyOtp(String phone, String code) async {
    state = state.copyWith(status: AuthStatus.authenticating, errorMessage: null);
    try {
      final data = await _api.post<Map<String, dynamic>>(
        '/auth/otp/verify',
        {
          'phone': phone,
          'code': code,
        },
        requireAuth: false,
      );

      final token = data['token'] as String;
      final refreshToken = data['refreshToken'] as String?;
      final user = CustomerUser.fromJson(data['user'] as Map<String, dynamic>);

      await _api.saveToken(token);
      if (refreshToken != null) {
        await _api.saveRefreshToken(refreshToken);
      }
      await _storage.write(key: _userCacheKey, value: jsonEncode(user.toJson()));

      state = AuthState(
        status: AuthStatus.authenticated,
        user: user,
        isProfileConfirmed: user.isProfileComplete,
      );
      NotificationService.instance.registerToken(_api);
      return (success: true, errorMessage: null);
    } catch (e) {
      final message = e.toString().replaceFirst('ApiException: ', '');
      state = state.copyWith(
        status: AuthStatus.unauthenticated,
        errorMessage: message,
      );
      return (success: false, errorMessage: message);
    }
  }

  Future<bool> updateProfile(String name, {String? email}) async {
    state = state.copyWith(status: AuthStatus.authenticating);
    try {
      await _api.put<Map<String, dynamic>>(
        '/auth/me',
        {
          'name': name,
          if (email != null && email.isNotEmpty) 'email': email,
        },
      );

      final user = await _api.get<CustomerUser>(
        '/auth/me',
        parser: (json) => CustomerUser.fromJson(json),
      );

      await _storage.write(key: _userCacheKey, value: jsonEncode(user.toJson()));
      state = AuthState(
        status: AuthStatus.authenticated,
        user: user,
        isProfileConfirmed: true,
      );
      return true;
    } catch (e) {
      state = state.copyWith(
        status: AuthStatus.error,
        errorMessage: e.toString(),
      );
      return false;
    }
  }

  /// Clears the local session immediately, then best-effort remote cleanup.
  Future<void> logout() async {
    if (_loggingOut) return;
    _loggingOut = true;
    _sessionGen++;

    // Update UI first so router can leave authenticated screens without waiting
    // on network (FCM unregister can hang for many seconds).
    state = AuthState(status: AuthStatus.unauthenticated);

    try {
      await Future.wait([
        _api.clearToken(),
        _storage.delete(key: _userCacheKey),
      ]);
    } catch (_) {
      try {
        await _api.clearToken();
      } catch (_) {}
      try {
        await _storage.delete(key: _userCacheKey);
      } catch (_) {}
    }

    // Remote FCM cleanup — never block / fail sign-out.
    unawaited(() async {
      try {
        await NotificationService.instance
            .unregisterToken(_api)
            .timeout(const Duration(seconds: 2));
      } catch (_) {}
    }());

    _loggingOut = false;
  }
}
