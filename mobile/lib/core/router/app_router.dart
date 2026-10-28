import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/dev_config.dart';
import '../../providers/auth_provider.dart';
import '../../screens/dashboard_screen.dart';
import '../../screens/job_detail_screen.dart';
import '../../screens/jobs_screen.dart';
import '../../screens/login_screen.dart';
import '../../screens/order_detail_screen.dart';
import '../../screens/route_map_screen.dart';

/// Builds the app's [GoRouter]. Extracted from `app.dart` so routing lives
/// under `core/` per the Clean Architecture layout, independent of the
/// widget tree that wires it into [MaterialApp.router].
GoRouter buildAppRouter(WidgetRef ref) {
  return GoRouter(
    refreshListenable: AuthRefreshListenable(ref),
    redirect: (context, state) {
      final auth = ref.read(authProvider);
      final path = state.matchedLocation;
      final onLogin = path == '/login';

      if (kUiPreviewMode) {
        if (onLogin && auth.isAuthenticated) return '/jobs';
        if (!auth.isAuthenticated && !onLogin) return '/login';
        return null;
      }

      if (auth.checking) return null;
      if (!auth.isAuthenticated && !onLogin) return '/login';
      if (auth.isAuthenticated && onLogin) return '/jobs';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/jobs', builder: (context, state) => const JobsScreen()),
      GoRoute(
        path: '/jobs/:jobId',
        builder: (context, state) => JobDetailScreen(jobId: state.pathParameters['jobId']!),
        routes: [
          GoRoute(
            path: 'map',
            builder: (context, state) => RouteMapScreen(jobId: state.pathParameters['jobId']!),
          ),
          GoRoute(
            path: 'orders/:orderId',
            builder: (context, state) => OrderDetailScreen(
              jobId: state.pathParameters['jobId']!,
              orderId: state.pathParameters['orderId']!,
            ),
          ),
        ],
      ),
      GoRoute(
        path: '/dashboard/:jobId',
        builder: (context, state) => DashboardScreen(jobId: state.pathParameters['jobId']!),
        routes: [
          GoRoute(
            path: 'map',
            builder: (context, state) => RouteMapScreen(jobId: state.pathParameters['jobId']!),
          ),
        ],
      ),
      GoRoute(path: '/', redirect: (context, state) => '/jobs'),
      GoRoute(path: '/route', redirect: (context, state) => '/jobs'),
    ],
  );
}

/// Notifies [GoRouter] to re-run its `redirect` whenever auth state changes.
class AuthRefreshListenable extends ChangeNotifier {
  AuthRefreshListenable(this.ref) {
    ref.listen<AuthState>(authProvider, (previous, next) => notifyListeners());
  }

  final WidgetRef ref;
}
