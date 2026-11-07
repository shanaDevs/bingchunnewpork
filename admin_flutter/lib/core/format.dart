import 'package:intl/intl.dart';

import '../l10n/l10n.dart';

/// Sri Lanka has no daylight saving, so a fixed +05:30 offset matches the
/// web app's `Asia/Colombo` formatting without a timezone database.
const _colomboOffset = Duration(hours: 5, minutes: 30);

DateTime toColombo(DateTime t) => t.toUtc().add(_colomboOffset);

/// Today in Colombo as `yyyy-MM-dd` (the backend's date filter format).
String colomboToday() => DateFormat('yyyy-MM-dd').format(toColombo(DateTime.now()));

String formatYmd(DateTime d) => DateFormat('yyyy-MM-dd').format(d);

final _amount = NumberFormat('#,##0.00', 'en');
final _count = NumberFormat('#,##0', 'en');

/// `1,250.00` — matches the web `formatMoneyAmount`.
String formatMoneyAmount(num amount) => _amount.format(amount);

/// `LKR 1,250.00` — matches the web `formatMoney`.
String formatMoney(num amount) => 'LKR ${formatMoneyAmount(amount)}';

String formatCount(num n) => _count.format(n);

/// `Fri, 30 Oct 2026, 02:15 PM` — the receipt / detail timestamp.
String formatReceiptDate(DateTime t) =>
    DateFormat('EEE, d MMM yyyy, hh:mm a', L10n.dateLocale).format(toColombo(t));

/// `02:15 PM`.
String formatTime(DateTime t) => DateFormat('hh:mm a', L10n.dateLocale).format(toColombo(t));

/// `30 Oct, 02:15 PM`.
String formatShortDateTime(DateTime t) => DateFormat('d MMM, hh:mm a', L10n.dateLocale).format(toColombo(t));

/// `30 Oct 2026`.
String formatShortDate(DateTime t) => DateFormat('d MMM yyyy', L10n.dateLocale).format(t);

/// `m:ss` countdown.
String formatCountdown(int totalSeconds) {
  final s = totalSeconds < 0 ? 0 : totalSeconds;
  return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
}
