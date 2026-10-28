import 'package:flutter/material.dart';

import '../../core/feedback.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Full-width primary button — press scale, haptic, sound, loading morph. Port of Buttons.kt.
class BcButton extends StatefulWidget {
  const BcButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.loading = false,
    this.enabled = true,
    this.lockedRed = false,
    this.color,
    this.icon,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final bool enabled;

  /// Disabled state is rendered as a soft red "locked" button (geofence gates).
  final bool lockedRed;
  final Color? color;
  final IconData? icon;

  @override
  State<BcButton> createState() => _BcButtonState();
}

class _BcButtonState extends State<BcButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final active = widget.enabled && !widget.loading && widget.onPressed != null;
    final locked = widget.lockedRed && !widget.enabled && !widget.loading;
    final base = widget.color ?? c.brand;
    final bg = active
        ? base
        : locked
        ? const Color(0xFFFEE2E2)
        : base.withValues(alpha: 0.4);
    final fg = locked ? const Color(0xFFE11D48) : c.onBrand.withValues(alpha: active ? 1 : 0.8);
    return Semantics(
      button: true,
      label: widget.label,
      child: AnimatedScale(
        scale: _pressed ? 0.98 : 1,
        duration: BcMotion.fast,
        child: SizedBox(
          width: double.infinity,
          height: 54,
          child: Material(
            color: bg,
            borderRadius: BorderRadius.circular(BcRadius.button),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: active
                  ? () {
                      BcFeedback.tap();
                      widget.onPressed!();
                    }
                  : null,
              onHighlightChanged: (v) => setState(() => _pressed = v),
              child: Center(
                child: widget.loading
                    ? SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.5, color: c.onBrand),
                      )
                    : Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (widget.icon != null) ...[
                            Icon(widget.icon, color: fg, size: 20),
                            const SizedBox(width: 8),
                          ],
                          Flexible(
                            child: Text(
                              widget.label,
                              style: BcType.button.copyWith(color: fg),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Soft outlined secondary button.
class BcOutlineButton extends StatelessWidget {
  const BcOutlineButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.icon,
    this.enabled = true,
    this.loading = false,
    this.color,
    this.expand = false,
  });

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final bool enabled;
  final bool loading;
  final Color? color;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final active = enabled && !loading && onPressed != null;
    final fg = color ?? c.text;
    final button = SizedBox(
      height: 48,
      width: expand ? double.infinity : null,
      child: OutlinedButton(
        onPressed: active
            ? () {
                BcFeedback.tap();
                onPressed!();
              }
            : null,
        style: OutlinedButton.styleFrom(
          foregroundColor: fg,
          disabledForegroundColor: c.textMuted,
          side: BorderSide(color: color?.withValues(alpha: 0.5) ?? c.border),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(BcRadius.button)),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        ),
        child: loading
            ? SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: c.brand))
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)],
                  Flexible(
                    child: Text(label, style: BcType.button, maxLines: 1, overflow: TextOverflow.ellipsis),
                  ),
                ],
              ),
      ),
    );
    return button;
  }
}

class BcTextButton extends StatelessWidget {
  const BcTextButton({super.key, required this.label, required this.onPressed, this.color});

  final String label;
  final VoidCallback? onPressed;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onPressed == null
          ? null
          : () {
              BcFeedback.tap();
              onPressed!();
            },
      child: Text(label, style: BcType.button.copyWith(color: color ?? context.bc.brand)),
    );
  }
}

/// Circular icon + optional caption for Call / Navigate / Maps on the current stop.
class RoundActionIcon extends StatelessWidget {
  const RoundActionIcon({
    super.key,
    required this.onTap,
    this.caption,
    this.icon,
    this.child,
    this.enabled = true,
    this.tint,
    this.filled = false,
    this.semanticLabel,
  });

  final VoidCallback onTap;
  final String? caption;
  final IconData? icon;

