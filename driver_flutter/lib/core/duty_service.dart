import 'package:flutter/foundation.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';

import '../l10n/l10n.dart';

/// Keeps the app process alive with an ongoing "On duty" notification while the
/// rider is online — the Flutter side of the Kotlin DriverAlertService's
/// startForeground(). The socket, polling and ringing all run in the app's main
/// isolate ([AlertService]); this service just stops Android from killing it.
class DutyService {
  DutyService._();

  static bool _initialized = false;

  static void init() {
    if (_initialized) return;
    _initialized = true;
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'bc_duty_service_v1',
        channelName: tr('On duty status'),
        channelDescription: tr('Shown while you are online and waiting for jobs'),
        channelImportance: NotificationChannelImportance.LOW,
        priority: NotificationPriority.LOW,
      ),
      iosNotificationOptions: const IOSNotificationOptions(showNotification: false),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.nothing(),
        allowWakeLock: true,
        allowWifiLock: true,
        autoRunOnBoot: false,
      ),
    );
  }

  static Future<void> start({bool trackingActive = false}) async {
    if (defaultTargetPlatform != TargetPlatform.android) return;
    init();
    final text = trackingActive ? tr('Tracking active ride…') : tr('Waiting for delivery jobs…');
    try {
      if (await FlutterForegroundTask.isRunningService) {
        await FlutterForegroundTask.updateService(notificationTitle: tr('On duty'), notificationText: text);
        return;
      }
      await FlutterForegroundTask.startService(
        serviceId: 1001,
        serviceTypes: const [ForegroundServiceTypes.dataSync, ForegroundServiceTypes.location],
        notificationTitle: tr('On duty'),
        notificationText: text,
        notificationIcon: const NotificationIcon(metaDataName: 'lk.bingchun.delivery.DUTY_ICON'),
      );
    } catch (e) {
      debugPrint('Duty service start failed: $e');
    }
  }

  static Future<void> stop() async {
    if (defaultTargetPlatform != TargetPlatform.android) return;
    try {
      if (await FlutterForegroundTask.isRunningService) await FlutterForegroundTask.stopService();
    } catch (_) {}
  }
}
