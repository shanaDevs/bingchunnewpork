import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/feedback.dart';
import '../theme/pos_theme.dart';

/// Branded app bar for pushed pages: the sidebar's indigo gradient with rounded
/// bottom corners, a frosted back chip, a small uppercase context label over a
/// bold white title, and optional actions (white icons).
class PosAppBar extends StatelessWidget implements PreferredSizeWidget {
  const PosAppBar({super.key, required this.title, this.eyebrow, this.actions = const []});

  final String title;

  /// Context line above the title, e.g. "Dehiwala · Branch Admin" or "Report".
  final String? eyebrow;
  final List<Widget> actions;

  static const _height = 76.0;
  static const _radius = Radius.circular(24);

  @override
  Size get preferredSize => const Size.fromHeight(_height);

  @override
  Widget build(BuildContext context) {
    final canPop = Navigator.of(context).canPop();
    return AppBar(
      toolbarHeight: _height,
      backgroundColor: Colors.transparent,
      foregroundColor: Colors.white,
      surfaceTintColor: Colors.transparent,
      systemOverlayStyle: SystemUiOverlayStyle.light,
      automaticallyImplyLeading: false,
      leadingWidth: canPop ? 68 : 0,
      titleSpacing: canPop ? 2 : PosSpacing.lg,
      iconTheme: const IconThemeData(color: Colors.white),
      actionsIconTheme: const IconThemeData(color: Colors.white),
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(bottom: _radius)),
      flexibleSpace: ClipRRect(
        borderRadius: const BorderRadius.vertical(bottom: _radius),
        child: Stack(
          fit: StackFit.expand,
          children: [
            const DecoratedBox(decoration: BoxDecoration(gradient: PosColors.sidebarGradient)),
            // Soft brand glow in the corner, like the sign-in hero.
            Positioned(
              right: -40,
              top: -60,
              child: Container(
                width: 180,
                height: 180,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [const Color(0xFF307EF2).withValues(alpha: 0.35), Colors.transparent],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
      leading: canPop ? const Center(child: _GlassBackButton()) : null,
      title: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (eyebrow != null)
            Text(
              eyebrow!.toUpperCase(),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: PosType.label.copyWith(color: Colors.white60, fontSize: 10.5),
            ),
          Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: PosType.heading.copyWith(color: Colors.white, fontSize: 19),
          ),
        ],
      ),
      actions: [...actions, const SizedBox(width: PosSpacing.md)],
    );
  }
}

/// Frosted white chip on the indigo header.
class _GlassBackButton extends StatelessWidget {
  const _GlassBackButton();

  @override
  Widget build(BuildContext context) => Tooltip(
    message: MaterialLocalizations.of(context).backButtonTooltip,
    child: Material(
      color: Colors.white.withValues(alpha: 0.14),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(PosRadius.button + 2),
        side: BorderSide(color: Colors.white.withValues(alpha: 0.22)),
      ),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: () {
          PosFeedback.tap();
          Navigator.of(context).maybePop();
        },
        child: const SizedBox(
          width: 42,
          height: 42,
          child: Icon(Icons.arrow_back_rounded, size: 21, color: Colors.white),
        ),
      ),
    ),
  );
}
