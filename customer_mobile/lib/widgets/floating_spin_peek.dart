import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/spin_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';
import '../utils/floating_fab_layout.dart';
import '../utils/shell_layout.dart';
import 'spin_casino_icon.dart';
import 'spin_wheel_modal.dart';

/// Dock edges for the floating spin FAB — mirrors web `RewardsDock`.
enum SpinDock { topLeft, midLeft, bottomLeft, topRight, midRight, bottomRight }

final spinDockProvider = StateProvider<SpinDock>((ref) => SpinDock.midRight);

/// Floating peek FAB — web `FloatingRewardsPeek` logic + brand plate.
class FloatingSpinPeek extends ConsumerStatefulWidget {
  const FloatingSpinPeek({super.key});

  @override
  ConsumerState<FloatingSpinPeek> createState() => _FloatingSpinPeekState();
}

class _FloatingSpinPeekState extends ConsumerState<FloatingSpinPeek>
    with SingleTickerProviderStateMixin {
  static const _btnSize = 48.0;
  static const _peek = 16.0;
  static const _autoHideMs = 4500;

  bool _open = false;
  bool _dragging = false;
  Offset _pos = Offset.zero;
  bool _ready = false;
  Timer? _hideTimer;
  int _lastOpenRequest = 0;
  DateTime _suppressTapUntil = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _snap(visible: false);
      setState(() => _ready = true);
    });
  }

  @override
  void dispose() {
    _hideTimer?.cancel();
    super.dispose();
  }

  Rect _bounds() {
    final screen = MediaQuery.sizeOf(context);
    final padding = MediaQuery.paddingOf(context);
    final navH = shellNavBarHeight(context);
    return FloatingFabLayout.bounds(
      screen: screen,
      padding: padding,
      navBarHeight: navH,
      fabSize: _btnSize,
    );
  }

  Offset _openPoint(SpinDock dock) {
    final b = _bounds();
    final midY = (b.top + b.bottom) / 2;
    final y = switch (dock) {
      SpinDock.topLeft || SpinDock.topRight => b.top,
      SpinDock.bottomLeft || SpinDock.bottomRight => b.bottom,
      _ => midY,
    };
    final left = dock.name.toLowerCase().contains('left');
    final x = left ? b.left : b.right;
    return Offset(x, y);
  }

  Offset _peekPoint(SpinDock dock) {
    final open = _openPoint(dock);
    final screen = MediaQuery.sizeOf(context);
    final left = dock.name.toLowerCase().contains('left');
    if (left) {
      return Offset(-(_btnSize - _peek), open.dy);
    }
    return Offset(screen.width - _peek, open.dy);
  }

  SpinDock _nearestDock(Offset center) {
    SpinDock best = SpinDock.midRight;
    var bestDist = double.infinity;
    for (final dock in SpinDock.values) {
      final p = _openPoint(dock);
      final c = Offset(p.dx + _btnSize / 2, p.dy + _btnSize / 2);
      final d = (c - center).distanceSquared;
      if (d < bestDist) {
        bestDist = d;
        best = dock;
      }
    }
    return best;
  }

  void _snap({required bool visible, bool autoHide = false}) {
    final dock = ref.read(spinDockProvider);
    final next = visible ? _openPoint(dock) : _peekPoint(dock);
    _hideTimer?.cancel();
    setState(() {
      _open = visible;
      _pos = next;
    });
    if (visible && autoHide) {
      _hideTimer = Timer(const Duration(milliseconds: _autoHideMs), () {
        if (!mounted) return;
        _snap(visible: false);
      });
    }
  }

  Future<void> _openSpin() async {
    await ref.read(spinProvider.notifier).refresh();
    if (!mounted) return;
    final latest = ref.read(spinProvider);
    final eligibility = latest.eligibility;

    // The master switch and an unconfigured wheel are fully hidden.
    if (!latest.enabled || eligibility?.enabled != true) {
      return;
    }

    if (!latest.canShowTrigger) {
      showAppToast(
        context,
        latest.error ??
            eligibility?.reason ??
            (latest.claim != null
                ? 'Use your current spin reward before spinning again'
                : 'Spin & Win is not available right now'),
      );
      return;
    }
    await showSpinWheelModal(context, startAtIntro: true);
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    if (location.startsWith('/cart') ||
        location.startsWith('/checkout') ||
        location.startsWith('/login')) {
      return const SizedBox.shrink();
    }

    final spin = ref.watch(spinProvider);
    if (!spin.canShowTrigger) {
      return const SizedBox.shrink();
    }

    // Manual open requests from elsewhere.
    ref.listen(spinProvider.select((s) => s.openRequestId), (prev, next) {
      if (next == 0 || next == _lastOpenRequest) return;
      _lastOpenRequest = next;
      _openSpin();
    });

    if (!_ready) return const SizedBox.shrink();

    final dock = ref.watch(spinDockProvider);
    final leftSide = dock.name.toLowerCase().contains('left');

    return AnimatedPositioned(
      duration: _dragging ? Duration.zero : const Duration(milliseconds: 320),
      curve: Curves.easeOutCubic,
      left: _pos.dx,
      top: _pos.dy,
      child: SizedBox(
        width: _btnSize,
        height: _btnSize,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            // Hide/show chevron tab
            Positioned(
              left: leftSide ? _btnSize - 2 : -46,
              top: 0,
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  _hideTimer?.cancel();
                  if (_open) {
                    _snap(visible: false);
                  } else {
                    _snap(visible: true, autoHide: false);
                  }
                },
                child: SizedBox(
                  width: 48,
                  height: 48,
                  child: Align(
                    alignment: leftSide
                        ? Alignment.centerLeft
                        : Alignment.centerRight,
                    child: Container(
                      width: 16,
                      height: 28,
                      decoration: BoxDecoration(
                        color: BcColors.brandDark,
                        borderRadius: BorderRadius.horizontal(
                          left: leftSide
                              ? Radius.zero
                              : const Radius.circular(8),
                          right: leftSide
                              ? const Radius.circular(8)
                              : Radius.zero,
                        ),
                        border: Border.all(
                          color: Colors.white.withValues(alpha: 0.35),
                        ),
                      ),
                      child: Icon(
                        leftSide
                            ? (_open ? Icons.chevron_left : Icons.chevron_right)
                            : (_open
                                  ? Icons.chevron_right
                                  : Icons.chevron_left),
                        size: 14,
                        color: Colors.white,
                      ),
                    ),
                  ),
                ),
              ),
            ),
            GestureDetector(
              onPanStart: (_) {
                _dragging = true;
                _hideTimer?.cancel();
              },
              onPanUpdate: (d) {
                setState(() {
                  _pos = Offset(_pos.dx + d.delta.dx, _pos.dy + d.delta.dy);
                });
              },
              onPanEnd: (d) {
                _dragging = false;
                final center = Offset(
                  _pos.dx + _btnSize / 2 + d.velocity.pixelsPerSecond.dx * 0.05,
                  _pos.dy + _btnSize / 2 + d.velocity.pixelsPerSecond.dy * 0.05,
                );
                final next = _nearestDock(center);
                ref.read(spinDockProvider.notifier).state = next;
                _suppressTapUntil = DateTime.now().add(
                  const Duration(milliseconds: 200),
                );
                // Drag to an edge → tuck into peek (no arrow tap needed).
                _snap(visible: false);
              },
              onTap: () async {
                if (DateTime.now().isBefore(_suppressTapUntil)) return;
                if (!_open) {
                  _snap(visible: true, autoHide: false);
                  return;
                }
                await _openSpin();
              },
              child: Container(
                width: _btnSize,
                height: _btnSize,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(14),
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF3B8EF7), Color(0xFF2563EB)],
                  ),
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.35),
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF2563EB).withValues(alpha: 0.4),
                      blurRadius: 16,
                      offset: const Offset(0, 6),
                    ),
                  ],
                ),
                alignment: Alignment.center,
                child: const SpinCasinoIcon(size: 24),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
