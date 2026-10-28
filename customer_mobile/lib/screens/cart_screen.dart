import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../config/api_config.dart';
import '../models/cart_item.dart';
import '../providers/auth_provider.dart';
import '../providers/cart_provider.dart';
import '../providers/fulfillment_provider.dart';
import '../services/cart_sfx.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';
import '../utils/checkout_fees.dart';
import '../utils/shell_layout.dart';
import '../widgets/cup_icon.dart';
import '../widgets/pop_quantity_text.dart';
import '../widgets/product_radial_image.dart';

const _navy = Color(0xFF0B1F3F);
const _muted = Color(0xFF6B7C93);
const _pageBg = Color(0xFFF6F8FC);
const _chipPeach = Color(0xFFFFF1E6);
const _chipBlue = Color(0xFFE8F1FF);

final _money = NumberFormat('#,###');

String _lkr(int amount) => 'LKR ${_money.format(amount)}';

TextStyle _pp({
  double size = 14,
  FontWeight weight = FontWeight.w400,
  Color color = _navy,
  double height = 1.3,
}) {
  return GoogleFonts.poppins(
    fontSize: size,
    fontWeight: weight,
    color: color,
    height: height,
  );
}

class CartScreen extends ConsumerStatefulWidget {
  const CartScreen({super.key});

  @override
  ConsumerState<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends ConsumerState<CartScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _mascotCtrl;
  bool _priceOpen = true;

