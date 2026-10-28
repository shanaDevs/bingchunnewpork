import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/foundation.dart';
import 'package:flutter/painting.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:vibration/vibration.dart';

import 'ride_alert.dart';
import '../l10n/l10n.dart';

/// Taps and action buttons on our notifications, delivered to the app.
sealed class NotificationTap {
  const NotificationTap();
}

/// Body tap on a new-job alert → show the incoming ride card.
class OpenIncomingRide extends NotificationTap {
  final RideAlert alert;
  const OpenIncomingRide(this.alert);
}

/// "ACCEPT RIDE" button → claim straight away.
class AcceptRide extends NotificationTap {
  final RideAlert alert;
  const AcceptRide(this.alert);
}

/// "Silence" button or swipe-away → stop ringing this job.
class SilenceRide extends NotificationTap {
  final String jobId;
  const SilenceRide(this.jobId);
}

/// Duty / cancellation notification tap → open the Jobs tab.
class OpenJobsTab extends NotificationTap {
  const OpenJobsTab();
}

/// System notification channels + builders — port of BcNotifications.kt.
///
/// Channel ids are versioned because Android freezes a channel's sound and
/// importance at creation time — change the suffix if the tone or behaviour changes.
class BcNotifications {
  BcNotifications._();

  // Silent: AlertService owns the looping alert sound.
  static const channelNewJob = 'bc_new_job_v2';
  static const channelDuty = 'bc_duty_v1';
  static const channelOrderCancelled = 'bc_order_cancelled_v1';

  static const dutyNotificationId = 1001;
  static const _newJobBaseId = 2000;
  static const _orderCancelledBaseId = 3000;

  static const _actionAccept = 'accept_ride';
  static const _actionSilence = 'silence_ride';

  static final Int64List cancelVibratePattern = Int64List.fromList([0, 250, 150, 250]);
  static final Int64List _newJobVibratePattern = Int64List.fromList([0, 350, 200, 350, 200, 500]);

  static final FlutterLocalNotificationsPlugin plugin = FlutterLocalNotificationsPlugin();
  static final _taps = StreamController<NotificationTap>.broadcast();
  static Stream<NotificationTap> get taps => _taps.stream;

  static bool _initialized = false;

  /// The tap that launched the app from a terminated state, if any.
  static NotificationTap? launchTap;

