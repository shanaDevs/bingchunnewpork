import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../theme/bc_theme.dart';
import '../cup_icon.dart';
import '../wishlist_heart_button.dart';

class BcDesign {
  static const pageBg = Color(0xFFF3F6FB);
  static const cardNavy = Color(0xFF0B1F3F);
  static const muted = Color(0xFF6B7C93);
  static const inputBorder = Color(0xFF8EB5FF);
  static const headerGradient = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [Color(0xFF020B1C), Color(0xFF061428), Color(0xFF0A1D38)],
  );
}

class BcHeroBackground extends StatelessWidget {
  final double height;

  const BcHeroBackground({super.key, this.height = 360});

  @override
  Widget build(BuildContext context) {
    return ClipPath(
      clipper: _BcHeroClipper(),
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: Stack(
          fit: StackFit.expand,
          children: [
            const DecoratedBox(
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                  colors: [Color(0xFF020B1C), Color(0xFF061428), Color(0xFF0A1D38)],
                ),
              ),
            ),
            Positioned(
              left: -30,
              bottom: 40,
              child: Container(
                width: 180,
                height: 180,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [BcColors.brand.withValues(alpha: 0.55), BcColors.brand.withValues(alpha: 0)],
                  ),
                ),
              ),
            ),
            Positioned(
              right: -20,
              top: 30,
              child: Container(
                width: 160,
                height: 160,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [const Color(0xFF7B3FF2).withValues(alpha: 0.35), const Color(0xFF7B3FF2).withValues(alpha: 0)],
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _BcHeroClipper extends CustomClipper<Path> {
  @override
  Path getClip(Size size) {
    final path = Path();
    // Shallower wave so welcome text stays on the dark area.
    path.lineTo(0, size.height - 28);
    path.quadraticBezierTo(size.width * 0.5, size.height + 12, size.width, size.height - 28);
    path.lineTo(size.width, 0);
    path.close();
    return path;
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

/// Same bottom wave used on auth / home promo — white content shows through the scoop.
class BcWaveBottomClipper extends CustomClipper<Path> {
  const BcWaveBottomClipper();

  @override
  Path getClip(Size size) {
    final path = Path();
    path.lineTo(0, size.height - 28);
    path.quadraticBezierTo(size.width * 0.5, size.height + 12, size.width, size.height - 28);
    path.lineTo(size.width, 0);
    path.close();
    return path;
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

class BcAuthCard extends StatelessWidget {
  final Widget child;

  const BcAuthCard({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(22, 26, 22, 22),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 28,
            offset: const Offset(0, 12),
          ),
        ],
      ),
      child: child,
    );
  }
}

class BcPrimaryButton extends StatelessWidget {
  final String label;
  final bool isLoading;
  final VoidCallback? onPressed;

  const BcPrimaryButton({
    super.key,
    required this.label,
    this.isLoading = false,
    this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 54,
      width: double.infinity,
      child: ElevatedButton(
        onPressed: isLoading ? null : onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: BcColors.brand,
          foregroundColor: Colors.white,
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
        child: isLoading
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2.2, color: Colors.white),
              )
            : Row(
                children: [
                  const Spacer(),
                  Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                  const Spacer(),
                  const Icon(Icons.arrow_forward_rounded, size: 20),
                ],
              ),
      ),
    );
  }
}

class BcFlowProgress extends StatelessWidget {
  final int currentStep;
  final int totalSteps;

  const BcFlowProgress({super.key, required this.currentStep, this.totalSteps = 3});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(totalSteps, (index) {
        final step = index + 1;
        final active = step <= currentStep;
        return Expanded(
          child: Container(
            height: 4,
            margin: EdgeInsets.only(right: index < totalSteps - 1 ? 6 : 0),
            decoration: BoxDecoration(
              color: active ? BcColors.brand : const Color(0xFFDCE6F5),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
        );
      }),
    );
  }
}

class BcFlowHeader extends StatelessWidget implements PreferredSizeWidget {
  final String title;
  final int currentStep;
  final VoidCallback? onBack;

  const BcFlowHeader({
    super.key,
    required this.title,
    required this.currentStep,
    this.onBack,
  });

  @override
  Size get preferredSize => const Size.fromHeight(96);

  @override
  Widget build(BuildContext context) {
    return AppBar(
      backgroundColor: Colors.white,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
      leading: IconButton(
        onPressed: onBack ?? () => Navigator.of(context).maybePop(),
        icon: const Icon(Icons.arrow_back_ios_new_rounded, color: BcDesign.cardNavy, size: 20),
      ),
      title: Text(
        title,
        style: const TextStyle(
          color: BcDesign.cardNavy,
          fontWeight: FontWeight.w800,
          fontSize: 20,
        ),
      ),
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(28),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
          child: BcFlowProgress(currentStep: currentStep),
        ),
      ),
    );
  }
}

