import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import '../theme/bc_theme.dart';

/// Root messenger — kept for any legacy snackbar usage.
final rootScaffoldMessengerKey = GlobalKey<ScaffoldMessengerState>();

class _ToastMessage {
  final int id;
  final String message;
  final bool isError;
  final Duration duration;

  const _ToastMessage({
    required this.id,
    required this.message,
    required this.isError,
    required this.duration,
  });
}

/// Active top toast — listened to by [TopToastHost].
final ValueNotifier<_ToastMessage?> activeTopToast = ValueNotifier(null);

int _toastSeq = 0;

/// Brief auto-dismissing top toast with shrinking progress bar.
void showAppToast(
  BuildContext? context,
  String message, {
  bool isError = true,
  Duration duration = const Duration(seconds: 3),
}) {
  void show() {
    final id = ++_toastSeq;
    activeTopToast.value = _ToastMessage(
      id: id,
      message: message,
      isError: isError,
      duration: duration,
    );

    Future.delayed(duration, () {
      if (activeTopToast.value?.id == id) {
        activeTopToast.value = null;
      }
    });
  }

  WidgetsBinding.instance.addPostFrameCallback((_) => show());
}

/// Wraps the app so toasts render at the top of the screen.
class TopToastHost extends StatelessWidget {
  final Widget? child;

  const TopToastHost({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<_ToastMessage?>(
      valueListenable: activeTopToast,
      builder: (context, toast, child) {
        return Stack(
          children: [
            if (child != null) child,
            if (toast != null)
              Positioned(
                top: MediaQuery.paddingOf(context).top + 12,
                left: 16,
                right: 16,
                child: Material(
                  color: Colors.transparent,
                  child: _TopToastContent(
                    key: ValueKey(toast.id),
                    message: toast.message,
                    duration: toast.duration,
                    isError: toast.isError,
                  ),
                ),
              ),
          ],
        );
      },
      child: child,
    );
  }
}

class _TopToastContent extends StatefulWidget {
  final String message;
  final Duration duration;
  final bool isError;

  const _TopToastContent({
    super.key,
    required this.message,
    required this.duration,
    required this.isError,
  });

  @override
  State<_TopToastContent> createState() => _TopToastContentState();
}

class _TopToastContentState extends State<_TopToastContent>
    with SingleTickerProviderStateMixin {
  late final AnimationController _progress;

  @override
  void initState() {
    super.initState();
    _progress = AnimationController(vsync: this, duration: widget.duration)
      ..forward();
  }

  @override
  void dispose() {
    _progress.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cardBg = isDark ? BcColors.navyCard : BcColors.lightSurface;
    final textCol = isDark ? BcColors.text : BcColors.lightText;
    final themeColor = widget.isError ? BcColors.error : BcColors.brand;

    return Dismissible(
      key: widget.key ?? ValueKey(widget.message),
      direction: DismissDirection.up,
      onDismissed: (_) => activeTopToast.value = null,
      child: Container(
        decoration: BoxDecoration(
          color: cardBg,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: themeColor.withValues(alpha: 0.55), width: 1.5),
          boxShadow: [
            BoxShadow(
              color: themeColor.withValues(alpha: 0.2),
              blurRadius: 14,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        clipBehavior: Clip.antiAlias,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
              child: Row(
                children: [
                  Container(
                    width: 32,
                    height: 32,
                    decoration: const BoxDecoration(
                      color: Colors.black,
                      shape: BoxShape.circle,
                    ),
                    clipBehavior: Clip.antiAlias,
                    child: Image.asset(
                      'assets/brand/logo.png',
                      fit: BoxFit.cover,
                      cacheWidth: 64,
                      cacheHeight: 64,
                      errorBuilder: (_, __, ___) => const Icon(
                        Icons.icecream,
                        color: BcColors.brand,
                        size: 16,
                      ),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      widget.message,
                      style: TextStyle(
                        color: textCol,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        height: 1.3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            AnimatedBuilder(
              animation: _progress,
              builder: (context, _) {
                final remaining = (1 - _progress.value).clamp(0.0, 1.0);
                return LinearProgressIndicator(
                  value: remaining,
                  minHeight: 3,
                  backgroundColor: themeColor.withValues(alpha: 0.12),
                  valueColor: AlwaysStoppedAnimation<Color>(themeColor),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

void goHome(BuildContext context) {
  activeTopToast.value = null;
  rootScaffoldMessengerKey.currentState?.clearSnackBars();
  context.go('/home');
}
