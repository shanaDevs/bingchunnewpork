import 'package:bing_chun_customer/models/spin.dart';
import 'package:bing_chun_customer/widgets/spin_wheel.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('wheel renders nullable gift data on a narrow scaled screen', (
    tester,
  ) async {
    final offers = [
      const SpinOffer(
        id: 'gift',
        label: 'A very long surprise gift name',
        description: null,
        offerType: 'GIFT',
        discountValue: 0,
        color: '#307ef2',
        sortOrder: 0,
        minOrderValue: 0,
        giftProduct: SpinGiftProduct(
          id: 'product',
          name: 'Long product name',
          basePrice: 0,
          imageUrl: null,
        ),
      ),
      const SpinOffer(
        id: 'retry',
        label: 'Try again',
        offerType: 'NO_PRIZE',
        discountValue: 0,
        color: '#64748b',
        sortOrder: 1,
        minOrderValue: 0,
      ),
    ];

    await tester.pumpWidget(
      MaterialApp(
        home: MediaQuery(
          data: const MediaQueryData(
            size: Size(320, 640),
            textScaler: TextScaler.linear(1.5),
          ),
          child: Scaffold(
            body: Center(
              child: SpinWheel(offers: offers, rotation: 0, size: 220),
            ),
          ),
        ),
      ),
    );
    await tester.pump();

    expect(find.byType(SpinWheel), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
