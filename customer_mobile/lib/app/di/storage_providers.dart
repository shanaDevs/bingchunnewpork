import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/network/session_invalidator.dart';
import '../../core/notifications/fcm_service.dart';
import '../../core/storage/local/app_meta_store.dart';
import '../../core/storage/secure/secure_store.dart';

final secureStoreProvider = Provider<SecureStore>((ref) => SecureStore());

final appMetaStoreProvider = Provider<AppMetaStore>((ref) => PrefsMetaStore());

final sessionInvalidatorProvider =
    Provider<SessionInvalidator>((ref) => SessionInvalidator());

final fcmServiceProvider = Provider<FcmService>((ref) => FcmService());
