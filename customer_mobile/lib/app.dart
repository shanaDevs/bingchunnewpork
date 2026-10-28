import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'providers/auth_provider.dart';
import 'providers/fulfillment_provider.dart';
import 'providers/splash_provider.dart';
import 'l10n/app_localizations.dart';
import 'services/notification_service.dart';
import 'screens/login_screen.dart';
import 'screens/splash_screen.dart';
import 'screens/dashboard_screen.dart';
import 'screens/menu_screen.dart';
import 'screens/product_detail_screen.dart';
import 'screens/cart_screen.dart';
import 'screens/orders_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/my_profile_screen.dart';
import 'screens/address_book_screen.dart';
import 'screens/payment_methods_screen.dart';
import 'screens/refer_earn_screen.dart';
import 'screens/rewards_screen.dart';
import 'screens/help_support_screen.dart';
import 'screens/settings_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/wishlist_screen.dart';
import 'screens/checkout_screen.dart';
import 'screens/order_tracking_screen.dart';
import 'screens/live_delivery_map_screen.dart';
import 'screens/fulfillment_setup_screen.dart';
import 'screens/store_locator_screen.dart';
import 'screens/main_shell_screen.dart';
import 'providers/theme_provider.dart';
import 'theme/bc_theme.dart';
import 'models/product.dart';
import 'utils/app_toast.dart';

/// Global navigator key — used by [NotificationService] to push routes
/// when the user taps a push notification.
final navigatorKey = GlobalKey<NavigatorState>();

final routerProvider = Provider<GoRouter>((ref) {
  // After a cold start, always land logged-in users on the dashboard — not the
  // last visited tab (GoRouter / OS may restore /menu or /cart).
  var resolvedStartup = false;

  return GoRouter(
    navigatorKey: navigatorKey,
    refreshListenable: _AuthRefresh(ref),
    initialLocation: '/splash',
    redirect: (context, state) {
      final auth = ref.read(authProvider);
      final path = state.matchedLocation;
      final onLogin = path == '/login' || path == '/register';
      final onSplash = path == '/splash';

      // Hold on splash until auth is ready AND the web-parity min display elapsed.
      final splashReady = ref.read(splashMinElapsedProvider);
      if (auth.status == AuthStatus.initial || !splashReady) {
        return onSplash ? null : '/splash';
      }

      final isAuthenticated = auth.status == AuthStatus.authenticated;
      final profileComplete =
          (auth.user?.isProfileComplete ?? false) || auth.isProfileConfirmed;

      // Signed out — always reset startup routing and land on login.
      if (!isAuthenticated) {
        resolvedStartup = false;
        if (!onLogin) return '/login';
      }

      // Authenticated but profile incomplete — stay on login for details step
      if (isAuthenticated && !profileComplete && !onLogin) {
        return '/login';
      }

      if (isAuthenticated && profileComplete) {
        // First redirect once auth is known this session → dashboard.
        // Order method (delivery/pickup) is chosen later from home/cart —
        // never forced right after splash/login.
        if (!resolvedStartup) {
          resolvedStartup = true;
          if (onSplash || onLogin) return '/home';
        }
        if (onLogin) return '/home';
      }

      // Splash exit: signed-out → login; signed-in → home (not order method).
      if (onSplash) {
        return isAuthenticated && profileComplete ? '/home' : '/login';
      }

      return null;
    },
    routes: [
      GoRoute(
        path: '/splash',
        builder: (context, state) => const SplashScreen(),
      ),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(
        path: '/register',
        builder: (context, state) => const LoginScreen(),
      ),
      ShellRoute(
        builder: (context, state, child) => MainShellScreen(child: child),
        routes: [
          GoRoute(
            path: '/home',
            builder: (context, state) => const DashboardScreen(),
          ),
          GoRoute(
            path: '/menu',
            builder: (context, state) => MenuScreen(
              initialCategorySlug: state.uri.queryParameters['category'],
            ),
          ),
          GoRoute(
            path: '/stores',
            builder: (context, state) => const StoreLocatorScreen(),
          ),
          GoRoute(
            path: '/orders',
            builder: (context, state) => const OrdersScreen(),
          ),
          GoRoute(
            path: '/rewards',
            builder: (context, state) => const RewardsScreen(),
          ),
          GoRoute(
            path: '/cart',
            builder: (context, state) => const CartScreen(),
          ),
          GoRoute(
            path: '/profile',
            builder: (context, state) => const ProfileScreen(),
          ),
        ],
      ),
      GoRoute(
        path: '/fulfillment-setup',
        builder: (context, state) {
          final mode = state.uri.queryParameters['mode'];
          final required = state.uri.queryParameters['required'] == '1';
          return FulfillmentSetupScreen(
            initialMode: mode,
            isRequired: required,
          );
        },
      ),
      GoRoute(
        path: '/product/:productId',
        builder: (context, state) {
          final prodId = state.pathParameters['productId']!;
          final product = state.extra as Product?;
          return ProductDetailScreen(
            productId: prodId,
            initialProduct: product,
          );
        },
      ),
      GoRoute(
        path: '/checkout',
        builder: (context, state) => const CheckoutScreen(),
      ),
      GoRoute(
        path: '/track/:orderId',
        builder: (context, state) {
          final orderId = state.pathParameters['orderId']!;
          return OrderTrackingScreen(orderId: orderId);
        },
        routes: [
          GoRoute(
            path: 'live-map',
            builder: (context, state) {
              final orderId = state.pathParameters['orderId']!;
              return LiveDeliveryMapScreen(orderId: orderId);
            },
          ),
        ],
      ),
      GoRoute(
        path: '/profile/details',
        builder: (context, state) => const MyProfileScreen(),
      ),
      GoRoute(
        path: '/profile/addresses',
        builder: (context, state) => const AddressBookScreen(),
      ),
      GoRoute(
        path: '/profile/payments',
        builder: (context, state) => const PaymentMethodsScreen(),
      ),
      GoRoute(
        path: '/profile/referral',
        builder: (context, state) => const ReferEarnScreen(),
      ),
      GoRoute(
        path: '/profile/support',
        builder: (context, state) => const HelpSupportScreen(),
      ),
      GoRoute(
        path: '/profile/settings',
        builder: (context, state) => const SettingsScreen(),
      ),
      GoRoute(
        path: '/notifications',
        builder: (context, state) => const NotificationsScreen(),
      ),
      GoRoute(
        path: '/wishlist',
        builder: (context, state) => const WishlistScreen(),
      ),
      GoRoute(path: '/', redirect: (_, _) => '/home'),
    ],
  );
});