class BcOtpBoxes extends StatefulWidget {
  final ValueChanged<String> onChanged;
  final ValueChanged<String>? onCompleted;
  final int length;
  final bool enabled;
  final bool filledNavy;
  final String? currentCode;

  const BcOtpBoxes({
    super.key,
    required this.onChanged,
    this.onCompleted,
    this.length = 6,
    this.enabled = true,
    this.filledNavy = true,
    this.currentCode,
  });

  @override
  State<BcOtpBoxes> createState() => BcOtpBoxesState();
}

class BcOtpBoxesState extends State<BcOtpBoxes> {
  late final List<TextEditingController> _controllers;
  late final List<FocusNode> _focusNodes;
  bool _applyingExternal = false;

  @override
  void initState() {
    super.initState();
    _controllers = List.generate(widget.length, (_) => TextEditingController());
    _focusNodes = List.generate(widget.length, (_) => FocusNode());
    final initial = widget.currentCode?.replaceAll(RegExp(r'\D'), '') ?? '';
    if (initial.isNotEmpty) {
      for (var i = 0; i < widget.length; i++) {
        _controllers[i].text = i < initial.length ? initial[i] : '';
      }
    }
  }

  @override
  void didUpdateWidget(covariant BcOtpBoxes oldWidget) {
    super.didUpdateWidget(oldWidget);
    final next = widget.currentCode?.replaceAll(RegExp(r'\D'), '') ?? '';
    final prev = oldWidget.currentCode?.replaceAll(RegExp(r'\D'), '') ?? '';
    if (next.isEmpty && value.isNotEmpty && prev.isNotEmpty) {
      for (final c in _controllers) {
        c.clear();
      }
      return;
    }
    if (next.length == widget.length && next != value) {
      setValue(next, notifyCompleted: false);
    }
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    for (final f in _focusNodes) {
      f.dispose();
    }
    super.dispose();
  }

  String get value => _controllers.map((c) => c.text).join();

  void clear() {
    for (final c in _controllers) {
      c.clear();
    }
    if (_focusNodes.isNotEmpty) _focusNodes.first.requestFocus();
    widget.onChanged('');
  }

