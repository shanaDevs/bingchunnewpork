import 'dart:convert';
import 'package:flutter/material.dart';
import '../config/api_config.dart';
import '../theme/bc_theme.dart';

/// QR code with Bing Chun logo centered — matches branded web QR style.
class OrderQrCode extends StatelessWidget {
  final String? qrCodeBase64;
  final String orderNumber;
  final double size;

  const OrderQrCode({
    super.key,
    this.qrCodeBase64,
    required this.orderNumber,
    this.size = 160,
  });

  ImageProvider? _decodeQrImage() {
    final base64String = qrCodeBase64;
    if (base64String == null) return null;
    try {
      if (base64String.startsWith('data:image')) {
        final cleanBase64 = base64String.split(',')[1];
        return MemoryImage(base64Decode(cleanBase64));
      }
    } catch (_) {}
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final qrImage = _decodeQrImage();
    final logoSize = size * 0.24;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
      ),
      child: SizedBox(
        width: size,
        height: size,
        child: Stack(
          alignment: Alignment.center,
          children: [
            if (qrImage != null)
              Image(image: qrImage, width: size, height: size, fit: BoxFit.contain)
            else
              Icon(Icons.qr_code_2, size: size * 0.7, color: context.bc.border),
            Container(
              width: logoSize,
              height: logoSize,
              padding: EdgeInsets.all(logoSize * 0.12),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(logoSize * 0.18),
                border: Border.all(color: context.bc.border.withValues(alpha: 0.3)),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.08),
                    blurRadius: 4,
                  ),
                ],
              ),
              child: Image.asset(
                'assets/brand/logo.png',
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const Icon(Icons.icecream, color: BcColors.brand, size: 20),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String orderTrackUrl(String orderNumber) {
  return '${ApiConfig.frontendUrl}/order/${Uri.encodeComponent(orderNumber)}';
}
