import 'dart:async';

import 'package:flutter/foundation.dart';

import '../core/app_container.dart';
import '../core/events.dart';
import '../data/models/driver.dart';
import '../data/network/api_exception.dart';
import '../l10n/l10n.dart';

/// How a sign-in code check ended — the OTP screen routes on it.
enum OtpVerifyResult { signedIn, invalidCode, notRider, failed }

/// Port of AuthViewModel.kt.
class AuthController extends ChangeNotifier {
  AuthController(this._c) {
    _restore();
    _sub = _c.sessionInvalidator.events.listen(_onSessionInvalidated);
  }

  final AppContainer _c;
  StreamSubscription<String>? _sub;
  bool _handlingInvalidation = false;

  bool loading = false;
  bool checking = true;
  DriverSession? driver;
  String? _error;

  /// Stored as the English text it was raised with and translated when read, so a message
  /// already on screen follows a language switch (server messages without a translation
  /// pass through unchanged).
  String? get error => _error == null ? null : tr(_error!);
  set error(String? value) => _error = value;

  bool get isAuthenticated => driver != null;

  void _restore() {
    driver = _c.authRepository.restore();
    checking = false;
    if (driver != null) _c.pushTokens.register();
  }

  /// Mobile number the last code was texted to (`07XXXXXXXX`).
  String? otpPhone;
  String? _otpChallenge;

  /// Step 1 of sign-in: text a code to [phone]. Returns false (with [error] set) on failure.
  Future<bool> requestOtp(String phone, {String? appSignature}) async {
    if (loading) return false;
    loading = true;
    error = null;
    notifyListeners();
    try {
      _otpChallenge = await _c.authRepository.requestLoginOtp(phone, appSignature: appSignature);
      otpPhone = phone;
      loading = false;
      notifyListeners();
      return true;
    } catch (e) {
      loading = false;
      error = errorMessage(e, tr('Could not send the code. Please try again.'));
      notifyListeners();
      return false;
    }
  }

  /// Step 2: check the code. The backend then looks the number up as a rider; the
  /// backend resolves every branch the rider works at, so the app never asks for one.
  Future<OtpVerifyResult> verifyOtp(String code) async {
    final phone = otpPhone;
    final challenge = _otpChallenge;
    if (loading) return OtpVerifyResult.failed;
    if (phone == null || challenge == null) {
      error = tr('Request a new code');
      notifyListeners();
      return OtpVerifyResult.invalidCode;
    }
    loading = true;
    error = null;
    notifyListeners();
    try {
      final signedIn = await _c.authRepository.login(phone, code.trim(), challenge);
      // An explicit sign-out already cleared the lock, so a new rider starts without one.
      // After an expired session the lock is kept: the rider just proved who they are.
      _c.appLock.markUnlocked();
      driver = signedIn;
      _otpChallenge = null;
      _handlingInvalidation = false;
      loading = false;
      notifyListeners();
      _c.pushTokens.register();
      return OtpVerifyResult.signedIn;
    } catch (e) {
      loading = false;
      final errCode = e is ApiException ? e.code : null;
      if (errCode == 'RIDER_NOT_FOUND') {
        // The code was good but has been spent — a retry needs a fresh one.
        _otpChallenge = null;
        notifyListeners();
        return OtpVerifyResult.notRider;
      }
      error = errCode == 'OTP_INVALID' ? tr('Incorrect or expired code') : errorMessage(e, tr('Login failed'));
      notifyListeners();
      return errCode == 'OTP_INVALID' ? OtpVerifyResult.invalidCode : OtpVerifyResult.failed;
    }
  }

  void clearError() {
    error = null;
    notifyListeners();
  }

  void _onSessionInvalidated(String reason) {
    if (driver == null || _handlingInvalidation) return;
    _handlingInvalidation = true;
    logout(
      keepLock: true,
      message: reason == SessionInvalidator.sessionSuperseded
          ? tr('Signed in on another device')
          : tr('Session expired. Please sign in again.'),
    );
  }

  /// [keepLock]: an expired session keeps the rider's PIN / biometric lock so they don't
  /// have to set it up again after signing back in. Explicit sign-outs clear it.
  Future<void> logout({String? message, bool keepLock = false}) async {
    // Do not force OFF_DUTY here — an active/queued run would 409. Duty stays
    // as-is until the driver toggles it from Me.
    await _c.pushTokens.unregister();
    await _c.authRepository.logout();
    if (!keepLock) await _c.appLock.clear();
    await _c.alertService.stop();
    _c.deliverySocket.disconnect();
    await _c.locationTracker.stop();
    driver = null;
    error = message;
    loading = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
