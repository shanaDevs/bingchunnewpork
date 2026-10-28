import 'package:flutter/material.dart';
import '../utils/order_receipt_utils.dart';
import '../models/order.dart';
import '../theme/bc_theme.dart';
import 'order_product_image.dart';
import 'order_qr_code.dart';

/// Printable-style order receipt — aligned with web OrderReceipt.
class OrderReceiptCard extends StatelessWidget {
  final Order order;

  const OrderReceiptCard({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    final isDelivery = order.orderMode == 'DELIVERY';
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    Widget chip(String label) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: BcColors.brandSubtle,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: BcColors.brand.withValues(alpha: 0.25)),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isDark ? BcColors.brandLight : BcColors.brand,
            fontSize: 11,
            fontWeight: FontWeight.w600,
          ),
        ),
      );
    }

    Widget detailRow(String label, String value) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: RichText(
          text: TextSpan(
            style: TextStyle(color: onSurface, fontSize: 13, height: 1.4),
            children: [
              TextSpan(text: '$label: ', style: const TextStyle(fontWeight: FontWeight.bold)),
              TextSpan(text: value),
            ],
          ),
        ),
      );
    }

    Widget totalRow(String label, String value, {bool isDiscount = false, bool isGrand = false}) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              label,
              style: TextStyle(
                color: isGrand ? onSurface : bc.mutedText,
                fontWeight: isGrand ? FontWeight.bold : FontWeight.normal,
                fontSize: isGrand ? 15 : 13,
              ),
            ),
            Text(
              value,
              style: TextStyle(
                color: isDiscount ? BcColors.success : (isGrand ? BcColors.brand : onSurface),
                fontWeight: isGrand ? FontWeight.bold : FontWeight.w500,
                fontSize: isGrand ? 16 : 13,
              ),
            ),
          ],
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Image.asset(
                  'assets/brand/logo.png',
                  width: 40,
                  height: 40,
                  errorBuilder: (_, __, ___) =>
                      const Icon(Icons.icecream, color: BcColors.brand, size: 36),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Bing Chun',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: onSurface),
                      ),
                      Text(
                        'Bubble Tea · Sri Lanka',
                        style: TextStyle(color: bc.mutedText, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                Column(
                  children: [
                    OrderQrCode(
                      qrCodeBase64: order.qrCode,
                      orderNumber: order.orderNumber,
                      size: 56,
                    ),
                    const SizedBox(height: 4),
                    Text('Scan to track', style: TextStyle(color: bc.mutedText, fontSize: 9)),
                  ],
                ),
              ],
            ),
            const SizedBox(height: 20),
            const Divider(),
            const SizedBox(height: 12),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('RECEIPT', style: TextStyle(color: bc.mutedText, fontSize: 10, letterSpacing: 1)),
                      const SizedBox(height: 4),
                      Text(
                        '#${order.orderNumber}',
                        style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, color: onSurface),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        formatReceiptDate(order.createdAt),
                        style: TextStyle(color: bc.mutedText, fontSize: 12),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            Wrap(
              spacing: 8,
              runSpacing: 6,
              children: [
                chip(isDelivery ? 'Delivery' : 'Takeaway'),
                chip(order.statusDisplay),
                chip(paymentMethodLabels[order.paymentMethod] ?? order.paymentMethod),
                chip(paymentStatusLabel(order)),
              ],
            ),
            const SizedBox(height: 16),
            if (order.storeName != null)
              detailRow('Store', '${order.storeName}${order.storeAddressLine != null ? ' — ${order.storeAddressLine}' : ''}'),
            if (order.customerName != null)
              detailRow('Customer', '${order.customerName}${order.customerPhone != null ? ' · ${order.customerPhone}' : ''}')
            else if (order.customerPhone != null)
              detailRow('Phone', order.customerPhone!),
            if (isDelivery && order.deliveryAddressLine != null)
              detailRow(
                'Deliver to',
                '${order.deliveryAddressLine}${order.deliveryCity != null ? ', ${order.deliveryCity}' : ''}',
              ),
            if (!isDelivery && order.pickupTime != null) detailRow('Pickup', order.pickupTime!),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(flex: 5, child: Text('Item', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: bc.mutedText))),
                Expanded(child: Text('Qty', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: bc.mutedText))),
                Expanded(flex: 2, child: Text('Amount', textAlign: TextAlign.end, style: TextStyle(fontWeight: FontWeight.bold, fontSize: 12, color: bc.mutedText))),
              ],
            ),
            const Divider(height: 16),
            ...order.items.map((item) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      OrderProductImage(
                        imageUrl: item.imageUrl,
                        size: 48,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        flex: 5,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(item.productName, style: TextStyle(fontWeight: FontWeight.w600, color: onSurface, fontSize: 13)),
                            Text(itemOptionLine(item), style: TextStyle(color: bc.mutedText, fontSize: 11)),
                            if (item.toppings.isNotEmpty)
                              Text('+ ${item.toppings.join(', ')}', style: TextStyle(color: bc.mutedText, fontSize: 11)),
                          ],
                        ),
                      ),
                      Expanded(child: Text('${item.quantity}', style: TextStyle(color: onSurface))),
                      Expanded(
                        flex: 2,
                        child: Text(
                          formatMoney(item.totalPrice),
                          textAlign: TextAlign.end,
                          style: TextStyle(color: onSurface, fontWeight: FontWeight.w500),
                        ),
                      ),
                    ],
                  ),
                )),
            const Divider(height: 20),
            totalRow('Subtotal', formatMoney(order.subtotal)),
            if (order.deliveryFee > 0) totalRow('Delivery', formatMoney(order.deliveryFee)),
            if (order.convenientFee > 0) totalRow('Convenience fee', formatMoney(order.convenientFee)),
            if (order.discount > 0)
              totalRow('Promo${order.promoCode != null ? ' (${order.promoCode})' : ''}', '−${formatMoney(order.discount)}', isDiscount: true),
            const SizedBox(height: 8),
            totalRow('Total', formatMoney(order.total), isGrand: true),
            const SizedBox(height: 16),
            Text(
              'Thank you for choosing Bing Chun! 🧋',
              textAlign: TextAlign.center,
              style: TextStyle(color: bc.mutedText, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}
