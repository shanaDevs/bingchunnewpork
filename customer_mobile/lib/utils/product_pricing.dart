import '../models/cart_item.dart';
import '../models/product.dart';

const int largeSizeSurcharge = 100;
const double defaultConvenienceFeeRate = 0.035;

int computeUnitPrice(
  Product product, {
  ProductSize size = ProductSize.REGULAR,
  List<Topping> toppings = const [],
}) {
  var price = product.basePrice;
  if (size == ProductSize.LARGE) {
    price += largeSizeSurcharge;
  }
  for (final topping in toppings) {
    price += topping.extraPrice;
  }
  return price;
}

int computeConvenienceFee(int subtotal, {double rate = defaultConvenienceFeeRate}) {
  return (subtotal * rate).round();
}
