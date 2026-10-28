import '../features/auth/data/auth_repository.dart';
import '../models/driver_session.dart';

/// @deprecated Thin wrapper around [AuthRepository] kept so
/// `providers/auth_provider.dart` keeps working unchanged. New code should
/// use [AuthRepository] directly.
class AuthService {
  AuthService({AuthRepository? repository}) : _repository = repository ?? AuthRepository();

  final AuthRepository _repository;

  Future<DriverSession> login(String pin, {String? storeId}) =>
      _repository.login(pin, storeId: storeId);

  Future<String?> getToken() => _repository.getToken();

  Future<DriverSession?> getStoredDriver() => _repository.getStoredDriver();

  Future<void> logout() => _repository.logout();
}
