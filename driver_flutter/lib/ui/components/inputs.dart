import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/feedback.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Labeled outlined text field — port of Inputs.kt BcTextField.
class BcTextField extends StatelessWidget {
  const BcTextField({
    super.key,
    required this.controller,
    this.label,
    this.placeholder = '',
    this.maxLines = 1,
    this.isError = false,
    this.supportingText,
    this.keyboardType,
    this.obscureText = false,
    this.trailing,
    this.onChanged,
    this.inputFormatters,
    this.autofocus = false,
  });

  final TextEditingController controller;
  final String? label;
  final String placeholder;
  final int maxLines;
  final bool isError;
  final String? supportingText;
  final TextInputType? keyboardType;
  final bool obscureText;
  final Widget? trailing;
  final ValueChanged<String>? onChanged;
  final List<TextInputFormatter>? inputFormatters;
  final bool autofocus;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    OutlineInputBorder border(Color color, [double width = 1]) => OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: BorderSide(color: color, width: width),
    );
    final multi = maxLines > 1 && !obscureText;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (label != null) ...[
          Text(label!, style: BcType.caption.copyWith(fontWeight: FontWeight.w600, color: c.foreground)),
          const SizedBox(height: 6),
        ],
        TextField(
          controller: controller,
          maxLines: obscureText ? 1 : maxLines,
          minLines: 1,
          obscureText: obscureText,
          keyboardType: keyboardType,
          onChanged: onChanged,
          inputFormatters: inputFormatters,
          autofocus: autofocus,
          cursorColor: c.primary,
          style: BcType.body.copyWith(color: c.foreground),
          decoration: InputDecoration(
            hintText: placeholder,
            hintStyle: BcType.body.copyWith(color: c.subtleForeground),
            filled: true,
            fillColor: c.surface,
            suffixIcon: trailing,
            constraints: multi ? null : const BoxConstraints(minHeight: 52),
            contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: multi ? 14 : 15),
            enabledBorder: border(isError ? c.error : c.border),
            focusedBorder: border(isError ? c.error : c.primary, 2),
            border: border(c.border),
          ),
        ),
        if (supportingText != null) ...[
          const SizedBox(height: 6),
          Text(supportingText!, style: BcType.tiny.copyWith(color: isError ? c.errorStrong : c.mutedForeground)),
        ],
      ],
    );
  }
}

/// Per-digit OTP / PIN boxes with shake on error — port of BcPinBoxes.
class BcPinBoxes extends StatefulWidget {
  const BcPinBoxes({
    super.key,
    required this.value,
    required this.onChanged,
    this.length = 6,
    this.isError = false,
    this.masked = false,
    this.autofocus = true,
  });

  final String value;
  final ValueChanged<String> onChanged;
  final int length;
  final bool isError;
  final bool masked;
  final bool autofocus;

  @override
  State<BcPinBoxes> createState() => _BcPinBoxesState();
}

class _BcPinBoxesState extends State<BcPinBoxes> with SingleTickerProviderStateMixin {
  late final TextEditingController _ctrl = TextEditingController(text: widget.value);
  final FocusNode _focus = FocusNode();
  late final AnimationController _shake = AnimationController(vsync: this, duration: const Duration(milliseconds: 280));

