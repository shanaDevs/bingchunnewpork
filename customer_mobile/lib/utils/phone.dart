/// Normalize Sri Lankan mobile numbers for API calls (`0XXXXXXXXX` or `+94XXXXXXXXX`).
String normalizeSriLankanPhone(String raw) {
  final cleaned = raw.replaceAll(RegExp(r'[\s-]'), '');
  if (cleaned.startsWith('+94')) return cleaned;
  if (cleaned.startsWith('0') && cleaned.length == 10) return cleaned;
  if (RegExp(r'^\d{9}$').hasMatch(cleaned)) return '0$cleaned';
  return cleaned;
}

bool isValidSriLankanPhone(String raw) {
  final normalized = normalizeSriLankanPhone(raw);
  return RegExp(r'^(?:\+94|0)[0-9]{9}$').hasMatch(normalized);
}

/// Display format for UI: +94 76 581 1999
String formatPhoneDisplay(String raw) {
  final normalized = normalizeSriLankanPhone(raw);
  var digits = normalized.replaceFirst('+94', '');
  if (digits.startsWith('0')) digits = digits.substring(1);
  if (digits.length == 9) {
    return '+94 ${digits.substring(0, 2)} ${digits.substring(2, 5)} ${digits.substring(5)}';
  }
  return normalized;
}
