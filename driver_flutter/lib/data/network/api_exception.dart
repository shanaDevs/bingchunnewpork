import 'dart:async';

import '../models/driver.dart';
import '../../l10n/l10n.dart';

/// Port of ApiException.kt.
class ApiException implements Exception {
  final String message;
  final int status;
  final String? code;

  /// Branch options returned with a 409 MULTIPLE_BRANCHES login response.
  final List<BranchOption>? branches;

  const ApiException(this.message, {this.status = 0, this.code, this.branches});

  bool get isOtpRequired {
    final m = message.toLowerCase();
    return code == 'OTP_REQUIRED' ||
        code == 'OTP_INVALID' ||
        (m.contains('otp') && m.contains('required')) ||
        m.contains('incorrect otp');
  }

  bool get isMultipleBranches =>
      status == 409 && (code == 'MULTIPLE_BRANCHES' || message.toLowerCase().contains('multiple branches'));

  @override
  String toString() => message;
}

/// Readable message for any thrown error — the Kotlin code used `e.message ?: fallback`.
String errorMessage(Object e, [String? fallback]) {
  if (e is ApiException) return e.message;
  if (e is StateError) return e.message;
  if (e is TimeoutException) return tr('The server is taking too long to respond. Please try again.');
  var s = e.toString();
  if (s.startsWith('Exception: ')) s = s.substring('Exception: '.length);
  // Never surface stack-trace-ish or framework text (DioException, SocketException, …) to riders.
  final technical = s.isEmpty || s.length > 160 || RegExp(r'Exception|Error:|RequestOptions|Instance of').hasMatch(s);
  return technical ? (fallback ?? tr('Something went wrong')) : s;
}