  @override
  void didUpdateWidget(BcPinBoxes old) {
    super.didUpdateWidget(old);
    if (widget.value != _ctrl.text) {
      _ctrl.value = TextEditingValue(
        text: widget.value,
        selection: TextSelection.collapsed(offset: widget.value.length),
      );
    }
    if (widget.isError && !old.isError) _shake.forward(from: 0);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _focus.dispose();
    _shake.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final v = widget.value;
    final n = widget.length;
    return AnimatedBuilder(
      animation: _shake,
      builder: (context, child) => Transform.translate(
        offset: Offset(math.sin(_shake.value * math.pi * 6) * 8 * (1 - _shake.value), 0),
        child: child,
      ),
      child: Semantics(
        value: tr('{length} of {n} digits entered', {'length': v.length, 'n': n}),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => _focus.requestFocus(),
              child: Stack(
                children: [
                  // Invisible field that owns the keyboard.
                  Opacity(
                    opacity: 0,
                    child: SizedBox(
                      height: 56,
                      child: TextField(
                        controller: _ctrl,
                        focusNode: _focus,
                        autofocus: widget.autofocus,
                        keyboardType: TextInputType.number,
                        inputFormatters: [FilteringTextInputFormatter.digitsOnly, LengthLimitingTextInputFormatter(n)],
                        onChanged: widget.onChanged,
                        showCursor: false,
                        enableInteractiveSelection: false,
                      ),
                    ),
                  ),
                  Row(
                    children: [
                      for (var i = 0; i < n; i++) ...[
                        if (i > 0) const SizedBox(width: 8),
                        Expanded(
                          child: Container(
                            height: 56,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: c.surface,
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                width: 1.5,
                                color: widget.isError
                                    ? c.error
                                    : i < v.length
                                    ? c.primary
                                    : i == v.length
                                    ? c.primarySoft
                                    : c.border,
                              ),
                            ),
                            child: Text(
                              i < v.length ? (widget.masked ? '•' : v[i]) : '',
                              style: BcType.title.copyWith(color: c.foreground),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Text(
              v.length == n
                  ? tr('All {n} digits entered', {'n': n})
                  : v.isEmpty
                  ? tr('0 of {n} digits entered', {'n': n})
                  : tr('{length} of {n} digits entered', {'length': v.length, 'n': n}),
              textAlign: TextAlign.end,
              style: BcType.tiny.copyWith(
                color: widget.isError
                    ? c.errorStrong
                    : v.length == n
                    ? c.successStrong
                    : c.mutedForeground,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Segmented control with sliding indicator — port of Tabs.kt BcSegmentedTabs.
class BcSegmentedTabs extends StatelessWidget {
  const BcSegmentedTabs({
    super.key,
    required this.tabs,
    required this.selectedIndex,
    required this.onSelect,
    this.filled = false,
  });

  final List<String> tabs;
  final int selectedIndex;
  final ValueChanged<int> onSelect;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Container(
      height: 44,
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: c.muted, borderRadius: BorderRadius.circular(BcRadius.full)),
      child: LayoutBuilder(
        builder: (context, box) {
          final w = tabs.isEmpty ? 0.0 : box.maxWidth / tabs.length;
          return Stack(
            children: [
              AnimatedPositioned(
                duration: BcMotion.standard,
                curve: Curves.easeInOut,
                left: w * selectedIndex,
                top: 0,
                bottom: 0,
                width: w,
                child: Container(
                  decoration: BoxDecoration(
                    color: filled ? c.primary : c.primarySoft,
                    borderRadius: BorderRadius.circular(BcRadius.full),
                  ),
                ),
              ),
              Row(
                children: [
                  for (var i = 0; i < tabs.length; i++)
                    Expanded(
                      child: InkWell(
                        borderRadius: BorderRadius.circular(BcRadius.full),
                        onTap: () {
                          BcFeedback.tap();
                          onSelect(i);
                        },
                        child: Center(
                          child: Text(
                            tabs[i],
                            style: BcType.label.copyWith(
                              color: i != selectedIndex
                                  ? c.mutedForeground
                                  : filled
                                  ? c.primaryForeground
                                  : c.primaryStrong,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          );
        },
      ),
    );
  }
}

/// Simple pill tab used in headers.
class TabPill extends StatelessWidget {
  const TabPill({super.key, required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Material(
      color: selected ? c.primarySoft : c.muted,
      borderRadius: BorderRadius.circular(BcRadius.full),
      child: InkWell(
        borderRadius: BorderRadius.circular(BcRadius.full),
        onTap: () {
          BcFeedback.tap();
          onTap();
        },
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
          child: Text(label, style: BcType.label.copyWith(color: selected ? c.primaryStrong : c.mutedForeground)),
        ),
      ),
    );
  }
}