  void setValue(String code, {bool notifyCompleted = true}) {
    final digits = code.replaceAll(RegExp(r'\D'), '');
    if (digits.isEmpty) return;

    _applyingExternal = true;
    for (var i = 0; i < widget.length; i++) {
      final digit = i < digits.length ? digits[i] : '';
      if (_controllers[i].text != digit) {
        _controllers[i].value = TextEditingValue(
          text: digit,
          selection: TextSelection.collapsed(offset: digit.length),
        );
      }
    }
    _applyingExternal = false;
    if (mounted) setState(() {});

    final filled = value;
    widget.onChanged(filled);
    if (notifyCompleted && filled.length == widget.length) {
      for (final f in _focusNodes) {
        f.unfocus();
      }
      // Defer so we never call setState during build/didUpdateWidget.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        widget.onCompleted?.call(filled);
      });
    }
  }

  void _handleChanged(int index, String raw) {
    if (_applyingExternal) return;
    final digits = raw.replaceAll(RegExp(r'\D'), '');

    if (digits.length > 1) {
      setValue(digits);
      return;
    }

    if (_controllers[index].text != digits) {
      _controllers[index].value = TextEditingValue(
        text: digits,
        selection: TextSelection.collapsed(offset: digits.length),
      );
    }

    if (digits.isNotEmpty && index < widget.length - 1) {
      _focusNodes[index + 1].requestFocus();
    } else if (digits.isEmpty && index > 0) {
      _focusNodes[index - 1].requestFocus();
    }

    final filled = value;
    widget.onChanged(filled);
    if (filled.length == widget.length) {
      _focusNodes[index].unfocus();
      widget.onCompleted?.call(filled);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fillColor = widget.filledNavy ? BcDesign.cardNavy : Colors.white;
    final digitColor = widget.filledNavy ? Colors.white : BcDesign.cardNavy;
    final idleBorder = widget.filledNavy
        ? BcDesign.cardNavy
        : const Color(0xFFDCE6F5);

    return AutofillGroup(
      child: Row(
        children: List.generate(widget.length, (index) {
          return Expanded(
            child: Padding(
              padding: EdgeInsets.only(left: index == 0 ? 0 : 3, right: index == widget.length - 1 ? 0 : 3),
              child: AspectRatio(
                aspectRatio: 0.88,
                child: TextField(
                  controller: _controllers[index],
                  focusNode: _focusNodes[index],
                  enabled: widget.enabled,
                  textAlign: TextAlign.center,
                  keyboardType: TextInputType.number,
                  textInputAction: index == widget.length - 1 ? TextInputAction.done : TextInputAction.next,
                  autofillHints: index == 0 ? const [AutofillHints.oneTimeCode] : null,
                  enableSuggestions: true,
                  style: TextStyle(
                    color: digitColor,
                    fontSize: 22,
                    fontWeight: FontWeight.w700,
                  ),
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(widget.length),
                  ],
                  decoration: InputDecoration(
                    counterText: '',
                    filled: true,
                    fillColor: fillColor,
                    contentPadding: EdgeInsets.zero,
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: idleBorder, width: 1.4),
                    ),
                    focusedBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: BcColors.brand, width: 2),
                    ),
                    disabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: BorderSide(color: idleBorder.withValues(alpha: 0.5), width: 1.4),
                    ),
                  ),
                  onChanged: (digit) => _handleChanged(index, digit),
                ),
              ),
            ),
          );
        }),
      ),
    );
  }
}

InputDecoration bcAuthInputDecoration({
  required String label,
  String? hint,
  IconData? prefixIcon,
}) {
  return InputDecoration(
    labelText: label,
    labelStyle: const TextStyle(color: BcColors.brand, fontWeight: FontWeight.w600),
    floatingLabelStyle: const TextStyle(color: BcColors.brand, fontWeight: FontWeight.w600),
    hintText: hint,
    hintStyle: TextStyle(color: BcDesign.muted.withValues(alpha: 0.55)),
    prefixIcon: prefixIcon != null ? Icon(prefixIcon, color: BcColors.brand, size: 20) : null,
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: BcDesign.inputBorder, width: 1.4),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: BcColors.brand, width: 1.6),
    ),
    errorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: BcColors.error),
    ),
    focusedErrorBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: BcColors.error, width: 1.6),
    ),
  );
}

/// Dark gradient home header matching Figma screen 4.
class BcHomeHeader extends StatelessWidget {
  final String greeting;
  final String userName;
  final int loyaltyPoints;
  final String locationLabel;
  final int cartCount;
  final VoidCallback onLocationTap;
  final VoidCallback onCartTap;
  final VoidCallback? onNotificationsTap;