class BingChunCustomerApp extends ConsumerStatefulWidget {
  const BingChunCustomerApp({super.key});

  @override
  ConsumerState<BingChunCustomerApp> createState() =>
      _BingChunCustomerAppState();
}

class _BingChunCustomerAppState extends ConsumerState<BingChunCustomerApp> {
  @override
  void initState() {
    super.initState();
    // Set navigator key so notification taps can push routes.
    NotificationService.instance.navigatorKey = navigatorKey;
    // Init after first frame so providers are ready.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final api = ref.read(apiClientProvider);
      NotificationService.instance.init(apiClient: api);
    });
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    final themeMode = ref.watch(themeModeProvider);

    ref.listen<AuthState>(authProvider, (prev, next) {
      if (next.status == AuthStatus.authenticated &&
          prev?.status != AuthStatus.authenticated) {
        NotificationService.instance.registerToken(ref.read(apiClientProvider));
      }
    });

    return MaterialApp.router(
      scaffoldMessengerKey: rootScaffoldMessengerKey,
      title: 'Bing Chun Customer',
      debugShowCheckedModeBanner: false,
      theme: BcTheme.light,
      darkTheme: BcTheme.dark,
      themeMode: themeMode,
      locale: const Locale('en'),
      supportedLocales: AppLocalizations.supportedLocales,
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      routerConfig: router,
      builder: (context, child) => TopToastHost(child: child),
    );
  }
}

class _AuthRefresh extends ChangeNotifier {
  _AuthRefresh(this.ref) {
    ref.listen<AuthState>(authProvider, (_, _) => notifyListeners());
    ref.listen<FulfillmentState>(
      fulfillmentProvider,
      (_, _) => notifyListeners(),
    );
    ref.listen<bool>(splashMinElapsedProvider, (_, _) => notifyListeners());
    // Do not listen to orderProvider — polling would rebuild the entire router each tick.
  }

  final Ref ref;
}
