import 'package:flutter/material.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'app.dart';
import 'core/app_container.dart';
import 'core/runtime_config.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('en');
  await initializeDateFormatting('zh');
  await RuntimeConfig.instance.init();
  final container = await AppContainer.create();
  runApp(BingChunAdminApp(container: container));
}
