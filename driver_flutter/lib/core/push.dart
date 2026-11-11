import 'dart:io';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import '../data/local/secure_store.dart';
import '../data/repositories/jobs_repository.dart';
import 'alert_service.dart';
import 'inbox.dart';
import 'notifications.dart';
import 'ride_alert.dart';

/// FCM data-message handler when the app is backgrounded or terminated.
/// The main isolate is gone, so show the loud notification directly — tapping it
/// opens the app on the incoming ride card. Port of BcMessagingService.kt.
@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {
  try {
    await Firebase.initializeApp();
  } catch (_) {}
  await BcNotifications.init();
  final data = message.data;
  switch (data['type']) {
    case 'NEW_JOB':
      if ((data['jobId'] ?? '').toString().isEmpty) return;
      await BcNotifications.notifyNewJob(RideAlert.fromPush(data));
    case 'ORDER_CANCELLED':
      final orderId = (data['orderId'] ?? '').toString();
      if (orderId.isEmpty) return;
      await BcNotifications.notifyOrderCancelled(orderId, (data['orderNumber'] ?? '').toString());
      await BcNotifications.vibrateCancel();
    case 'COMPLAINT_UPDATE' || 'BRANCH_REQUEST_UPDATE':
      // Admin replies: the system shows the notification itself, so just keep it in the inbox.
      final n = message.notification;
      await NotificationInbox.instance.add(
        title: n?.title ?? (data['title'] ?? '').toString(),
        body: n?.body ?? (data['body'] ?? '').toString(),
        type: data['type'].toString(),
      );
  }
}

/// Registers/clears the device's FCM token with the core backend — port of PushTokens.kt.
/// Every entry point is a silent no-op when Firebase is not configured
/// (no google-services.json / GoogleService-Info.plist in the build).
class PushTokens {
  PushTokens(this._store, this._jobs);

  final SecureStore _store;
  final JobsRepository _jobs;

  static bool _firebaseAvailable = false;
  static bool get firebaseAvailable => _firebaseAvailable;

  /// Call once at startup, before runApp's first frame.
  static Future<void> initFirebase() async {
    try {
      await Firebase.initializeApp();
      FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
      _firebaseAvailable = true;
    } catch (e) {
      // Expected until android/app/google-services.json (and the iOS plist) are added:
      // new-job alerts then rely on the socket + polling instead of FCM push.
      debugPrint('Firebase not configured (no google-services.json) — FCM push disabled; using socket + polling.');
      _firebaseAvailable = false;
    }
  }

  /// Foreground FCM messages are routed into the live [AlertService].
  void listenForeground(AlertService alerts) {
    if (!_firebaseAvailable) return;
    FirebaseMessaging.onMessage.listen((message) {
      final data = message.data;
      final n = message.notification;
      NotificationInbox.instance.add(
        title: n?.title ?? (data['title'] ?? '').toString(),
        body: n?.body ?? (data['body'] ?? '').toString(),
        type: (data['type'] ?? '').toString(),
      );
      switch (data['type']) {
        case 'NEW_JOB':
          if ((data['jobId'] ?? '').toString().isEmpty) return;
          final alert = RideAlert.fromPush(data);
          // Manual admin re-ring — ring immediately even if already tracked.
          data['forceRing'] == 'true' ? alerts.forceRing(alert) : alerts.alertJob(alert);
        case 'ORDER_CANCELLED':
          alerts.orderCancelled(
            jobId: (data['jobId'] ?? '').toString(),
            orderId: (data['orderId'] ?? '').toString(),
            orderNumber: (data['orderNumber'] ?? '').toString(),
          );
      }
    });
    FirebaseMessaging.instance.onTokenRefresh.listen(_send);
  }

  /// Fetch the current token and send it to the backend (after login / app start).
  Future<void> register() async {
    if (!_firebaseAvailable || _store.token == null) return;
    try {
      await FirebaseMessaging.instance.requestPermission();
      final token = await FirebaseMessaging.instance.getToken();
      if (token != null) await _send(token);
    } catch (e) {
      debugPrint('FCM token fetch failed: $e');
    }
  }

  Future<void> _send(String token) async {
    if (_store.token == null) return;
    try {
      await _jobs.registerFcmToken(token, await _deviceId());
    } catch (e) {
      debugPrint('FCM token registration failed: $e');
    }
  }

  /// Best-effort clear on logout. Must run while the session token is still valid.
  Future<void> unregister() async {
    if (!_firebaseAvailable || _store.token == null) return;
    try {
      await _jobs.unregisterFcmToken(await _deviceId());
    } catch (e) {
      debugPrint('FCM token unregister failed: $e');
    }
  }

  static Future<String?> _deviceId() async {
    try {
      final info = DeviceInfoPlugin();
      if (Platform.isAndroid) return (await info.androidInfo).id;
      if (Platform.isIOS) return (await info.iosInfo).identifierForVendor;
    } catch (_) {}
    return null;
  }
}
