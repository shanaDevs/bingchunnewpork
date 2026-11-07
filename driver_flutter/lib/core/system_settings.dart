import 'dart:async';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';

/// Opens system settings screens that Flutter plugins don't cover.
/// Android side lives in MainActivity.kt (channel `lk.bingchun.delivery/system`).
class SystemSettings {
  SystemSettings._();

  static const _channel = MethodChannel('lk.bingchun.delivery/system');

  static Future<bool> _invoke(String method) async {
    if (!Platform.isAndroid) return false;
    try {
      return await _channel.invokeMethod<bool>(method) ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Mobile data / Wi‑Fi settings (Settings.ACTION_WIRELESS_SETTINGS on Android).
  static Future<void> openWireless() async {
    if (!await _invoke('openWirelessSettings')) await openAppSettings();
  }

  static Future<void> openLocation() => Geolocator.openLocationSettings();

  /// This app's notification channel settings.
  static Future<void> openNotificationSettings() async {
    if (!await _invoke('openNotificationSettings')) await openAppSettings();
  }

  /// Android 14+: whether new-ride alerts may take over the lock screen.
  static Future<bool> canUseFullScreenIntent() async {
    if (!Platform.isAndroid) return true;
    try {
      return await _channel.invokeMethod<bool>('canUseFullScreenIntent') ?? true;
    } catch (_) {
      return true;
    }
  }

  static Future<void> openFullScreenIntentSettings() async {
    if (!await _invoke('openFullScreenIntentSettings')) await openAppSettings();
  }

  // ---------------- Lock screen ----------------
  // The app may show over the lock screen only while a new ride is ringing: a new-ride
  // notification opening it (MainActivity) or a ride starting to ring turns that on.
  // Flutter puts it back behind the lock screen as soon as no ride rings, or after
  // [_lockScreenGrace] if a notification opened it but no ride rings (cold start, taps).

  static const _lockScreenGrace = Duration(seconds: 8);
  static bool _rideAlertActive = false;
  static Timer? _lockScreenTimer;
  static AppLifecycleListener? _lifecycle;

  /// Call once after the binding is initialised.
  static void initLockScreenGuard() {
    if (!Platform.isAndroid) return;
    _lifecycle ??= AppLifecycleListener(
      onResume: () {
        _armLockScreenTimer();
        _refreshDeviceLocked();
      },
    );
    _armLockScreenTimer();
    _refreshDeviceLocked();
  }

  static void _armLockScreenTimer() {
    _lockScreenTimer?.cancel();
    _lockScreenTimer = Timer(_lockScreenGrace, () {
      if (!_rideAlertActive) releaseLockScreen();
    });
  }

  /// Whether a new ride is ringing (its card is up, or would be once the app is on screen).
  /// While true the ride card may show over the lock screen — also when Android 14+ blocks
  /// full-screen alerts and the screen is woken instead.
  static void setRideAlertActive(bool active) {
    if (_rideAlertActive == active) return;
    _rideAlertActive = active;
    active ? _invoke('allowLockScreen') : releaseLockScreen();
    // Assume locked until checked so customer details never flash over the lock screen.
    if (active && Platform.isAndroid) deviceLocked.value = true;
    _refreshDeviceLocked();
  }

  /// The incoming-ride card reports when it is drawn / gone; MainActivity keeps the app
  /// covered over the lock screen unless the card is drawn.
  static void rideCardShown() => _invoke('rideCardShown');
  static void rideCardHidden() => _invoke('rideCardHidden');

  /// True while the phone is locked. Locked, the ride card hides customer details and the
  /// rest of the app is replaced by an "unlock to continue" screen, since the app can be
  /// on screen over the lock screen. Re-checked on resume, and every second while a ride
  /// rings or the app is on screen while locked (so it clears as soon as the rider unlocks).
  static final ValueNotifier<bool> deviceLocked = ValueNotifier(false);
  static Timer? _lockPoll;

  static Future<void> refreshDeviceLocked() => _refreshDeviceLocked();

  static Future<void> _refreshDeviceLocked() async {
    if (!Platform.isAndroid) return;
    deviceLocked.value = await _invoke('isDeviceLocked');
    // Locked + on screen (over the lock screen): poll to notice the unlock. Behind the lock
    // screen (paused) don't — resume re-checks anyway, and on duty that is most of the day.
    final onScreen = WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.inactive;
    final keepPolling = _rideAlertActive || (deviceLocked.value && onScreen);
    if (keepPolling && _lockPoll == null) {
      _lockPoll = Timer.periodic(const Duration(seconds: 1), (_) => _refreshDeviceLocked());
    } else if (!keepPolling) {
      _lockPoll?.cancel();
      _lockPoll = null;
    }
  }

  /// Stops showing the app over the lock screen. No-op when not shown there.
  static Future<void> releaseLockScreen() => _invoke('releaseLockScreen');

  /// Asks the rider to unlock the device. True once unlocked, or when it wasn't locked.
  static Future<bool> requestUnlock() async {
    if (!Platform.isAndroid) return true;
    return _invoke('requestUnlock');
  }

  // ---------------- Quick-action bubble ----------------
  // Floating app-logo bubble drawn over other apps while the app is in the background
  // (QuickBubble.kt). Tap = back to the app, drag = move (snaps to the left / right edge),
  // drag onto ✕ = hide.

  /// (enabled by the rider, "Display over other apps" granted). Android only.
  static Future<({bool enabled, bool permitted})> quickBubbleStatus() async {
    if (!Platform.isAndroid) return (enabled: false, permitted: false);
    try {
      final m = await _channel.invokeMapMethod<String, dynamic>('quickBubbleStatus');
      return (enabled: m?['enabled'] == true, permitted: m?['permitted'] == true);
    } catch (_) {
      return (enabled: false, permitted: false);
    }
  }

  static Future<void> setQuickBubbleEnabled(bool enabled) async {
    if (!Platform.isAndroid) return;
    try {
      await _channel.invokeMethod<bool>('setQuickBubbleEnabled', enabled);
    } catch (_) {}
  }

  static bool? _bubbleSignedIn;

  /// The bubble only appears for a signed-in rider.
  static Future<void> setQuickBubbleSignedIn(bool signedIn) async {
    if (!Platform.isAndroid || _bubbleSignedIn == signedIn) return;
    _bubbleSignedIn = signedIn;
    try {
      await _channel.invokeMethod<bool>('setQuickBubbleSignedIn', signedIn);
    } catch (_) {}
  }

  /// System "Display over other apps" screen for this app.
  static Future<void> openOverlaySettings() async {
    if (!await _invoke('openOverlaySettings')) await openAppSettings();
  }

  static Future<bool> isIgnoringBatteryOptimizations() async {
    if (!Platform.isAndroid) return true;
    return _invoke('isIgnoringBatteryOptimizations');
  }

  /// Opens the system battery-optimisation list (no direct-request dialog: that needs
  /// REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, which Play restricts).
  static Future<void> requestIgnoreBatteryOptimizations() async {
    if (!Platform.isAndroid) return;
    if (!await _invoke('openBatteryOptimizationSettings')) await openAppSettings();
  }
}
