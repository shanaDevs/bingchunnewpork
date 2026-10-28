/// Thrown by [DioClient] / [ApiClient] whenever a request fails, times out,
/// or the backend responds with `success: false`.
class ApiException implements Exception {
  final String message;
  final int status;

  /// Machine-readable error code from the backend payload (e.g.
  /// `OTP_REQUIRED`), when present. Used to trigger UI flows such as the
  /// OTP entry sheet without string-matching on [message].
  final String? code;

  ApiException(this.message, {this.status = 0, this.code});

  bool get isOtpRequired => code == 'OTP_REQUIRED' || message == 'OTP_REQUIRED';

  @override
  String toString() => message;
}
