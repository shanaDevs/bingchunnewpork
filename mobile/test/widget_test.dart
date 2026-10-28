import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:bing_chun_delivery/app.dart';

void main() {
  testWidgets('App boots to login screen in UI preview mode', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: BingChunDeliveryApp()));
    await tester.pumpAndSettle();

    expect(find.text('Delivery Staff'), findsOneWidget);
    expect(find.text('Sign In'), findsOneWidget);
  });
}
