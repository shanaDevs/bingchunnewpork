import '../entities/order.dart';

/// Cash / card taken at the counter — port of the web CounterPaymentForm helpers.
enum CounterPaymentMethod {
  cash,
  card;

  /// Value the backend expects for `paymentMethod`.
  String get apiValue => this == cash ? PaymentMethod.cashAtCounter : PaymentMethod.card;
}

double? parseCash(String text) => text.trim().isEmpty ? null : double.tryParse(text.trim());

/// Card is always valid. Cash must cover [amountDue]; an empty field is only
/// accepted when [requireCashAmount] is false (POS lets the cashier skip it).
bool counterPaymentValid(
  CounterPaymentMethod method,
  String cashReceived,
  double amountDue, {
  bool requireCashAmount = true,
}) {
  if (method == CounterPaymentMethod.card) return true;
  if (cashReceived.trim().isEmpty) return !requireCashAmount;
  return (parseCash(cashReceived) ?? 0) >= amountDue;
}

/// Change owed (negative = shortfall), or null while the cash field is empty.
double? cashChange(String cashReceived, double amountDue) {
  final cash = parseCash(cashReceived);
  return cash == null ? null : cash - amountDue;
}