  static Future<void> init() async {
    if (_initialized) return;
    _initialized = true;
    const settings = InitializationSettings(
      android: AndroidInitializationSettings('ic_stat_duty'),
      iOS: DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      ),
    );
    await plugin.initialize(settings: settings, onDidReceiveNotificationResponse: _onResponse);
    await _ensureChannels();
    try {
      final launch = await plugin.getNotificationAppLaunchDetails();
      final response = launch?.notificationResponse;
      if ((launch?.didNotificationLaunchApp ?? false) && response != null) {
        launchTap = _parse(response);
      }
    } catch (_) {}
  }

  static AndroidFlutterLocalNotificationsPlugin? get _android =>
      plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>();

  static Future<void> _ensureChannels() async {
    final android = _android;
    if (android == null) return;
    await android.createNotificationChannel(
      AndroidNotificationChannel(
        channelNewJob,
        tr('New delivery jobs'),
        description: tr('Alerts that ring until the driver silences them'),
        importance: Importance.max,
        playSound: false,
        enableVibration: true,
        vibrationPattern: _newJobVibratePattern,
        enableLights: true,
      ),
    );
    await android.createNotificationChannel(
      AndroidNotificationChannel(
        channelOrderCancelled,
        tr('Cancelled orders'),
        description: tr('Alerts when a stop on your active ride is cancelled'),
        importance: Importance.max,
        playSound: false,
        enableVibration: true,
        vibrationPattern: cancelVibratePattern,
        enableLights: true,
      ),
    );
    await android.createNotificationChannel(
      AndroidNotificationChannel(
        channelDuty,
        tr('On duty status'),
        description: tr('Shown while you are online and waiting for jobs'),
        importance: Importance.low,
        playSound: false,
        enableVibration: false,
        showBadge: false,
      ),
    );
  }

  /// Asks for POST_NOTIFICATIONS (Android 13+) / alert permission (iOS).
  static Future<void> requestPermission() async {
    try {
      await _android?.requestNotificationsPermission();
      await plugin.resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()?.requestPermissions(
        alert: true,
        badge: true,
        sound: true,
        critical: true,
      );
    } catch (_) {}
  }

  /// Android 14+ gates full-screen intents behind a user setting.
  static Future<void> requestFullScreenPermission() async {
    try {
      await _android?.requestFullScreenIntentPermission();
    } catch (_) {}
  }

  static void _onResponse(NotificationResponse response) {
    final tap = _parse(response);
    if (tap != null) _taps.add(tap);
  }

  static NotificationTap? _parse(NotificationResponse response) {
    final payload = response.payload;
    if (payload == null || payload.isEmpty) return const OpenJobsTab();
    try {
      final data = Map<String, dynamic>.from(jsonDecode(payload) as Map);
      if (data['kind'] == 'ride') {
        final alert = RideAlert.fromPush(Map<String, dynamic>.from(data['alert'] as Map));
        switch (response.actionId) {
          case _actionAccept:
            return AcceptRide(alert);
          case _actionSilence:
            return SilenceRide(alert.jobId);
          default:
            return OpenIncomingRide(alert);
        }
      }
    } catch (_) {}
    return const OpenJobsTab();
  }

  /// Loud heads-up / full-screen alert for a new delivery ride.
  static Future<void> notifyNewJob(RideAlert alert) async {
    final android = AndroidNotificationDetails(
      channelNewJob,
      tr('New delivery jobs'),
      channelDescription: tr('Alerts that ring until the driver silences them'),
      importance: Importance.max,
      priority: Priority.max,
      category: AndroidNotificationCategory.call,
      fullScreenIntent: true,
      ongoing: true,
      autoCancel: false,
      onlyAlertOnce: true,
      playSound: false,
      vibrationPattern: _newJobVibratePattern,
      ticker: alert.notificationTitle,
      // Brand look: blue accent, app logo as the large icon, rich expanded text.
      color: const Color(0xFF1A5CD4),
      largeIcon: const DrawableResourceAndroidBitmap('splash_icon'),
      subText: tr('Tap to view the ride'),
      styleInformation: BigTextStyleInformation(
        alert.notificationBody,
        contentTitle: alert.notificationTitle,
        summaryText: tr('Bing Chun Delivery'),
      ),
      actions: [
        AndroidNotificationAction(
          _actionAccept,
          tr('✓ Accept ride'),
          showsUserInterface: true,
          titleColor: const Color(0xFF16A34A),
        ),
        // Same as Dismiss on the in-app card: stops the alert for this ride on this phone.
        AndroidNotificationAction(_actionSilence, tr('Decline'), titleColor: const Color(0xFFDC2626)),
      ],
    );
    const ios = DarwinNotificationDetails(
      presentAlert: true,
      presentSound: true,
      interruptionLevel: InterruptionLevel.timeSensitive,
    );
    try {
      await plugin.show(
        id: _newJobId(alert.jobId),
        title: alert.notificationTitle,
        body: alert.shortBody,
        notificationDetails: NotificationDetails(android: android, iOS: ios),
        payload: jsonEncode({'kind': 'ride', 'alert': alert.toJson()}),
      );
    } catch (e) {
      debugPrint('notifyNewJob failed: $e');
    }
  }

  static Future<void> cancelJob(String jobId) async {
    try {
      await plugin.cancel(id: _newJobId(jobId));
    } catch (_) {}
  }

  /// Heads-up alert when a stop on the rider's active ride is cancelled.
  static Future<void> notifyOrderCancelled(String orderId, String orderNumber) async {
    final label = orderNumber.trim().isEmpty ? tr('An order') : orderNumber;
    final android = AndroidNotificationDetails(
      channelOrderCancelled,
      tr('Cancelled orders'),
      channelDescription: tr('Alerts when a stop on your active ride is cancelled'),
      importance: Importance.max,
      priority: Priority.high,
      category: AndroidNotificationCategory.event,
      autoCancel: true,
      playSound: false,
      vibrationPattern: cancelVibratePattern,
      styleInformation: BigTextStyleInformation(
        tr(
          '{label} was cancelled by the customer. Do not deliver this stop; it has been marked Cancelled on your run.',
          {'label': label},
        ),
      ),
    );
    try {
      await plugin.show(
        id: _orderCancelledId(orderId),
        title: tr('Order cancelled'),
        body: tr('{label} was cancelled — skip this stop.', {'label': label}),
        notificationDetails: NotificationDetails(
          android: android,
          iOS: const DarwinNotificationDetails(interruptionLevel: InterruptionLevel.timeSensitive),
        ),
        payload: jsonEncode({'kind': 'jobs'}),
      );
    } catch (e) {
      debugPrint('notifyOrderCancelled failed: $e');
    }
  }

  static Future<void> cancelOrderCancelled(String orderId) async {
    try {
      await plugin.cancel(id: _orderCancelledId(orderId));
    } catch (_) {}
  }

  /// Direct vibrator pulse for a cancelled stop. Not gated by the haptics toggle.
  static Future<void> vibrateCancel() async {
    try {
      if (await Vibration.hasVibrator()) {
        await Vibration.vibrate(pattern: cancelVibratePattern.toList());
      }
    } catch (_) {}
  }

  // Same masking as the Kotlin ids, using a stable string hash.
  static int _newJobId(String jobId) => _newJobBaseId + (_stableHash(jobId) & 0x7FFF);
  static int _orderCancelledId(String orderId) => _orderCancelledBaseId + (_stableHash(orderId) & 0x7FFF);

  static int _stableHash(String s) {
    var h = 0;
    for (final c in s.codeUnits) {
      h = (31 * h + c) & 0x7FFFFFFF;
    }
    return h;
  }
}