  const BcHomeHeader({
    super.key,
    required this.greeting,
    required this.userName,
    required this.loyaltyPoints,
    required this.locationLabel,
    required this.cartCount,
    required this.onLocationTap,
    required this.onCartTap,
    this.onNotificationsTap,
  });

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(gradient: BcDesign.headerGradient),
      child: Padding(
        padding: EdgeInsets.fromLTRB(16, top + 8, 16, 22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                CircleAvatar(
                  radius: 22,
                  backgroundColor: Colors.white.withValues(alpha: 0.15),
                  child: Text(
                    userName.isNotEmpty ? userName[0].toUpperCase() : 'G',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 18),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(greeting, style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 13)),
                      Text(
                        userName,
                        style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.stars_rounded, color: Color(0xFFFFD54F), size: 16),
                      const SizedBox(width: 4),
                      Text(
                        '$loyaltyPoints pts',
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 4),
                const WishlistHeaderButton(inverted: true),
                IconButton(
                  onPressed: onNotificationsTap,
                  icon: const Icon(Icons.notifications_none_rounded, color: Colors.white),
                ),
                IconButton(
                  onPressed: onCartTap,
                  icon: Padding(
                    padding: const EdgeInsets.only(top: 2, right: 2),
                    child: CupIcon.fromCount(
                      itemCount: cartCount,
                      size: CupIconSize.sm,
                      inverted: true,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            GestureDetector(
              onTap: onLocationTap,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.storefront_outlined, color: Colors.white, size: 18),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        locationLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: 13),
                      ),
                    ),
                    Icon(Icons.keyboard_arrow_down_rounded, color: Colors.white.withValues(alpha: 0.8)),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Horizontal product row for Figma "All Products" list.
class BcHomeProductTile extends StatelessWidget {
  final String name;
  final String? imageUrl;
  final int priceLkr;
  final String? productId;
  final VoidCallback onTap;
  final VoidCallback onAdd;

  const BcHomeProductTile({
    super.key,
    required this.name,
    this.imageUrl,
    required this.priceLkr,
    this.productId,
    required this.onTap,
    required this.onAdd,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: const Color(0xFFE8EEF5)),
          boxShadow: [
            BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 12, offset: const Offset(0, 4)),
          ],
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Container(
                width: 72,
                height: 72,
                color: const Color(0xFFE8F1FF),
                child: imageUrl != null && imageUrl!.isNotEmpty
                    ? Image.network(imageUrl!, fit: BoxFit.contain, errorBuilder: (_, _, _) => const Icon(Icons.local_cafe, color: BcColors.brand))
                    : const Icon(Icons.local_cafe, color: BcColors.brand, size: 32),
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: BcDesign.cardNavy, fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(height: 6),
                  Text(
                    'LKR $priceLkr',
                    style: const TextStyle(color: BcColors.brand, fontWeight: FontWeight.w800, fontSize: 16),
                  ),
                ],
              ),
            ),
            Column(
              children: [
                if (productId != null)
                  WishlistHeartButton(productId: productId!, iconSize: 14, padding: 5),
                if (productId != null) const SizedBox(height: 8),
                Material(
                  color: BcColors.brand,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    onTap: onAdd,
                    borderRadius: BorderRadius.circular(12),
                    child: const SizedBox(width: 40, height: 40, child: Icon(Icons.add, color: Colors.white)),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Store card for Figma store locator screen.
class BcStoreLocatorCard extends StatelessWidget {
  final String name;
  final String address;
  final String? distanceLabel;
  final bool isSelected;
  final VoidCallback onPickUp;

  const BcStoreLocatorCard({
    super.key,
    required this.name,
    required this.address,
    this.distanceLabel,
    this.isSelected = false,
    required this.onPickUp,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: isSelected ? BcColors.brand : const Color(0xFFE8EEF5), width: isSelected ? 1.6 : 1),
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 10, offset: const Offset(0, 3)),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: const Color(0xFFE8F1FF),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.storefront_rounded, color: BcColors.brand),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(color: BcDesign.cardNavy, fontWeight: FontWeight.w800, fontSize: 15)),
                const SizedBox(height: 4),
                Text(address, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(color: BcDesign.muted, fontSize: 12)),
                if (distanceLabel != null) ...[
                  const SizedBox(height: 4),
                  Text(distanceLabel!, style: const TextStyle(color: BcColors.brand, fontSize: 11, fontWeight: FontWeight.w600)),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          SizedBox(
            height: 38,
            child: ElevatedButton(
              onPressed: onPickUp,
              style: ElevatedButton.styleFrom(
                backgroundColor: BcColors.brand,
                foregroundColor: Colors.white,
                elevation: 0,
                padding: const EdgeInsets.symmetric(horizontal: 14),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              child: const Text('Pick up', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
            ),
          ),
        ],
      ),
    );
  }
}

InputDecoration bcPhoneInputDecoration({String hint = '76 581 1999'}) {
  return InputDecoration(
    hintText: hint,
    hintStyle: TextStyle(color: BcDesign.muted.withValues(alpha: 0.55)),
    filled: true,
    fillColor: Colors.white,
    contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
    enabledBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: BcDesign.inputBorder, width: 1.4),
    ),
    focusedBorder: OutlineInputBorder(
      borderRadius: BorderRadius.circular(14),
      borderSide: const BorderSide(color: BcColors.brand, width: 1.6),
    ),
  );
}
