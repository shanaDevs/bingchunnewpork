import 'package:flutter/services.dart';

import 'runtime_config.dart';

/// Light haptics for taps, gated by the Settings toggle.
abstract final class PosFeedback {
  static void tap() {
    if (RuntimeConfig.instance.hapticsEnabled) HapticFeedback.selectionClick();
  }

  static void success() {
    if (RuntimeConfig.instance.hapticsEnabled) HapticFeedback.mediumImpact();
  }
}