  @override
  void initState() {
    super.initState();
    _mascotCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2200),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _mascotCtrl.dispose();
    super.dispose();
  }

  static String _shortStoreName(String? raw) {
    var name = (raw ?? '').trim();
    if (name.isEmpty) return 'Select store';
    final brandPrefixes = [
      RegExp(r'^bing\s*chun\s*[-–—:|]\s*', caseSensitive: false),
      RegExp(r'^bing\s*chun\s+', caseSensitive: false),
    ];
    for (final re in brandPrefixes) {
      name = name.replaceFirst(re, '').trim();
    }
    return name.isEmpty ? 'Select store' : name;
  }

  Future<void> _showPromoDialog() async {
    final controller = TextEditingController(
      text: ref.read(cartProvider).promoCode ?? '',
    );
    final code = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Promo code'),
        content: TextField(
          controller: controller,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(
            hintText: 'Enter code',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, controller.text.trim()),
            child: const Text('Apply'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (code == null || !mounted) return;
    if (code.isEmpty) {
      ref.read(cartProvider.notifier).setPromoCode(null);
      return;
    }
    final ok = await ref.read(cartProvider.notifier).applyPromoCode(code);
    if (!mounted) return;
    showAppToast(context, ok ? 'Promo applied' : 'Invalid promo code');
  }

  Future<void> _itemMenu(CartItem item) async {
    final action = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.edit_outlined, color: BcColors.brand),
              title: const Text('Customize'),
              onTap: () => Navigator.pop(ctx, 'customize'),
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline_rounded, color: BcColors.error),
              title: const Text('Remove'),
              onTap: () => Navigator.pop(ctx, 'remove'),
            ),
          ],
        ),
      ),
    );
    if (!mounted || action == null) return;
    if (action == 'customize') {
      context.push('/product/${item.product.id}', extra: item.product);
    } else if (action == 'remove') {
      await ref.read(cartProvider.notifier).updateQuantity(item, 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cartState = ref.watch(cartProvider);
    final fulfillment = ref.watch(fulfillmentProvider);
    final user = ref.watch(authProvider).user;
    final isCartEmpty = cartState.items.isEmpty;
    final totalQty = cartState.items.fold<int>(0, (sum, i) => sum + i.quantity);
    final billBottom = shellCartBillBottomOffset(context);
    final navBarHeight = shellNavBarHeight(context);

    final isDelivery = fulfillment.orderMode == 'DELIVERY';
    final orderMode = fulfillment.orderMode ?? 'TAKEAWAY';
    // Web cart previews fees with PayHere (pickup fee is waived; delivery online fee is charged).
    const previewPayment = 'PAYHERE';
    final displayConvenienceFee = computeCheckoutConvenienceFee(
      cartState.subtotal,
      orderMode,
      previewPayment,
    );
    final chargedFee = chargedConvenienceFee(
      cartState.subtotal,
      orderMode,
      previewPayment,
    );
    final deliveryFee = isDelivery ? fulfillment.deliveryFee : 0;
    final cupTotal = (cartState.subtotal + chargedFee + deliveryFee - cartState.discount)
        .clamp(0, 1 << 30);
    final storeLabel = _shortStoreName(fulfillment.storeName);
    final place = isDelivery
        ? (fulfillment.deliveryAddress?.split(',').first.trim() ?? storeLabel)
        : storeLabel;
    final fulfillmentTitle = isDelivery ? 'Delivery • $place' : 'Pickup • $place';
    final mins = fulfillment.estimatedMinutes > 0 ? fulfillment.estimatedMinutes : 20;
    final etaLabel = isDelivery
        ? 'Arrives in $mins–${mins + 10} min'
        : 'Ready in ${mins > 5 ? mins - 5 : mins}–$mins min';

    return Theme(
      data: Theme.of(context).copyWith(scaffoldBackgroundColor: _pageBg),
      child: Scaffold(
        backgroundColor: _pageBg,
        extendBody: true,
        body: cartState.isLoading && isCartEmpty
            ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
            : isCartEmpty
                ? Padding(
                    padding: EdgeInsets.only(bottom: navBarHeight),
                    child: _EmptyCup(onShop: () => context.go('/menu')),
                  )
                : Stack(
                    fit: StackFit.expand,
                    children: [
                      CustomScrollView(
                        physics: const BouncingScrollPhysics(),
                        slivers: [
                          SliverToBoxAdapter(
                            child: _CupHeader(
                              drinkCount: totalQty,
                              mascot: _mascotCtrl,
                              onBack: () =>
                                  context.canPop() ? context.pop() : context.go('/home'),
                              onClear: () => ref.read(cartProvider.notifier).clearCart(),
                            ),
                          ),
                          SliverToBoxAdapter(
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.stretch,
                                children: [
                                  const _CupStepper(),
                                  const SizedBox(height: 14),
                                  _FulfillmentCard(
                                    isDelivery: isDelivery,
                                    title: fulfillmentTitle,
                                    etaLabel: etaLabel,
                                    onChange: () {
                                      final mode = isDelivery ? 'DELIVERY' : 'TAKEAWAY';
                                      context.push('/fulfillment-setup?mode=$mode');
                                    },
                                  ),
                                  const SizedBox(height: 20),
                                  Row(
                                    children: [
                                      Text(
                                        'Your drinks',
                                        style: _pp(size: 17, weight: FontWeight.w800),
                                      ),
                                      const Spacer(),
                                      TextButton(
                                        onPressed: () => context.go('/menu'),
                                        style: TextButton.styleFrom(
                                          foregroundColor: BcColors.brand,
                                          padding: EdgeInsets.zero,
                                          visualDensity: VisualDensity.compact,
                                        ),
                                        child: Text(
                                          '+ Add drink',
                                          style: _pp(
                                            size: 13,
                                            weight: FontWeight.w700,
                                            color: BcColors.brand,
                                          ),
                                        ),
                                      ),
                                    ],
                                  ),
                                  const SizedBox(height: 6),
                                ],
                              ),
                            ),
                          ),
                          SliverPadding(
                            padding: const EdgeInsets.symmetric(horizontal: 16),
                            sliver: SliverList.builder(
                              itemCount: cartState.items.length,
                              itemBuilder: (context, i) {
                                final item = cartState.items[i];
                                return TweenAnimationBuilder<double>(
                                  tween: Tween(begin: 0, end: 1),
                                  duration: Duration(milliseconds: 280 + i * 80),
                                  curve: Curves.easeOutCubic,
                                  builder: (context, t, child) => Opacity(
                                    opacity: t,
                                    child: Transform.translate(
                                      offset: Offset(0, 16 * (1 - t)),
                                      child: child,
                                    ),
                                  ),
                                  child: _DrinkCard(
                                    item: item,
                                    accent: i.isEven ? BcColors.brand : const Color(0xFFF59E0B),
                                    chipColor: i.isEven ? _chipPeach : _chipBlue,
                                    onDec: () => ref
                                        .read(cartProvider.notifier)
                                        .updateQuantity(item, item.quantity - 1),
                                    onInc: () async {
                                      final ok = await ref
                                          .read(cartProvider.notifier)
                                          .updateQuantity(item, item.quantity + 1);
                                      if (!context.mounted) return;
                                      if (!ok) {
                                        final error = ref.read(cartProvider).errorMessage ??
                                            'Not enough stock at your branch for that quantity.';
                                        showAppToast(context, error, isError: true);
                                        return;
                                      }
                                      CartSfx.instance.playAdd();
                                    },
                                    onCustomize: () => context.push(
                                      '/product/${item.product.id}',
                                      extra: item.product,
                                    ),
                                    onMore: () => _itemMenu(item),
                                  ),
                                );
                              },
                            ),
                          ),
                          SliverToBoxAdapter(
                            child: Padding(
                              padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
                              child: Column(
                                children: [
                                  _OffersRow(
                                    points: user?.loyaltyPoints ?? 0,
                                    promoCode: cartState.promoCode,
                                    onPoints: () {
                                      showAppToast(context, 'Redeem points at checkout');
                                      context.push('/checkout');
                                    },
                                    onPromo: _showPromoDialog,
                                  ),
                                  const SizedBox(height: 14),
                                  _PriceDetails(
                                    cart: cartState,
                                    orderMode: orderMode,
                                    displayConvenienceFee: displayConvenienceFee,
                                    chargedConvenienceFee: chargedFee,
                                    open: _priceOpen,
                                    onToggle: () => setState(() => _priceOpen = !_priceOpen),
                                  ),
                                  SizedBox(height: 132 + billBottom),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom: billBottom,
                        child: _CheckoutBar(
                          total: cupTotal,
                          onCheckout: () => context.push('/checkout'),
                        ),
                      ),
                    ],
                  ),
      ),
    );
  }
}

class _CupHeader extends StatelessWidget {
  final int drinkCount;
  final Animation<double> mascot;
  final VoidCallback onBack;
  final VoidCallback onClear;

  const _CupHeader({
    required this.drinkCount,
    required this.mascot,
    required this.onBack,
    required this.onClear,
  });

  @override
  Widget build(BuildContext context) {
    final top = MediaQuery.paddingOf(context).top;
    return Padding(
      padding: EdgeInsets.fromLTRB(8, top + 4, 8, 8),
      child: SizedBox(
        height: 52,
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Row(
              children: [
                IconButton(
                  onPressed: onBack,
                  icon: const Icon(Icons.arrow_back_rounded, color: _navy, size: 22),
                ),
                Text('My Cup', style: _pp(size: 18, weight: FontWeight.w800)),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 3),
                  decoration: BoxDecoration(
                    color: BcColors.brand,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    '$drinkCount ${drinkCount == 1 ? 'drink' : 'drinks'}',
                    style: _pp(size: 11, weight: FontWeight.w700, color: Colors.white),
                  ),
                ),
                const Spacer(),
                PopupMenuButton<String>(
                  icon: const Icon(Icons.more_vert_rounded, color: _navy),
                  onSelected: (v) {
                    if (v == 'clear') onClear();
                    if (v == 'menu') context.go('/menu');
                  },
                  itemBuilder: (_) => const [
                    PopupMenuItem(value: 'menu', child: Text('Add more drinks')),
                    PopupMenuItem(value: 'clear', child: Text('Clear cup')),
                  ],
                ),
              ],
            ),
            Positioned(
              right: 46,
              top: -10,
              child: AnimatedBuilder(
                animation: mascot,
                builder: (context, child) {
                  final t = Curves.easeInOut.transform(mascot.value);
                  return Transform.translate(
                    offset: Offset(0, -4 + t * 6),
                    child: child,
                  );
                },
                child: Image.asset(
                  'assets/brand/mascot-hover.png',
                  width: 54,
                  height: 54,
                  fit: BoxFit.contain,
                  errorBuilder: (_, _, _) => Image.asset(
                    'assets/mascots/welcome.png',
                    width: 54,
                    height: 54,
                    errorBuilder: (_, _, _) => const SizedBox(width: 54, height: 54),
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

class _CupStepper extends StatelessWidget {
  const _CupStepper();

  @override
  Widget build(BuildContext context) {
    Widget step({
      required IconData icon,
      required String label,
      required bool active,
      required bool done,
    }) {
      return Column(
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: active || done ? BcColors.brand : Colors.white,
              shape: BoxShape.circle,
              border: Border.all(
                color: active || done ? BcColors.brand : const Color(0xFFD5DEEA),
                width: 1.6,
              ),
            ),
            child: Icon(
              done ? Icons.check_rounded : icon,
              size: 16,
              color: active || done ? Colors.white : const Color(0xFF94A3B8),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            label,
            style: _pp(
              size: 11,
              weight: FontWeight.w600,
              color: active ? BcColors.brand : _muted,
            ),
          ),
        ],
      );
    }

    return Row(
      children: [
        step(icon: Icons.local_cafe_rounded, label: 'Cup', active: true, done: false),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Container(
              height: 2,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [BcColors.brand, Color(0xFFD6E4F7)],
                ),
              ),
            ),
          ),
        ),
        step(icon: Icons.assignment_outlined, label: 'Details', active: false, done: false),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Container(height: 2, color: const Color(0xFFD6E4F7)),
          ),
        ),
        step(icon: Icons.credit_card_rounded, label: 'Pay', active: false, done: false),
      ],
    );
  }
}

class _FulfillmentCard extends StatelessWidget {
  final bool isDelivery;
  final String title;
  final String etaLabel;
  final VoidCallback onChange;

  const _FulfillmentCard({
    required this.isDelivery,
    required this.title,
    required this.etaLabel,
    required this.onChange,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(10, 10, 10, 10),
      decoration: BoxDecoration(
        color: const Color(0xFFEEF2F7),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(
              isDelivery ? Icons.delivery_dining_rounded : Icons.storefront_rounded,
              color: BcColors.brand,
              size: 22,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: _pp(size: 14, weight: FontWeight.w700)),
                const SizedBox(height: 2),
                Row(
                  children: [
                    Container(
                      width: 7,
                      height: 7,
                      decoration: const BoxDecoration(
                        color: Color(0xFF22C55E),
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Flexible(
                      child: Text(
                        etaLabel,
                        style: _pp(size: 12, weight: FontWeight.w500, color: _muted),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          OutlinedButton(
            onPressed: onChange,
            style: OutlinedButton.styleFrom(
              foregroundColor: BcColors.brand,
              side: const BorderSide(color: BcColors.brand, width: 1.3),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 0),
              minimumSize: const Size(0, 34),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            ),
            child: Text('Change', style: _pp(size: 13, weight: FontWeight.w700, color: BcColors.brand)),
          ),
        ],
      ),
    );
  }
}

class _DrinkCard extends StatelessWidget {
  final CartItem item;
  final Color accent;
  final Color chipColor;
  final VoidCallback onDec;
  final VoidCallback onInc;
  final VoidCallback onCustomize;
  final VoidCallback onMore;

  const _DrinkCard({
    required this.item,
    required this.accent,
    required this.chipColor,
    required this.onDec,
    required this.onInc,
    required this.onCustomize,
    required this.onMore,
  });

  @override
  Widget build(BuildContext context) {
    final tags = <String>[
      item.size.displayString,
      ...item.selectedToppings.map((t) => t.name),
    ];

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(width: 5, color: accent),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(10, 12, 8, 12),
                child: Column(
                  children: [
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        ProductRadialImage(
                          imageUrl: item.product.imageUrl,
                          width: 72,
                          height: 72,
                          borderRadius: BorderRadius.circular(14),
                          padding: const EdgeInsets.all(4),
                          placeholderIcon: Icons.local_cafe_rounded,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Expanded(
                                    child: Text(
                                      item.product.name,
                                      maxLines: 2,
                                      overflow: TextOverflow.ellipsis,
                                      style: _pp(size: 14, weight: FontWeight.w800),
                                    ),
                                  ),
                                  InkWell(
                                    onTap: onMore,
                                    borderRadius: BorderRadius.circular(16),
                                    child: const Padding(
                                      padding: EdgeInsets.all(4),
                                      child: Icon(Icons.more_vert_rounded, size: 18, color: _muted),
                                    ),
                                  ),
                                ],
                              ),
                              if (tags.isNotEmpty) ...[
                                const SizedBox(height: 6),
                                Wrap(
                                  spacing: 6,
                                  runSpacing: 4,
                                  children: [
                                    for (final tag in tags.take(3))
                                      Container(
                                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                                        decoration: BoxDecoration(
                                          color: chipColor,
                                          borderRadius: BorderRadius.circular(20),
                                        ),
                                        child: Text(
                                          tag,
                                          style: _pp(size: 10, weight: FontWeight.w600, color: _navy),
                                        ),
                                      ),
                                  ],
                                ),
                              ],
                              const SizedBox(height: 6),
                              InkWell(
                                onTap: onCustomize,
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    const Icon(Icons.edit_outlined, size: 13, color: BcColors.brand),
                                    const SizedBox(width: 4),
                                    Text(
                                      'Customize',
                                      style: _pp(size: 12, weight: FontWeight.w700, color: BcColors.brand),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '${_lkr(item.unitPrice)} each',
                                style: _pp(size: 11, color: _muted),
                              ),
                              Text(
                                _lkr(item.totalPrice),
                                style: _pp(size: 16, weight: FontWeight.w800),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 3),
                          decoration: BoxDecoration(
                            color: const Color(0xFFF1F4F9),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            children: [
                              _QtyBtn(icon: Icons.remove_rounded, onTap: onDec),
                              Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 10),
                                child: PopQuantityText(
                                  quantity: item.quantity,
                                  fontSize: 14,
                                  color: _navy,
                                ),
                              ),
                              _QtyBtn(icon: Icons.add_rounded, onTap: onInc, filled: true),
                            ],
                          ),
                        ),
                      ],
                    ),
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

class _QtyBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final bool filled;

  const _QtyBtn({required this.icon, required this.onTap, this.filled = false});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: filled ? BcColors.brand : Colors.white,
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 28,
          height: 28,
          child: Icon(icon, size: 15, color: filled ? Colors.white : BcColors.brand),
        ),
      ),
    );
  }
}

