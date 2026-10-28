import 'dart:typed_data';

import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;

import '../models/order.dart';
import 'order_receipt_utils.dart';

/// Builds a printable Bing Chun order receipt PDF (web-style layout).
Future<Uint8List> buildOrderReceiptPdf(Order order) async {
  final doc = pw.Document();
  final isDelivery = order.orderMode == 'DELIVERY';
  final brand = PdfColor.fromInt(0xFF307EF2);
  final muted = PdfColor.fromInt(0xFF64748B);
  final ink = PdfColor.fromInt(0xFF1E293B);
  final line = PdfColor.fromInt(0xFFE2EBF6);

  pw.Widget detail(String label, String value) {
    return pw.Padding(
      padding: const pw.EdgeInsets.only(bottom: 6),
      child: pw.RichText(
        text: pw.TextSpan(
          children: [
            pw.TextSpan(
              text: '$label: ',
              style: pw.TextStyle(fontWeight: pw.FontWeight.bold, color: ink, fontSize: 10),
            ),
            pw.TextSpan(
              text: value,
              style: pw.TextStyle(color: ink, fontSize: 10),
            ),
          ],
        ),
      ),
    );
  }

  pw.Widget totalRow(String label, String value, {bool bold = false, bool accent = false}) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 2),
      child: pw.Row(
        mainAxisAlignment: pw.MainAxisAlignment.spaceBetween,
        children: [
          pw.Text(
            label,
            style: pw.TextStyle(
              color: bold ? ink : muted,
              fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
              fontSize: bold ? 12 : 10,
            ),
          ),
          pw.Text(
            value,
            style: pw.TextStyle(
              color: accent ? PdfColor.fromInt(0xFF22C55E) : (bold ? brand : ink),
              fontWeight: bold ? pw.FontWeight.bold : pw.FontWeight.normal,
              fontSize: bold ? 13 : 10,
            ),
          ),
        ],
      ),
    );
  }

  doc.addPage(
    pw.MultiPage(
      pageFormat: PdfPageFormat.a4,
      margin: const pw.EdgeInsets.all(36),
      build: (context) => [
        pw.Row(
          crossAxisAlignment: pw.CrossAxisAlignment.start,
          children: [
            pw.Expanded(
              child: pw.Column(
                crossAxisAlignment: pw.CrossAxisAlignment.start,
                children: [
                  pw.Text(
                    'Bing Chun',
                    style: pw.TextStyle(
                      fontSize: 18,
                      fontWeight: pw.FontWeight.bold,
                      color: brand,
                    ),
                  ),
                  pw.SizedBox(height: 2),
                  pw.Text(
                    'Bubble Tea · Sri Lanka',
                    style: pw.TextStyle(fontSize: 10, color: muted),
                  ),
                ],
              ),
            ),
            pw.Column(
              crossAxisAlignment: pw.CrossAxisAlignment.end,
              children: [
                pw.Text(
                  'RECEIPT',
                  style: pw.TextStyle(
                    fontSize: 9,
                    letterSpacing: 1.2,
                    color: muted,
                    fontWeight: pw.FontWeight.bold,
                  ),
                ),
                pw.SizedBox(height: 2),
                pw.Text(
                  '#${order.orderNumber}',
                  style: pw.TextStyle(
                    fontSize: 14,
                    fontWeight: pw.FontWeight.bold,
                    color: ink,
                  ),
                ),
                pw.Text(
                  formatReceiptDate(order.createdAt),
                  style: pw.TextStyle(fontSize: 9, color: muted),
                ),
              ],
            ),
          ],
        ),
        pw.SizedBox(height: 14),
        pw.Divider(color: line),
        pw.SizedBox(height: 10),
        pw.Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            _chip(isDelivery ? 'Delivery' : 'Takeaway', brand),
            _chip(order.statusDisplay, brand),
            _chip(paymentMethodLabels[order.paymentMethod] ?? order.paymentMethod, brand),
            _chip(paymentStatusLabel(order), brand),
          ],
        ),
        pw.SizedBox(height: 14),
        if (order.storeName != null)
          detail(
            'Store',
            '${order.storeName}${order.storeAddressLine != null ? ' — ${order.storeAddressLine}' : ''}',
          ),
        if (order.customerName != null)
          detail(
            'Customer',
            '${order.customerName}${order.customerPhone != null ? ' · ${order.customerPhone}' : ''}',
          )
        else if (order.customerPhone != null)
          detail('Phone', order.customerPhone!),
        if (isDelivery && order.deliveryAddressLine != null)
          detail(
            'Deliver to',
            '${order.deliveryAddressLine}${order.deliveryCity != null ? ', ${order.deliveryCity}' : ''}',
          ),
        if (!isDelivery && order.pickupTime != null) detail('Pickup', order.pickupTime!),
        pw.SizedBox(height: 12),
        pw.Container(
          padding: const pw.EdgeInsets.only(bottom: 6),
          decoration: pw.BoxDecoration(
            border: pw.Border(bottom: pw.BorderSide(color: line)),
          ),
          child: pw.Row(
            children: [
              pw.Expanded(
                flex: 5,
                child: pw.Text('Item', style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: muted)),
              ),
              pw.Expanded(
                child: pw.Text('Qty', style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: muted)),
              ),
              pw.Expanded(
                flex: 2,
                child: pw.Text(
                  'Amount',
                  textAlign: pw.TextAlign.right,
                  style: pw.TextStyle(fontSize: 9, fontWeight: pw.FontWeight.bold, color: muted),
                ),
              ),
            ],
          ),
        ),
        pw.SizedBox(height: 8),
        ...order.items.map((item) {
          final options = <String>[
            itemOptionLine(item),
            if (item.toppings.isNotEmpty) '+ ${item.toppings.join(', ')}',
          ].where((s) => s.trim().isNotEmpty).join('\n');
          return pw.Padding(
            padding: const pw.EdgeInsets.only(bottom: 8),
            child: pw.Row(
              crossAxisAlignment: pw.CrossAxisAlignment.start,
              children: [
                pw.Expanded(
                  flex: 5,
                  child: pw.Column(
                    crossAxisAlignment: pw.CrossAxisAlignment.start,
                    children: [
                      pw.Text(
                        item.productName,
                        style: pw.TextStyle(fontSize: 10, fontWeight: pw.FontWeight.bold, color: ink),
                      ),
                      if (options.isNotEmpty)
                        pw.Text(options, style: pw.TextStyle(fontSize: 8, color: muted)),
                    ],
                  ),
                ),
                pw.Expanded(
                  child: pw.Text('${item.quantity}', style: pw.TextStyle(fontSize: 10, color: ink)),
                ),
                pw.Expanded(
                  flex: 2,
                  child: pw.Text(
                    formatMoney(item.totalPrice),
                    textAlign: pw.TextAlign.right,
                    style: pw.TextStyle(fontSize: 10, color: ink),
                  ),
                ),
              ],
            ),
          );
        }),
        pw.Divider(color: line),
        pw.SizedBox(height: 6),
        totalRow('Subtotal', formatMoney(order.subtotal)),
        if (order.deliveryFee > 0) totalRow('Delivery', formatMoney(order.deliveryFee)),
        if (order.convenientFee > 0) totalRow('Convenience fee', formatMoney(order.convenientFee)),
        if (order.discount > 0)
          totalRow(
            'Promo${order.promoCode != null ? ' (${order.promoCode})' : ''}',
            '−${formatMoney(order.discount)}',
            accent: true,
          ),
        if (order.loyaltyDiscount > 0)
          totalRow('Loyalty', '−${formatMoney(order.loyaltyDiscount)}', accent: true),
        pw.SizedBox(height: 6),
        totalRow('Total', formatMoney(order.total), bold: true),
        pw.SizedBox(height: 20),
        pw.Center(
          child: pw.Text(
            'Thank you for choosing Bing Chun!',
            style: pw.TextStyle(fontSize: 10, color: muted),
          ),
        ),
      ],
    ),
  );

  return doc.save();
}

pw.Widget _chip(String label, PdfColor brand) {
  return pw.Container(
    padding: const pw.EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: pw.BoxDecoration(
      color: PdfColor(brand.red, brand.green, brand.blue, 0.12),
      borderRadius: pw.BorderRadius.circular(4),
      border: pw.Border.all(color: PdfColor(brand.red, brand.green, brand.blue, 0.3)),
    ),
    child: pw.Text(
      label,
      style: pw.TextStyle(fontSize: 8, fontWeight: pw.FontWeight.bold, color: brand),
    ),
  );
}
