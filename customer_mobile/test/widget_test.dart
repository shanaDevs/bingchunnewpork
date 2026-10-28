import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:bing_chun_customer/app.dart';

void main() {
  testWidgets('Smoke test - App builds and loads', (WidgetTester tester) async {
    // Build our app and trigger a frame.
    await tester.pumpWidget(const ProviderScope(child: BingChunCustomerApp()));

    // Verify that the app title or main MaterialApp exists.
    expect(find.byType(MaterialApp), findsOneWidget);
  });
}
