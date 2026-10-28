import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Increment while a modal (e.g. add-to-cup sheet) is open so shell chrome hides.
final shellChromeSuppressedProvider = StateProvider<int>((ref) => 0);

void suppressShellChrome(WidgetRef ref) {
  ref.read(shellChromeSuppressedProvider.notifier).update((n) => n + 1);
}

void restoreShellChrome(WidgetRef ref) {
  ref.read(shellChromeSuppressedProvider.notifier).update((n) => n > 0 ? n - 1 : 0);
}
