import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:local_auth/local_auth.dart';

import '../l10n/l10n.dart';

/// How the rider chose to protect the app after the first OTP sign-in.
enum AppLockMethod { none, pin, fingerprint, face }

/// What this phone can offer for biometric unlock.
typedef BiometricSupport = ({bool fingerprint, bool face});

/// Optional on-device app lock (4-digit PIN, fingerprint or face).
///
/// The OTP session stays signed in; this only gates opening the app. Nothing
/// leaves the phone: the PIN is stored as a salted SHA-256 in secure storage.
class AppLock extends ChangeNotifier {
  static const pinLength = 4;

  /// Wrong PINs allowed before the rider is signed out and must use OTP again.
  static const maxPinAttempts = 5;

  static const _kMethod = 'bc_lock_method';
  static const _kPinHash = 'bc_lock_pin_hash';
  static const _kPinSalt = 'bc_lock_pin_salt';
  static const _kFails = 'bc_lock_pin_fails';

  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  final LocalAuthentication _auth = LocalAuthentication();

  AppLockMethod method = AppLockMethod.none;
  String? _pinHash;
  String? _pinSalt;
  int failedPinAttempts = 0;

  /// Unlocked for this app run. Cold starts begin locked when a method is set.
  bool _unlocked = false;

  bool get enabled => method != AppLockMethod.none;
  bool get needsUnlock => enabled && !_unlocked;
  bool get isBiometric => method == AppLockMethod.fingerprint || method == AppLockMethod.face;
  int get pinAttemptsLeft => maxPinAttempts - failedPinAttempts;

  Future<void> init() async {
    try {
      final raw = await _storage.read(key: _kMethod);
      method = AppLockMethod.values.firstWhere((m) => m.name == raw, orElse: () => AppLockMethod.none);
      _pinHash = await _storage.read(key: _kPinHash);
      _pinSalt = await _storage.read(key: _kPinSalt);
      failedPinAttempts = int.tryParse(await _storage.read(key: _kFails) ?? '') ?? 0;
      // A PIN lock without a stored PIN can never be opened — treat it as off.
      if (method == AppLockMethod.pin && (_pinHash == null || _pinSalt == null)) method = AppLockMethod.none;
    } catch (_) {
      method = AppLockMethod.none;
    }
  }

  void markUnlocked() {
    if (_unlocked) return;
    _unlocked = true;
    notifyListeners();
  }

  // ---------------- PIN ----------------

  Future<void> setPin(String pin) async {
    final salt = base64Encode(List<int>.generate(16, (_) => Random.secure().nextInt(256)));
    _pinSalt = salt;
    _pinHash = _hash(pin, salt);
    await _storage.write(key: _kPinSalt, value: salt);
    await _storage.write(key: _kPinHash, value: _pinHash);
    await _setFails(0);
    await _setMethod(AppLockMethod.pin);
  }

  /// Checks [pin]; counts misses so a stolen phone can't guess forever.
  Future<bool> checkPin(String pin) async {
    final salt = _pinSalt;
    if (salt == null || _pinHash == null) return false;
    final ok = _hash(pin, salt) == _pinHash;
    await _setFails(ok ? 0 : failedPinAttempts + 1);
    notifyListeners();
    return ok;
  }

  String _hash(String pin, String salt) => sha256.convert(utf8.encode('$salt:$pin')).toString();

  Future<void> _setFails(int n) async {
    failedPinAttempts = n;
    await _storage.write(key: _kFails, value: '$n');
  }

  // ---------------- Biometrics ----------------

  /// Fingerprint / face availability. Android often reports only a strength
  /// class (strong/weak) instead of the sensor kind: strong → fingerprint,
  /// weak → face unlock, which is how most Android phones classify them.
  Future<BiometricSupport> biometricSupport() async {
    try {
      if (!await _auth.isDeviceSupported() || !await _auth.canCheckBiometrics) {
        return (fingerprint: false, face: false);
      }
      final types = await _auth.getAvailableBiometrics();
      final android = defaultTargetPlatform == TargetPlatform.android;
      return (
        fingerprint:
            types.contains(BiometricType.fingerprint) || (android && types.contains(BiometricType.strong)),
        face: types.contains(BiometricType.face) || (android && types.contains(BiometricType.weak)),
      );
    } catch (_) {
      return (fingerprint: false, face: false);
    }
  }

  /// Shows the system biometric prompt. Returns null on success, else a message for the rider.
  Future<String?> authenticateBiometric(String reason) async {
    try {
      final ok = await _auth.authenticate(localizedReason: reason, biometricOnly: true, persistAcrossBackgrounding: true);
      return ok ? null : tr('Verification was cancelled');
    } on LocalAuthException catch (e) {
      return switch (e.code) {
        LocalAuthExceptionCode.userCanceled || LocalAuthExceptionCode.systemCanceled => tr(
          'Verification was cancelled',
        ),
        LocalAuthExceptionCode.temporaryLockout || LocalAuthExceptionCode.biometricLockout => tr(
          'Too many attempts. Try again later or sign in with your mobile number.',
        ),
        LocalAuthExceptionCode.noBiometricsEnrolled || LocalAuthExceptionCode.noBiometricHardware => tr(
          'Set up a fingerprint or face unlock in your phone settings first.',
        ),
        _ => e.description ?? tr('Could not verify. Please try again.'),
      };
    } on PlatformException catch (e) {
      return e.message ?? tr('Could not verify. Please try again.');
    } catch (_) {
      return tr('Could not verify. Please try again.');
    }
  }

  /// Turns on [m] (fingerprint or face). The caller has already verified the rider.
  Future<void> enableBiometric(AppLockMethod m) async {
    assert(m == AppLockMethod.fingerprint || m == AppLockMethod.face);
    await _clearPin();
    await _setMethod(m);
  }

  // ---------------- Off / sign-out ----------------

  Future<void> disable() async {
    await _clearPin();
    await _setMethod(AppLockMethod.none);
  }

  /// Sign-out: the next rider on this phone starts with no lock.
  Future<void> clear() async {
    await disable();
    _unlocked = false;
  }

  Future<void> _clearPin() async {
    _pinHash = null;
    _pinSalt = null;
    await _storage.delete(key: _kPinHash);
    await _storage.delete(key: _kPinSalt);
    await _setFails(0);
  }

  Future<void> _setMethod(AppLockMethod m) async {
    method = m;
    // Whoever just changed the setting is already inside the app.
    _unlocked = true;
    await _storage.write(key: _kMethod, value: m.name);
    notifyListeners();
  }
}
