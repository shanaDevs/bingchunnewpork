import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/router/app_router.dart';
import 'theme/bc_theme.dart';

class BingChunDeliveryApp extends ConsumerWidget {
  const BingChunDeliveryApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = buildAppRouter(ref);

    return MaterialApp.router(
      title: 'Bing Chun Delivery',
      debugShowCheckedModeBanner: false,
      theme: BcTheme.dark,
      routerConfig: router,
    );
  }
}