  /// Custom glyph (e.g. the Google Maps pin) instead of [icon].
  final Widget? child;
  final bool enabled;
  final Color? tint;
  final bool filled;
  final String? semanticLabel;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final iconColor = filled
        ? c.onBrand
        : tint != null
        ? (enabled ? tint! : c.textMuted)
        : (enabled ? c.brandLight : c.textMuted);
    final bg = filled
        ? (enabled ? c.brand : c.brand.withValues(alpha: 0.4))
        : (enabled ? c.iconTile : c.iconTile.withValues(alpha: 0.6));
    return Semantics(
      button: true,
      label: semanticLabel ?? caption ?? tr('Action'),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Material(
            color: bg,
            shape: CircleBorder(side: filled ? BorderSide.none : BorderSide(color: c.border)),
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: enabled
                  ? () {
                      BcFeedback.tap();
                      onTap();
                    }
                  : null,
              child: SizedBox(
                width: 48,
                height: 48,
                child: Center(
                  child: Opacity(
                    opacity: child != null && !enabled ? 0.4 : 1,
                    child: child ?? Icon(icon, color: iconColor, size: 22),
                  ),
                ),
              ),
            ),
          ),
          if (caption != null)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(caption!, style: BcType.tiny.copyWith(color: enabled ? c.text : c.textMuted)),
            ),
        ],
      ),
    );
  }
}

/// The Google Maps pin glyph (multi-colour), drawn without an asset.
class GoogleMapsGlyph extends StatelessWidget {
  const GoogleMapsGlyph({super.key, this.size = 22});
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Icon(Icons.location_on, size: size, color: const Color(0xFFEA4335)),
          Positioned(
            top: size * 0.2,
            child: Container(
              width: size * 0.3,
              height: size * 0.3,
              decoration: const BoxDecoration(color: Color(0xFFB31412), shape: BoxShape.circle),
            ),
          ),
        ],
      ),
    );
  }
}

/// Circular Google Maps pin for opening turn-by-turn directions.
class GoogleMapsIconButton extends StatelessWidget {
  const GoogleMapsIconButton({super.key, required this.onTap, this.enabled = true, this.caption});

  final VoidCallback onTap;
  final bool enabled;
  final String? caption;

  @override
  Widget build(BuildContext context) => RoundActionIcon(
    onTap: onTap,
    enabled: enabled,
    caption: caption,
    semanticLabel: caption ?? tr('Open in Google Maps'),
    child: const GoogleMapsGlyph(),
  );
}

/// Even Call / Navigate / Maps row for the current stop. Optional trailing slot.
class StopCustomerActions extends StatelessWidget {
  const StopCustomerActions({
    super.key,
    required this.canCall,
    required this.canNavigate,
    required this.onCall,
    required this.onNavigate,
    required this.onOpenGoogleMaps,
    this.extra,
  });

  final bool canCall;
  final bool canNavigate;
  final VoidCallback onCall;
  final VoidCallback onNavigate;
  final VoidCallback onOpenGoogleMaps;
  final Widget? extra;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        RoundActionIcon(caption: tr('Call'), icon: Icons.call, enabled: canCall, onTap: onCall),
        RoundActionIcon(caption: tr('Navigate'), icon: Icons.navigation, enabled: canNavigate, onTap: onNavigate),
        GoogleMapsIconButton(caption: tr('Maps'), enabled: canNavigate, onTap: onOpenGoogleMaps),
        ?extra,
      ],
    );
  }
}

/// Icon-only actions for the next stop on an in-progress run: site, Google Maps, in-app nav.
class InProgressStopIconBar extends StatelessWidget {
  const InProgressStopIconBar({
    super.key,
    required this.canNavigate,
    required this.onOpenNextSite,
    required this.onOpenMap,
    required this.onNavigateInApp,
  });

  final bool canNavigate;
  final VoidCallback onOpenNextSite;
  final VoidCallback onOpenMap;
  final VoidCallback onNavigateInApp;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        RoundActionIcon(icon: Icons.place, semanticLabel: tr('Open next site'), filled: true, onTap: onOpenNextSite),
        GoogleMapsIconButton(enabled: canNavigate, onTap: onOpenMap),
        RoundActionIcon(
          icon: Icons.navigation,
          semanticLabel: tr('Navigate from our application'),
          enabled: canNavigate,
          onTap: onNavigateInApp,
        ),
      ],
    );
  }
}