class _OffersRow extends StatelessWidget {
  final int points;
  final String? promoCode;
  final VoidCallback onPoints;
  final VoidCallback onPromo;

  const _OffersRow({
    required this.points,
    required this.promoCode,
    required this.onPoints,
    required this.onPromo,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFEAF3FF),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        children: [
          Expanded(
            child: _OfferMini(
              icon: Icons.stars_rounded,
              iconColor: const Color(0xFFF59E0B),
              title: '$points points',
              action: 'Use points',
              onTap: onPoints,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _OfferMini(
              icon: Icons.confirmation_number_rounded,
              iconColor: const Color(0xFFF97316),
              title: promoCode ?? 'Promo code',
              action: promoCode == null ? 'Add code' : 'Change',
              onTap: onPromo,
            ),
          ),
        ],
      ),
    );
  }
}

class _OfferMini extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String action;
  final VoidCallback onTap;

  const _OfferMini({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.action,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(10, 10, 8, 10),
          child: Row(
            children: [
              Icon(icon, color: iconColor, size: 20),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: _pp(size: 12, weight: FontWeight.w700),
                    ),
                    Text(
                      action,
                      style: _pp(size: 11, weight: FontWeight.w600, color: BcColors.brand),
                    ),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right_rounded, color: BcColors.brand, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}

class _PriceDetails extends StatelessWidget {
  final CartState cart;
  final String orderMode;
  final int displayConvenienceFee;
  final int chargedConvenienceFee;
  final bool open;
  final VoidCallback onToggle;

  const _PriceDetails({
    required this.cart,
    required this.orderMode,
    required this.displayConvenienceFee,
    required this.chargedConvenienceFee,
    required this.open,
    required this.onToggle,
  });

  @override
  Widget build(BuildContext context) {
    final isPickup = orderMode == 'TAKEAWAY';
    final showWaivedPickupFee = isPickup && displayConvenienceFee > 0;
    final showChargedFee = !isPickup && chargedConvenienceFee > 0;
    final feeLabel = formatConvenienceFeeLabel(orderMode);
    final feeAmount = showWaivedPickupFee ? displayConvenienceFee : chargedConvenienceFee;

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE6EDF5)),
      ),
      child: Column(
        children: [
          InkWell(
            onTap: onToggle,
            child: Row(
              children: [
                Text('Price details', style: _pp(size: 14, weight: FontWeight.w800)),
                const Spacer(),
                AnimatedRotation(
                  turns: open ? 0.5 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: const Icon(Icons.keyboard_arrow_down_rounded, color: _muted),
                ),
              ],
            ),
          ),
          AnimatedCrossFade(
            firstChild: const SizedBox(width: double.infinity, height: 0),
            secondChild: Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Column(
                children: [
                  _priceLine('Subtotal', _lkr(cart.subtotal)),
                  if (showWaivedPickupFee || showChargedFee) ...[
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            feeLabel,
                            style: _pp(size: 13, color: _muted).copyWith(
                              decoration: showWaivedPickupFee
                                  ? TextDecoration.lineThrough
                                  : TextDecoration.none,
                              decorationColor: _muted,
                            ),
                          ),
                        ),
                        const SizedBox(width: 4),
                        const Icon(Icons.info_outline_rounded, size: 14, color: _muted),
                        const SizedBox(width: 8),
                        Text(
                          _lkr(feeAmount),
                          style: _pp(
                            size: 13,
                            weight: FontWeight.w600,
                            color: showWaivedPickupFee ? _muted : _navy,
                          ).copyWith(
                            decoration: showWaivedPickupFee
                                ? TextDecoration.lineThrough
                                : TextDecoration.none,
                            decorationColor: _muted,
                          ),
                        ),
                      ],
                    ),
                  ],
                  if (cart.discount > 0) ...[
                    const SizedBox(height: 8),
                    _priceLine('Promo discount', '- ${_lkr(cart.discount)}', valueColor: BcColors.success),
                  ],
                  const SizedBox(height: 10),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      showWaivedPickupFee
                          ? 'Convenience fee waived for pickup'
                          : 'Taxes included where applicable',
                      style: _pp(size: 11, color: _muted),
                    ),
                  ),
                ],
              ),
            ),
            crossFadeState: open ? CrossFadeState.showSecond : CrossFadeState.showFirst,
            duration: const Duration(milliseconds: 220),
          ),
        ],
      ),
    );
  }

  Widget _priceLine(String label, String value, {Color? valueColor}) {
    return Row(
      children: [
        Text(label, style: _pp(size: 13, color: _muted)),
        const Spacer(),
        Text(value, style: _pp(size: 13, weight: FontWeight.w600, color: valueColor ?? _navy)),
      ],
    );
  }
}

