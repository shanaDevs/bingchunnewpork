import 'package:flutter/material.dart';

import '../../core/feedback.dart';
import '../theme/pos_theme.dart';
import 'badges.dart';

class CapsuleTabItem<T> {
  const CapsuleTabItem({required this.value, required this.label, required this.icon, this.count});
  final T value;
  final String label;
  final IconData icon;
  final int? count;
}

/// Pickup Queue / Delivery Jobs switch (web `.orders-capsule-tabs`): indigo
/// sidebar track, white active capsule, red count bubble.
class CapsuleTabs<T> extends StatelessWidget {
  const CapsuleTabs({super.key, required this.items, required this.selected, required this.onSelect});

  final List<CapsuleTabItem<T>> items;
  final T? selected;
  final ValueChanged<T> onSelect;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        gradient: PosColors.sidebarGradient,
        borderRadius: BorderRadius.circular(PosRadius.pill),
      ),
      child: Row(
        children: [
          for (final item in items)
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  PosFeedback.tap();
                  onSelect(item.value);
                },
                child: AnimatedContainer(
                  duration: PosMotion.standard,
                  curve: Curves.easeOut,
                  padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 10),
                  decoration: BoxDecoration(
                    color: item.value == selected ? Colors.white : Colors.transparent,
                    borderRadius: BorderRadius.circular(PosRadius.pill),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        item.icon,
                        size: 17,
                        color: item.value == selected ? PosColors.sidebarActiveText : Colors.white70,
                      ),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          item.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: PosType.bodyStrong.copyWith(
                            fontSize: 13,
                            color: item.value == selected ? PosColors.sidebarActiveText : Colors.white,
                          ),
                        ),
                      ),
                      if (item.count != null) ...[
                        const SizedBox(width: 6),
                        CountBubble(count: item.count!, color: c.danger, alert: true),
                      ],
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class StatusTabItem {
  const StatusTabItem({required this.value, required this.label, required this.color, required this.count});
  final String value;
  final String label;
  final Color color;
  final int count;
}

/// Received / Preparing / Ready segmented tabs, each in its status colour.
/// A waiting Received count blinks like the web `--blink` badge.
class StatusTabs extends StatelessWidget {
  const StatusTabs({super.key, required this.items, required this.selected, required this.onSelect});

  final List<StatusTabItem> items;
  final String selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: c.surface,
        borderRadius: BorderRadius.circular(PosRadius.button + 2),
        border: Border.all(color: c.border.withValues(alpha: 0.7)),
      ),
      child: Row(
        children: [
          for (final item in items)
            Expanded(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  PosFeedback.tap();
                  onSelect(item.value);
                },
                child: AnimatedContainer(
                  duration: PosMotion.standard,
                  padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 6),
                  decoration: BoxDecoration(
                    color: item.value == selected ? item.color : Colors.transparent,
                    borderRadius: BorderRadius.circular(PosRadius.button),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Flexible(
                        child: Text(
                          item.label,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: PosType.bodyStrong.copyWith(
                            fontSize: 12.5,
                            color: item.value == selected ? Colors.white : item.color,
                          ),
                        ),
                      ),
                      const SizedBox(width: 5),
                      _Blink(
                        enabled: item.value == 'RECEIVED' && item.count > 0 && item.value != selected,
                        child: CountBubble(count: item.count, color: item.color, active: item.value == selected),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Blink extends StatefulWidget {
  const _Blink({required this.enabled, required this.child});
  final bool enabled;
  final Widget child;

  @override
  State<_Blink> createState() => _BlinkState();
}

class _BlinkState extends State<_Blink> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 700));

  @override
  void initState() {
    super.initState();
    _sync();
  }

  @override
  void didUpdateWidget(covariant _Blink oldWidget) {
    super.didUpdateWidget(oldWidget);
    _sync();
  }

  void _sync() {
    if (widget.enabled && !_ctrl.isAnimating) {
      _ctrl.repeat(reverse: true);
    } else if (!widget.enabled && _ctrl.isAnimating) {
      _ctrl
        ..stop()
        ..value = 0;
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      FadeTransition(opacity: Tween<double>(begin: 1, end: 0.35).animate(_ctrl), child: widget.child);
}

/// Rounded filter chip that opens a picker (replaces web `filter-select`).
class FilterPill extends StatelessWidget {
  const FilterPill({super.key, required this.label, required this.onTap, this.icon, this.active = false});

  final String label;
  final VoidCallback onTap;
  final IconData? icon;
  final bool active;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Material(
      color: active ? c.brandSubtle : c.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(PosRadius.pill),
        side: BorderSide(color: active ? c.brand.withValues(alpha: 0.5) : c.border),
      ),
      child: InkWell(
        customBorder: const StadiumBorder(),
        onTap: () {
          PosFeedback.tap();
          onTap();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[
                Icon(icon, size: 15, color: active ? c.brand : c.textMuted),
                const SizedBox(width: 6),
              ],
              Text(
                label,
                style: PosType.caption.copyWith(
                  color: active ? c.brand : c.text,
                  fontWeight: FontWeight.w600,
                  fontSize: 12.5,
                ),
              ),
              const SizedBox(width: 2),
              Icon(Icons.expand_more_rounded, size: 16, color: active ? c.brand : c.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

/// Category chip (web POS category buttons): solid brand when selected.
class CategoryChip extends StatelessWidget {
  const CategoryChip({super.key, required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Material(
      color: selected ? c.brand : c.card,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(PosRadius.button),
        side: BorderSide(color: selected ? c.brand : c.border.withValues(alpha: 0.7)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(PosRadius.button),
        onTap: () {
          PosFeedback.tap();
          onTap();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
          child: Text(
            label,
            style: PosType.caption.copyWith(
              color: selected ? Colors.white : c.textMuted,
              fontWeight: FontWeight.w600,
              fontSize: 12.5,
            ),
          ),
        ),
      ),
    );
  }
}
