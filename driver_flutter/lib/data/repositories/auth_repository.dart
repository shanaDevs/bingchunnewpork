import 'dart:convert';

import 'package:dio/dio.dart';

import '../json.dart';
import '../local/secure_store.dart';
import '../models/driver.dart';
import '../network/api_client.dart';

/// Port of AuthRepository.kt.
class AuthRepository {
  AuthRepository(this._api, this._store);

  final ApiClient _api;
  final SecureStore _store;

  /// Texts a 6-digit sign-in code to [phone]; returns the challenge the code is checked against.
  Future<String> requestLoginOtp(String phone, {String? appSignature}) async {
    final res = await _api.call(
      () => _api.core.post<dynamic>(
        'auth/delivery/otp/request',
        data: compact({'phone': phone, 'appSignature': appSignature}),
      ),
      (d) => asJson(d),
    );
    return str(res, 'challenge');
  }

  /// Verifies the code, then signs in the rider registered with [phone].
  Future<DriverSession> login(String phone, String code, String challenge) async {
    final res = await _api.call(
      () => _api.core.post<dynamic>(
        'auth/delivery/login',
        data: {'phone': phone, 'code': code, 'challenge': challenge},
      ),
      (d) => asJson(d),
    );
    final driver = DriverSession.fromJson(asJson(res['driver']));
    _store.token = str(res, 'token');
    _store.driverJson = jsonEncode(driver.toJson());
    return driver;
  }

  Future<List<BranchOption>> listStores() =>
      _api.call(() => _api.core.get<dynamic>('stores'), (d) => _list(d, BranchOption.fromJson));

  Future<void> createBranchRequest(String type, String toStoreId, {String? reason, String? fromStoreId}) => _api.call(
    () => _api.core.post<dynamic>(
      'delivery/me/branch-requests',
      data: compact({
        'type': type,
        'toStoreId': toStoreId,
        'fromStoreId': fromStoreId,
        'reason': (reason != null && reason.trim().isNotEmpty) ? reason : null,
      }),
    ),
    (_) {},
  );

  Future<List<DriverBranchRequest>> listBranchRequests() => _api.call(
    () => _api.core.get<dynamic>('delivery/me/branch-requests'),
    (d) => _list(d, DriverBranchRequest.fromJson),
  );

  Future<DriverProfile> getMe() async {
    final profile = await _api.call(
      () => _api.core.get<dynamic>('delivery/me'),
      (d) => DriverProfile.fromJson(asJson(d)),
    );
    return ensureLicenseImageUrl(profile);
  }

  /// When the DB has a licence but GET /me omitted presign, fetch a dedicated signed URL.
  Future<DriverProfile> ensureLicenseImageUrl(DriverProfile profile) async {
    final hasUrl = profile.licenseImageUrl != null && profile.licenseImageUrl!.trim().isNotEmpty;
    if (!profile.hasLicenseImage || hasUrl) return profile;
    final url = await fetchLicenseImageUrl();
    if (url == null) return profile;
    return profile.copyWith(licenseImageUrl: url);
  }

  Future<String?> fetchLicenseImageUrl() async {
    try {
      final data = await _api.call(
        () => _api.core.get<dynamic>('delivery/me/license-image'),
        (d) => asJson(d),
      );
      return strOrNull(data, 'licenseImageUrl');
    } catch (_) {
      return null;
    }
  }

  /// Uploads a new profile photo; returns the stored photo URL.
  Future<String> uploadProfilePhoto(String filePath) async {
    final name = filePath.split(RegExp(r'[\/]')).last;
    final form = FormData.fromMap({'profilePhoto': await MultipartFile.fromFile(filePath, filename: name)});
    final res = await _api.call(
      () => _api.core.patch<dynamic>('delivery/me/profile-photo', data: form),
      (d) => asJson(d),
    );
    return str(res, 'profilePhotoUrl');
  }

  Future<List<DriverShiftEntry>> getShiftHistory() =>
      _api.call(() => _api.core.get<dynamic>('delivery/me/shifts'), (d) => _list(d, DriverShiftEntry.fromJson));

  Future<DriverProfile> setDuty(String dutyStatus, {DriverProfile? current}) async {
    final patch = await _api.call(
      () => _api.core.patch<dynamic>('delivery/me/duty', data: {'dutyStatus': dutyStatus}),
      (d) => asJson(d),
    );
    final patchedStatus = str(patch, 'dutyStatus', dutyStatus);
    final branchPoolStoreIds = DriverProfile.parseStringList(patch, 'branchPoolStoreIds');
    // Duty is authoritative from PATCH. GET /delivery/me can 504 when licence presign
    // stalls on Spaces — do not fail go-online after a successful duty update.
    if (current != null) {
      return current.copyWith(
        dutyStatus: patchedStatus,
        branchPoolStoreIds: branchPoolStoreIds.isNotEmpty ? branchPoolStoreIds : null,
      );
    }
    final session = restore();
    if (session != null) {
      final storeId = session.storeId;
      return DriverProfile(
        id: session.id,
        name: session.name,
        dutyStatus: patchedStatus,
        storeId: storeId,
        store: storeId != null && (session.storeName?.isNotEmpty ?? false)
            ? StoreRef(id: storeId, name: session.storeName!, city: session.storeCity)
            : null,
        branchPoolStoreIds: branchPoolStoreIds,
      );
    }
    try {
      return await getMe();
    } catch (_) {
      rethrow;
    }
  }

  /// Restores a persisted session; returns the driver only when a token is present.
  DriverSession? restore() {
    final token = _store.token;
    if (token == null || token.isEmpty) return null;
    final raw = _store.driverJson;
    if (raw == null) return null;
    try {
      return DriverSession.fromJson(asJson(jsonDecode(raw)));
    } catch (_) {
      return null;
    }
  }

  Future<void> logout() => _store.clear();
}

List<T> _list<T>(Object? data, T Function(Json) parse) =>
    data is List ? data.whereType<Map>().map((e) => parse(asJson(e))).toList() : <T>[];
