import 'dart:convert';
import 'dart:developer' as developer;

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';
import '../services/api_client.dart';

// ─── Background message handler (must be top-level) ────────────────────────
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

// ─── Notification Service ────────────────────────────────────────────────────
class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  final FirebaseMessaging _fcm = FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _localNotif =
      FlutterLocalNotificationsPlugin();

  GlobalKey<NavigatorState>? navigatorKey;
  ApiClient? _api;
  bool _listenersAttached = false;
  String? _lastUploadedToken;

  // Bump channel ids when replacing raw sounds — Android caches channel sound.
  static const _placedChannelId = 'bing_chun_orders_placed_v4';
  static const _updateChannelId = 'bing_chun_orders_v3';

  static const _placedChannel = AndroidNotificationChannel(
    _placedChannelId,
    'Order Placed',
    description: 'Confirmation when your order is placed.',
    importance: Importance.high,
    playSound: true,
    sound: RawResourceAndroidNotificationSound('order_placed'),
  );

  static const _updateChannel = AndroidNotificationChannel(
    _updateChannelId,
    'Order Updates',
    description: 'Real-time order status notifications from Bing Chun.',
    importance: Importance.high,
    playSound: true,
    sound: RawResourceAndroidNotificationSound('order_update'),
  );

  final Set<String> _placedOrderIds = {};
  final Map<String, String> _lastStatusByOrder = {};

  Future<void> init({ApiClient? apiClient}) async {
    _api = apiClient ?? _api;

    final androidPlugin = _localNotif
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();
    await androidPlugin?.createNotificationChannel(_placedChannel);
    await androidPlugin?.createNotificationChannel(_updateChannel);

    const initSettings = InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(
        requestAlertPermission: false,
        requestBadgePermission: false,
        requestSoundPermission: false,
      ),
    );
    await _localNotif.initialize(
      initSettings,
      onDidReceiveNotificationResponse: _onLocalNotifTap,
    );

    // Request Android 13+ notification permission explicitly
    await androidPlugin?.requestNotificationsPermission();

    final settings = await _fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );
    final granted =
        settings.authorizationStatus == AuthorizationStatus.authorized ||
            settings.authorizationStatus == AuthorizationStatus.provisional;

    if (granted) {
      await _fcm.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
      _attachListeners();
    } else {
      developer.log(
        'Notification permission not granted (${settings.authorizationStatus})',
        name: 'NotificationService',
      );
    }

    // Always try to register the FCM token when we have an authenticated API client.
    // Permission denial still allows a token on many Android versions; backend needs it.
    if (_api != null) {
      await registerToken(_api!);
    }

    _fcm.onTokenRefresh.listen((newToken) {
      final api = _api;
      if (api != null) _uploadToken(api, newToken);
    });
  }

  void _attachListeners() {
    if (_listenersAttached) return;
    _listenersAttached = true;
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleMessageTap);

    _fcm.getInitialMessage().then((initial) {
      if (initial != null) _handleMessageTap(initial);
    });
  }

  Future<void> registerToken(ApiClient api) async {
    _api = api;
    try {
      final hasAuth = await api.hasAuthToken();
      if (!hasAuth) {
        developer.log('Skip FCM upload — not authenticated yet', name: 'NotificationService');
        return;
      }
      final token = await _fcm.getToken();
      if (token == null || token.isEmpty) {
        developer.log('FCM getToken() returned null', name: 'NotificationService');
        return;
      }
      await _uploadToken(api, token);
    } catch (e, st) {
      developer.log('registerToken failed: $e', name: 'NotificationService', stackTrace: st);
    }
  }

  Future<void> unregisterToken(ApiClient api) async {
    try {
      final token = await _fcm.getToken();
      if (token == null) return;
      await api.delete<void>(
        '/notifications/fcm-token',
        body: {'token': token},
      );
      _lastUploadedToken = null;
      await _fcm.deleteToken();
    } catch (e, st) {
      developer.log('unregisterToken failed: $e', name: 'NotificationService', stackTrace: st);
    }
  }

  Future<void> _uploadToken(ApiClient api, String token) async {
    if (_lastUploadedToken == token) return;
    try {
      // Backend upserts on conflict — no need to DELETE first.
      await api.post<void>('/notifications/fcm-token', {'token': token});
      _lastUploadedToken = token;
      developer.log('FCM token registered (${token.substring(0, 12)}…)', name: 'NotificationService');
    } catch (e, st) {
      developer.log('FCM token upload failed: $e', name: 'NotificationService', stackTrace: st);
    }
  }

  Future<void> showOrderPlaced({
    required String orderId,
    required String orderNumber,
    String? orderMode,
  }) async {
    if (_placedOrderIds.contains(orderId)) return;
    _placedOrderIds.add(orderId);

    final mode = orderMode == 'DELIVERY' ? 'delivery' : 'pickup';
    await _showLocal(
      id: orderId.hashCode,
      title: 'Order placed successfully!',
      body: 'Your $mode order #$orderNumber has been placed. We\'ll keep you updated.',
      data: {
        'orderId': orderId,
        'orderNumber': orderNumber,
        'type': 'ORDER_PLACED',
      },
      placed: true,
    );
  }

  Future<void> showOrderStatusUpdate({
    required String orderId,
    required String orderNumber,
    required String status,
    required String title,
    required String body,
  }) async {
    if (_lastStatusByOrder[orderId] == status) return;
    _lastStatusByOrder[orderId] = status;

    await _showLocal(
      id: '$orderId-$status'.hashCode,
      title: title,
      body: body,
      data: {
        'orderId': orderId,
        'orderNumber': orderNumber,
        'status': status,
        'type': 'ORDER_STATUS',
      },
      placed: false,
    );
  }

  Future<void> _showLocal({
    required int id,
    required String title,
    required String body,
    required Map<String, String> data,
    required bool placed,
  }) async {
    final channel = placed ? _placedChannel : _updateChannel;
    final iosSound = placed ? 'order_placed.wav' : 'order_update.wav';

    await _localNotif.show(
      id,
      title,
      body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          channel.id,
          channel.name,
          channelDescription: channel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
          sound: placed
              ? const RawResourceAndroidNotificationSound('order_placed')
              : const RawResourceAndroidNotificationSound('order_update'),
        ),
        iOS: DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
          sound: iosSound,
        ),
      ),
      payload: jsonEncode(data),
    );
  }

  Future<void> _handleForegroundMessage(RemoteMessage message) async {
    final notification = message.notification;
    if (notification == null) return;

    final data = message.data;
    final type = data['type'] ?? data['sound'];
    final placed = type == 'ORDER_PLACED' || data['sound'] == 'order_placed';
    final orderId = data['orderId'];

    if (placed && orderId != null && orderId.isNotEmpty) {
      if (_placedOrderIds.contains(orderId)) return;
      _placedOrderIds.add(orderId);
    }

    if (!placed && orderId != null && data['status'] != null) {
      if (_lastStatusByOrder[orderId] == data['status']) return;
      _lastStatusByOrder[orderId] = data['status']!;
    }

    await _showLocal(
      id: notification.hashCode,
      title: notification.title ?? 'Bing Chun',
      body: notification.body ?? '',
      data: Map<String, String>.from(data),
      placed: placed,
    );
  }

  void _onLocalNotifTap(NotificationResponse response) {
    if (response.payload == null) return;
    try {
      final data = jsonDecode(response.payload!) as Map<String, dynamic>;
      _navigateFromData(data);
    } catch (_) {}
  }

  void _handleMessageTap(RemoteMessage message) {
    _navigateFromData(message.data);
  }

  void _navigateFromData(Map<String, dynamic> data) {
    final orderId = data['orderId'] as String?;
    final context = navigatorKey?.currentContext;
    if (context == null) return;

    if (orderId != null && orderId.isNotEmpty) {
      context.push('/track/$orderId');
    } else {
      context.go('/orders');
    }
  }
}
