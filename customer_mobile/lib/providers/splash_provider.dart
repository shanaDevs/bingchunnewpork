import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Becomes true after the splash screen has been visible for the web-parity
/// minimum duration (~1.2s). Router waits on this so the loading screen
/// does not flash away instantly when auth resolves quickly.
final splashMinElapsedProvider = StateProvider<bool>((ref) => false);
