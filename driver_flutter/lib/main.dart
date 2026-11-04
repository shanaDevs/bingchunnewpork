import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'core/app_container.dart';
import 'core/duty_service.dart';
import 'core/notifications.dart';
import 'core/push.dart';
import 'core/runtime_config.dart';
import 'core/system_settings.dart';

/// Port of BingChunApp.kt + MainActivity.kt startup.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Only the incoming-ride card may stay over the lock screen.
  SystemSettings.initLockScreenGuard();
  await initializeDateFormatting('en');
  await initializeDateFormatting('zh');
  await RuntimeConfig.instance.init();
  await PushTokens.initFirebase();
  await BcNotifications.init();
  DutyService.init();

  final container = await AppContainer.create();
  // Start GPS + internet monitoring early so the lock overlay is ready on first frame.
  container.deviceRequirements.start();
  container.pushTokens.listenForeground(container.alertService);

  runApp(BingChunDriverApp(container: container));
}
