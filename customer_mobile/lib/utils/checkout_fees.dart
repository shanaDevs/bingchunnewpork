/// Convenience fee helpers — mirrors `Frontend/src/lib/fees.ts`.
library;

const double defaultDeliveryConvenienceFeeRate = 0.075;
const double defaultPickupConvenienceFeeRate = 0.06;

class ConvenienceFeeRates {
  final double pickup;
  final double delivery;

  const ConvenienceFeeRates({
    this.pickup = defaultPickupConvenienceFeeRate,
    this.delivery = defaultDeliveryConvenienceFeeRate,
  });

  static const defaults = ConvenienceFeeRates();
}

const _onlinePaymentMethods = {'PAYHERE', 'CARD'};

/// Convenience fee applies to online payments (CARD / PAYHERE) and to pickup
/// cash-at-counter (takeaway under LKR 1000).
bool appliesConvenienceFee(String? orderMode, String? paymentMethod) {
  if (orderMode != 'DELIVERY' && orderMode != 'TAKEAWAY') return false;
  if (paymentMethod == null || paymentMethod.isEmpty) return false;
  if (_onlinePaymentMethods.contains(paymentMethod)) return true;
  return orderMode == 'TAKEAWAY' && paymentMethod == 'CASH_AT_COUNTER';
}

double convenienceFeeRateForOrder(
  String? orderMode, [
  ConvenienceFeeRates rates = ConvenienceFeeRates.defaults,
]) {
  if (orderMode == 'TAKEAWAY') return rates.pickup;
  if (orderMode == 'DELIVERY') return rates.delivery;
  return 0;
}

int computeCheckoutConvenienceFee(
  int orderSubtotal,
  String? orderMode,
  String? paymentMethod, [
  ConvenienceFeeRates rates = ConvenienceFeeRates.defaults,
]) {
  if (!appliesConvenienceFee(orderMode, paymentMethod)) return 0;
  final rate = convenienceFeeRateForOrder(orderMode, rates);
  final base = orderSubtotal < 0 ? 0 : orderSubtotal;
  return (base * rate).round();
}

/// Customer-facing charge — pickup convenience fee is waived (shown crossed out).
int chargedConvenienceFee(
  int orderSubtotal,
  String? orderMode,
  String? paymentMethod, [
  ConvenienceFeeRates rates = ConvenienceFeeRates.defaults,
]) {
  if (orderMode == 'TAKEAWAY') return 0;
  return computeCheckoutConvenienceFee(orderSubtotal, orderMode, paymentMethod, rates);
}

String formatConvenienceFeeLabel(
  String? orderMode, [
  ConvenienceFeeRates rates = ConvenienceFeeRates.defaults,
]) {
  final rate = orderMode != null
      ? convenienceFeeRateForOrder(orderMode, rates)
      : rates.delivery;
  final pct = (rate * 1000).round() / 10;
  if (orderMode == 'DELIVERY') {
    return 'Convenience fee (${_trimPct(pct)}% of items)';
  }
  return 'Convenience fee (${_trimPct(pct)}%)';
}

String _trimPct(double pct) {
  if (pct == pct.roundToDouble()) return pct.toInt().toString();
  return pct.toString();
}

ConvenienceFeeRates resolveCheckoutConvenienceRates({
  double? convenientFeeRate,
  double? pickupConvenientFeeRate,
  double? deliveryConvenientFeeRate,
}) {
  return ConvenienceFeeRates(
    pickup: pickupConvenientFeeRate ?? convenientFeeRate ?? defaultPickupConvenienceFeeRate,
    delivery:
        deliveryConvenientFeeRate ?? convenientFeeRate ?? defaultDeliveryConvenienceFeeRate,
  );
}
