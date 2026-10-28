/// Origin of the backend (no `/api` suffix). Dio appends [apiPrefix].
/// Override locally with `--dart-define=API_BASE=http://localhost:4000`.
abstract final class AppConstants {
  static const apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'https://bing-chung-b.mp.dartcodes.com',
  );

  static const apiPrefix = '/api';

  static const connectTimeout = Duration(seconds: 20);
  static const receiveTimeout = Duration(seconds: 20);

  static const otpLength = 6;
  static const otpTtl = Duration(minutes: 10);
  static const nameMinLength = 2;
  static const referralMaxLength = 32;

  static const getRetryCount = 2;
  static const channelApp = 'APP';
  static const platformApp = 1;
}
