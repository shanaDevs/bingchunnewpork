import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:provider/provider.dart';

import 'core/app_container.dart';
import 'core/runtime_config.dart';
import 'l10n/l10n.dart';
import 'presentation/routes.dart';
import 'presentation/screens/home_shell.dart';
import 'presentation/screens/login_screen.dart';
import 'presentation/screens/splash_screen.dart';
import 'presentation/state/auth_controller.dart';
import 'presentation/theme/pos_theme.dart';

class BingChunAdminApp extends StatefulWidget {
  const BingChunAdminApp({super.key, required this.container});
  final AppContainer container;

  @override
  State<BingChunAdminApp> createState() => _BingChunAdminAppState();
}

class _BingChunAdminAppState extends State<BingChunAdminApp> {
  AppLanguage _language = L10n.current;

  @override
  void initState() {
    super.initState();
    RuntimeConfig.instance.addListener(_onConfig);
  }

  @override
  void dispose() {
    RuntimeConfig.instance.removeListener(_onConfig);
    super.dispose();
  }

  /// Language switch: refresh every screen in place (navigation and state are kept).
  void _onConfig() {
    if (_language == L10n.current) return;
    _language = L10n.current;
    L10n.rebuildAll();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        Provider<AppContainer>.value(value: widget.container),
        ChangeNotifierProvider<RuntimeConfig>.value(value: RuntimeConfig.instance),
        ChangeNotifierProvider<AuthController>(create: (_) => AuthController(widget.container)),
      ],
      child: Consumer<RuntimeConfig>(
        builder: (context, rc, _) => MaterialApp(
          title: tr('BingChun Admin'),
          debugShowCheckedModeBanner: false,
          navigatorKey: AppRoutes.navigatorKey,
          locale: rc.language.locale,
          supportedLocales: L10n.supportedLocales,
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          theme: buildPosTheme(false),
          darkTheme: buildPosTheme(true),
          themeMode: switch (rc.themeMode) {
            'DARK' => ThemeMode.dark,
            'SYSTEM' => ThemeMode.system,
            _ => ThemeMode.light,
          },
          home: const _AuthGate(),
        ),
      ),
    );
  }
}

/// Splash → sign-in → cashier shell. Signing out drops every pushed screen.
class _AuthGate extends StatefulWidget {
  const _AuthGate();

  @override
  State<_AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<_AuthGate> {
  bool? _wasAuthed;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthController>();
    final Widget child;
    if (auth.checking) {
      child = const SplashScreen(key: ValueKey('splash'));
    } else {
      final authed = auth.isAuthenticated;
      if (_wasAuthed != null && _wasAuthed != authed) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          AppRoutes.navigatorKey.currentState?.popUntil((r) => r.isFirst);
        });
      }
      _wasAuthed = authed;
      child = authed
          ? HomeShell(key: ValueKey(auth.session!.id), session: auth.session!)
          : const LoginScreen(key: ValueKey('login'));
    }
    return AnimatedSwitcher(duration: const Duration(milliseconds: 350), child: child);
  }
}