class _CheckoutBar extends StatelessWidget {
  final int total;
  final VoidCallback onCheckout;

  const _CheckoutBar({required this.total, required this.onCheckout});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      elevation: 10,
      shadowColor: Colors.black.withValues(alpha: 0.12),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Total', style: _pp(size: 11, color: _muted, height: 1.1)),
                Text(
                  _lkr(total),
                  style: _pp(size: 17, weight: FontWeight.w800, height: 1.15),
                ),
              ],
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.lock_rounded, size: 12, color: _muted.withValues(alpha: 0.9)),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text(
                      'Secure checkout',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: _pp(size: 10, color: _muted, height: 1.1),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            ElevatedButton(
              onPressed: onCheckout,
              style: ElevatedButton.styleFrom(
                backgroundColor: BcColors.brand,
                foregroundColor: Colors.white,
                elevation: 0,
                minimumSize: const Size(0, 44),
                tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                visualDensity: VisualDensity.compact,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Continue',
                    style: _pp(size: 14, weight: FontWeight.w700, color: Colors.white, height: 1.1),
                  ),
                  const SizedBox(width: 4),
                  const Icon(Icons.arrow_forward_rounded, size: 18),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyCup extends StatelessWidget {
  final VoidCallback onShop;

  const _EmptyCup({required this.onShop});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Image.network(
              '${ApiConfig.assetBaseUrl}/mascots/sad-stitch-empty-cup.png',
              width: 120,
              height: 120,
              errorBuilder: (_, _, _) => const CupIcon(fillLevel: 0, size: CupIconSize.lg),
            ),
            const SizedBox(height: 16),
            Text('Your cup is empty', style: _pp(size: 20, weight: FontWeight.w800)),
            const SizedBox(height: 8),
            Text(
              'Add a drink from the menu to fill your cup.',
              textAlign: TextAlign.center,
              style: _pp(size: 13, color: _muted),
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: onShop,
              child: const Text('Browse menu'),
            ),
          ],
        ),
      ),
    );
  }
}
