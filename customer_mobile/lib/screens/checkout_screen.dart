import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../models/active_promo.dart';
import '../models/checkout_payment_catalog.dart';
import '../providers/cart_provider.dart';
import '../providers/order_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/fulfillment_provider.dart';
import '../providers/loyalty_provider.dart';
import '../providers/spin_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/loyalty_utils.dart';
import '../utils/order_receipt_utils.dart';
import '../utils/checkout_fees.dart';
import '../widgets/checkout_offers_list.dart';
import '../widgets/checkout_points_redeem.dart';
import '../widgets/payhere_webview_modal.dart';
import '../config/api_config.dart';
import '../constants/payment_constants.dart';
import '../utils/app_toast.dart';
import '../services/notification_service.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  final _formKey = GlobalKey<FormState>();

  String _orderMode = 'TAKEAWAY';
  String? _selectedStoreId;
  String? _selectedDeliveryZoneId;
  String _paymentMethod = 'PAYHERE';

  final _addressLineController = TextEditingController();
  final _cityController = TextEditingController();
  final _districtController = TextEditingController();
  final _notesController = TextEditingController();
  final _promoController = TextEditingController();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _emailController = TextEditingController();

  List<dynamic> _stores = [];
  List<dynamic> _deliveryZones = [];
  List<ActivePromo> _offers = [];
  CheckoutPaymentCatalog _paymentCatalog = CheckoutPaymentCatalog.empty;
  bool _isLoadingStores = false;
  bool _isLoadingZones = false;
  bool _isLoadingOffers = false;
  bool _isLoadingPaymentMethods = false;
  bool _isPlacingOrder = false;
  bool _userDisabledRedeem = false;
  int? _usePointsRaw;
  bool _summaryExpanded = true;
  bool _autoAppliedSingleOffer = false;

  /// Pickup preset minutes, or null when custom schedule is selected.
  int? _pickupPresetMinutes = 45;
  DateTime? _customScheduledAt;

  @override
  void initState() {
    super.initState();
    final fulfillment = ref.read(fulfillmentProvider);
    _orderMode = fulfillment.orderMode ?? 'TAKEAWAY';
    _selectedStoreId = fulfillment.storeId;
    _selectedDeliveryZoneId = fulfillment.deliveryZoneId;
    _paymentMethod = 'PAYHERE';

    if (fulfillment.deliveryAddress != null) {
      final parts = fulfillment.deliveryAddress!.split(', ');
      if (parts.isNotEmpty) _addressLineController.text = parts[0];
      if (parts.length > 1) _cityController.text = parts[1];
      if (parts.length > 2) _districtController.text = parts[2];
    }

    final auth = ref.read(authProvider);
    if (auth.status == AuthStatus.authenticated && auth.user != null) {
      _nameController.text = auth.user!.name;
      _phoneController.text = auth.user!.phone;
      if (auth.user!.email != null) {
        _emailController.text = auth.user!.email!;
      }
    }

    _loadStores();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final sub = ref.read(cartProvider).subtotal;
      _loadPaymentMethods(subtotal: sub);
      _maybeApplySpinClaim();
    });
    ref.read(loyaltyProvider.notifier).fetchSummary();
  }

  Future<void> _maybeApplySpinClaim() async {
    final claim = ref.read(spinProvider).claim;
    if (claim == null || claim.isExpired) return;
    final current = ref.read(cartProvider).promoCode;
    if (current != null && current.isNotEmpty) {
      _promoController.text = current;
      return;
    }
    _promoController.text = claim.claimCode;
    await ref.read(cartProvider.notifier).applyPromoCode(claim.claimCode);
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _addressLineController.dispose();
    _cityController.dispose();
    _districtController.dispose();
    _notesController.dispose();
    _promoController.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  DateTime get _effectivePickupAt {
    if (_pickupPresetMinutes != null) {
      return DateTime.now().add(Duration(minutes: _pickupPresetMinutes!));
    }
    return _customScheduledAt ?? DateTime.now().add(const Duration(minutes: 45));
  }

  String get _pickupTimeLabel => DateFormat('h:mm a').format(_effectivePickupAt);

  Future<void> _loadStores() async {
    setState(() => _isLoadingStores = true);
    final api = ref.read(apiClientProvider);
    try {
      final data = await api.get<List<dynamic>>(
        '/stores',
        requireAuth: false,
        listParser: (list) => list,
      );
      setState(() {
        _stores = data;
        final hasStore = data.any((s) => s['id'] == _selectedStoreId);
        if (!hasStore && data.isNotEmpty) {
          _selectedStoreId = data[0]['id'] as String;
        }
        if (_selectedStoreId != null) {
          _loadDeliveryZones(_selectedStoreId!);
          _loadOffers(_selectedStoreId!);
        }
        _isLoadingStores = false;
      });
    } catch (_) {
      setState(() => _isLoadingStores = false);
    }
  }

  Future<void> _loadOffers(String storeId) async {
    setState(() => _isLoadingOffers = true);
    final api = ref.read(apiClientProvider);
    final cart = ref.read(cartProvider);
    final auth = ref.read(authProvider);
    try {
      final data = await api.post<Map<String, dynamic>>(
        '/promos/eligible',
        {
          'orderTotal': cart.subtotal,
          'orderMode': _orderMode,
          'storeId': storeId,
          'channel': 'APP',
          'cartItems': cart.items
              .map(
                (item) => {
                  'productId': item.product.id,
                  'quantity': item.quantity,
                  'unitPrice': item.unitPrice,
                },
              )
              .toList(),
        },
        requireAuth: auth.status == AuthStatus.authenticated,
        parser: (json) => json,
      );
      final rawOffers = [
        ...(data['autoApplyOffers'] as List<dynamic>? ?? []),
        ...(data['offers'] as List<dynamic>? ?? []),
      ];
      if (!mounted) return;
      final byCode = <String, ActivePromo>{};
      for (final item in rawOffers) {
        if (item is! Map<String, dynamic>) continue;
        final offer = ActivePromo.fromJson(item);
        if (offer.code.isEmpty) continue;
        byCode.putIfAbsent(offer.code, () => offer);
      }
      setState(() {
        _offers = byCode.values.toList();
        _isLoadingOffers = false;
      });
      _maybeAutoApplySingleOffer();
    } catch (_) {
      try {
        final data = await api.get<List<dynamic>>(
          '/promos?storeId=$storeId',
          requireAuth: false,
          listParser: (list) => list,
        );
        if (!mounted) return;
        setState(() {
          _offers = data
              .map((item) => ActivePromo.fromJson(item as Map<String, dynamic>))
              .where((offer) => offer.code.isNotEmpty)
              .toList();
          _isLoadingOffers = false;
        });
        _maybeAutoApplySingleOffer();
      } catch (_) {
        if (!mounted) return;
        setState(() {
          _offers = [];
          _isLoadingOffers = false;
        });
      }
    }
  }

  Future<void> _loadDeliveryZones(String storeId) async {
    setState(() => _isLoadingZones = true);
    final api = ref.read(apiClientProvider);
    try {
      final data = await api.get<List<dynamic>>(
        '/stores/$storeId',
        requireAuth: false,
        parser: (json) => json['deliveryZones'] as List<dynamic>? ?? [],
      );
      setState(() {
        _deliveryZones = data;
        final hasZone = data.any((z) => z['id'] == _selectedDeliveryZoneId);
        if (!hasZone && data.isNotEmpty) {
          _selectedDeliveryZoneId = data[0]['id'] as String;
        } else if (data.isEmpty) {
          _selectedDeliveryZoneId = null;
        }
        _isLoadingZones = false;
      });
    } catch (_) {
      setState(() => _isLoadingZones = false);
    }
  }

  Future<void> _loadPaymentMethods({required int subtotal}) async {
    setState(() => _isLoadingPaymentMethods = true);
    final api = ref.read(apiClientProvider);
    try {
      final data = await api.get<Map<String, dynamic>>(
        '/settings/payment-methods?orderMode=$_orderMode&orderSubtotal=$subtotal',
        requireAuth: false,
        parser: (json) => json,
      );
      if (!mounted) return;
      final catalog = CheckoutPaymentCatalog.fromJson(data);
      setState(() {
        _paymentCatalog = catalog;
        _isLoadingPaymentMethods = false;
        if (catalog.methods.isNotEmpty) {
          final stillValid = catalog.methods.any((m) => m.id == _paymentMethod);
          if (!stillValid) {
            _paymentMethod = catalog.methods.first.id;
          }
        }
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _paymentCatalog = CheckoutPaymentCatalog.empty;
        _isLoadingPaymentMethods = false;
      });
    }
  }

  /// Opens the admin-configured gateway (PayHere or WebXPay) checkout page.
  String _gatewayCheckoutUrl(String orderNumber, {String? paymentUrl}) {
    final origin = Uri.encodeComponent(ApiConfig.frontendUrl);
    final gateway = _paymentCatalog.activeOnlineGateway;
    if (gateway == 'WEBXPAY') {
      if (paymentUrl != null && paymentUrl.isNotEmpty) return paymentUrl;
      return '${ApiConfig.baseUrl}/payments/webxpay/$orderNumber?returnOrigin=$origin';
    }
    // Prefer server-rendered PayHere page so merchant credentials come from Admin → Settings.
    return '${ApiConfig.baseUrl}/payments/payhere/$orderNumber?returnOrigin=$origin';
  }

  Future<void> _applyOffer(ActivePromo offer, {bool silent = false}) async {
    _promoController.text = offer.code;
    final success = await ref.read(cartProvider.notifier).applyPromoCode(offer.code);
    if (!mounted) return;
    if (!silent) {
      showAppToast(
        context,
        success ? 'Offer applied!' : 'Could not apply this offer',
        isError: !success,
      );
    }
    if (success) setState(() {});
  }

  void _maybeAutoApplySingleOffer() {
    if (_autoAppliedSingleOffer) return;
    final current = ref.read(cartProvider).promoCode;
    if (current != null && current.isNotEmpty) return;

    final signedIn = ref.read(authProvider).status == AuthStatus.authenticated;
    ActivePromo? candidate;
    if (signedIn) {
      for (final offer in _offers) {
        if (offer.isLoyaltyCampaignOffer) {
          candidate = offer;
          break;
        }
      }
    }
    candidate ??= _offers.length == 1 ? _offers.first : null;
    if (candidate == null) return;
    if (candidate.isLoyaltyCampaignOffer && !signedIn) return;

    _autoAppliedSingleOffer = true;
    _applyOffer(candidate, silent: true).then((_) {
      if (!mounted) return;
      final applied = ref.read(cartProvider).promoCode;
      if (applied == null || applied.isEmpty) {
        _autoAppliedSingleOffer = false;
      }
    });
  }

  void _removeAppliedOffer() {
    ref.read(cartProvider.notifier).clearPromo();
    _promoController.clear();
    setState(() {});
  }

  Future<void> _applyPromoInput() async {
    final code = _promoController.text.trim();
    if (code.isEmpty) return;
    final success = await ref.read(cartProvider.notifier).applyPromoCode(code);
    if (!mounted) return;
    showAppToast(
      context,
      success ? 'Promo code applied!' : 'Invalid promo code',
      isError: !success,
    );
    if (success) setState(() {});
  }

  Future<void> _pickCustomSchedule() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(
        DateTime.now().add(const Duration(minutes: 45)),
      ),
    );
    if (picked == null) return;
    final now = DateTime.now();
    var scheduled = DateTime(now.year, now.month, now.day, picked.hour, picked.minute);
    if (!scheduled.isAfter(now.add(const Duration(minutes: 10)))) {
      scheduled = scheduled.add(const Duration(days: 1));
    }
    setState(() {
      _pickupPresetMinutes = null;
      _customScheduledAt = scheduled;
    });
  }

  Future<void> _handleSubmitOrder() async {
    if (!_formKey.currentState!.validate()) return;

    if (_orderMode == 'DELIVERY' && _selectedDeliveryZoneId == null) {
      showAppToast(context, 'No delivery zones available for this store', isError: true);
      return;
    }

    setState(() => _isPlacingOrder = true);

    final auth = ref.read(authProvider);
    if (auth.status != AuthStatus.authenticated) {
      final name = _nameController.text.trim();
      final phone = _phoneController.text.trim().replaceAll(RegExp(r'\s+'), '');
      final email = _emailController.text.trim().isNotEmpty ? _emailController.text.trim() : null;

      final success = await ref.read(authProvider.notifier).loginOrRegisterWithPhone(
            name,
            phone,
            email: email,
          );

      if (!success) {
        setState(() => _isPlacingOrder = false);
        if (mounted) {
          final error = ref.read(authProvider).errorMessage ?? 'Login / registration failed';
          showAppToast(context, error, isError: true);
        }
        return;
      }
    }

    final fulfillment = ref.read(fulfillmentProvider);
    Map<String, dynamic>? deliveryAddressJson;
    if (_orderMode == 'DELIVERY') {
      deliveryAddressJson = {
        'addressLine': _addressLineController.text.trim(),
        'city': _cityController.text.trim(),
        'district': _districtController.text.trim(),
        'lat': fulfillment.lat ?? 6.9271,
        'lng': fulfillment.lng ?? 79.8612,
      };
    }

    final cartState = ref.read(cartProvider);
    final effectivePaymentMethod = _getEffectivePaymentMethod(cartState);
    final usePoints = _resolvedUsePoints(cartState);

    final isTakeaway = _orderMode == 'TAKEAWAY';
    final scheduledAt = isTakeaway ? _effectivePickupAt.toUtc().toIso8601String() : null;
    final scheduleMode = isTakeaway
        ? (_pickupPresetMinutes ?? 'custom')
        : null;
    final pickupTime = isTakeaway ? _pickupTimeLabel : null;

    final result = await ref.read(orderProvider.notifier).placeOrder(
          orderMode: _orderMode,
          storeId: _selectedStoreId ?? '',
          deliveryZoneId: _orderMode == 'DELIVERY' ? _selectedDeliveryZoneId : null,
          deliveryAddress: deliveryAddressJson,
          paymentMethod: effectivePaymentMethod,
          promoCode: _promoController.text.trim().isNotEmpty ? _promoController.text.trim() : null,
          usePoints: usePoints > 0 ? usePoints : null,
          notes: _notesController.text.trim().isNotEmpty ? _notesController.text.trim() : null,
          pickupTime: pickupTime,
          scheduledAt: scheduledAt,
          scheduleMode: scheduleMode,
          frontendOrigin: ApiConfig.frontendUrl,
          items: cartState.items,
        );

    setState(() => _isPlacingOrder = false);

    if (result != null) {
      final returnedUrl = result['paymentUrl'] as String?;
      final order = ref.read(orderProvider).activeOrder;
      PaymentResult? paymentResult;
      final isOnline = effectivePaymentMethod == 'PAYHERE' ||
          effectivePaymentMethod == 'CARD' ||
          (returnedUrl != null && returnedUrl.isNotEmpty);

      if (isOnline && order != null) {
        if (!_paymentCatalog.onlineGatewayConfigured) {
          if (mounted) {
            showAppToast(
              context,
              'Online payment is not configured yet. Please contact support or try again later.',
              isError: true,
            );
          }
          return;
        }
        final paymentUrl = _gatewayCheckoutUrl(
          order.orderNumber,
          paymentUrl: returnedUrl,
        );
        if (mounted) {
          paymentResult = await PayHereWebViewModal.show(context, paymentUrl);
        }
      }

      if (isOnline && paymentResult != PaymentResult.success) {
        if (mounted) {
          showAppToast(context, 'Payment was not completed. You can retry checkout.', isError: true);
        }
        return;
      }

      await ref.read(cartProvider.notifier).clearCart();

      if (mounted) {
        final placed = ref.read(orderProvider).activeOrder;
        if (placed != null) {
          await NotificationService.instance.showOrderPlaced(
            orderId: placed.id,
            orderNumber: placed.orderNumber,
            orderMode: placed.orderMode,
          );
          context.replace('/track/${placed.id}');
        } else {
          context.go('/home');
        }
      }
    } else if (mounted) {
      final error = ref.read(orderProvider).errorMessage ?? 'Checkout failed';
      showAppToast(context, error, isError: true);
    }
  }

  String get _selectedStoreName {
    if (_selectedStoreId == null) return 'Select a branch';
    for (final store in _stores) {
      if (store is Map && store['id'] == _selectedStoreId) {
        return (store['name'] as String?) ?? 'Branch';
      }
    }
    return 'Select a branch';
  }

  @override
  Widget build(BuildContext context) {
    final cartState = ref.watch(cartProvider);
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom + 12;
    final isTakeaway = _orderMode == 'TAKEAWAY';
    final modeLabel = isTakeaway ? 'Takeaway' : 'Delivery';

    return Scaffold(
      backgroundColor: bc.pageBg,
      appBar: AppBar(
        backgroundColor: bc.pageBg,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        leading: IconButton(
          onPressed: () => Navigator.of(context).maybePop(),
          icon: Icon(Icons.arrow_back_ios_new_rounded, color: onSurface, size: 20),
        ),
        titleSpacing: 0,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Checkout',
              style: TextStyle(
                color: onSurface,
                fontWeight: FontWeight.w800,
                fontSize: 22,
              ),
            ),
            Text(
              modeLabel,
              style: TextStyle(color: bc.mutedText, fontSize: 13, fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
      body: _isLoadingStores
          ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
          : Column(
              children: [
                Expanded(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          _buildStep(
                            number: 1,
                            title: isTakeaway ? 'Pickup Store' : 'Delivery Address',
                            child: isTakeaway
                                ? _buildPickupStoreCard(bc, onSurface, cartState)
                                : _buildDeliverySection(bc, onSurface, cartState),
                          ),
                          if (isTakeaway) ...[
                            const SizedBox(height: 20),
                            _buildStep(
                              number: 2,
                              title: 'Pickup Time',
                              child: _buildPickupTimeSection(bc, onSurface),
                            ),
                          ],
                          const SizedBox(height: 20),
                          _buildStep(
                            number: isTakeaway ? 3 : 2,
                            title: 'Contact Details',
                            child: _buildContactSection(bc, onSurface),
                          ),
                          const SizedBox(height: 20),
                          _buildStep(
                            number: isTakeaway ? 4 : 3,
                            title: 'Payment',
                            child: _buildPaymentSection(bc, onSurface, cartState),
                          ),
                          const SizedBox(height: 24),
                          _buildOrderSummary(bc, onSurface, cartState),
                          const SizedBox(height: 20),
                          CheckoutOffersList(
                            offers: _offers,
                            isLoading: _isLoadingOffers,
                            appliedCode: cartState.promoCode,
                            subtotal: cartState.subtotal,
                            onApply: (offer) => _applyOffer(offer),
                            onRemoveApplied: _removeAppliedOffer,
                          ),
                          if (cartState.promoCode == null || cartState.promoCode!.isEmpty) ...[
                            const SizedBox(height: 8),
                            _buildPromoInput(bc, onSurface),
                          ],
                          const SizedBox(height: 16),
                          _buildLoyaltySection(cartState),
                          const SizedBox(height: 20),
                          Text(
                            'Fulfillment Notes (Optional)',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: onSurface,
                            ),
                          ),
                          const SizedBox(height: 10),
                          TextFormField(
                            controller: _notesController,
                            maxLines: 3,
                            style: TextStyle(color: onSurface),
                            decoration: InputDecoration(
                              hintText: 'e.g. ring bell, extra straw...',
                              hintStyle: TextStyle(color: bc.mutedText),
                              filled: true,
                              fillColor: bc.cardBg,
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: BorderSide(color: bc.border),
                              ),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(14),
                                borderSide: BorderSide(color: bc.border),
                              ),
                            ),
                          ),
                          SizedBox(height: 120 + bottomInset),
                        ],
                      ),
                    ),
                  ),
                ),
                _buildStickyBar(context, cartState, bottomInset),
              ],
            ),
    );
  }

  Widget _buildStep({
    required int number,
    required String title,
    required Widget child,
  }) {
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Container(
              width: 28,
              height: 28,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: BcColors.brand,
                shape: BoxShape.circle,
              ),
              child: Text(
                '$number',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w800,
                  fontSize: 13,
                ),
              ),
            ),
            const SizedBox(width: 10),
            Text(
              title,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w800,
                color: onSurface,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        child,
      ],
    );
  }

  Widget _buildPickupStoreCard(BcAdaptive bc, Color onSurface, CartState cartState) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildOrderModeToggle(cartState),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: BcColors.brand.withValues(alpha: 0.08),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: BcColors.brand.withValues(alpha: 0.2)),
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
                child: const Icon(Icons.storefront_rounded, color: BcColors.brand, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'YOUR BRANCH',
                      style: TextStyle(
                        color: BcColors.brand,
                        fontSize: 10,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 0.6,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      _selectedStoreName,
                      style: TextStyle(
                        fontWeight: FontWeight.w800,
                        fontSize: 15,
                        color: onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Selected when you started your order.',
                      style: TextStyle(color: bc.mutedText, fontSize: 12),
                    ),
                  ],
                ),
              ),
              TextButton(
                onPressed: () => _openFulfillmentSetup('TAKEAWAY'),
                style: TextButton.styleFrom(
                  foregroundColor: BcColors.brand,
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  minimumSize: Size.zero,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                ),
                child: const Text('Change'),
              ),
            ],
          ),
        ),
        if (_stores.length > 1) ...[
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            value: _selectedStoreId,
            dropdownColor: bc.cardBg,
            decoration: InputDecoration(
              filled: true,
              fillColor: bc.cardBg,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: bc.border),
              ),
            ),
            items: _stores.map((store) {
              return DropdownMenuItem<String>(
                value: store['id'] as String,
                child: Text(store['name'] as String),
              );
            }).toList(),
            onChanged: (val) {
              if (val == null) return;
              setState(() => _selectedStoreId = val);
              _loadDeliveryZones(val);
              _loadOffers(val);
              String? name;
              for (final store in _stores) {
                if (store is Map && store['id'] == val) {
                  name = store['name'] as String?;
                  break;
                }
              }
              if (name != null) {
                ref.read(fulfillmentProvider.notifier).setTakeaway(val, name);
              }
            },
          ),
        ],
        const SizedBox(height: 10),
        Row(
          children: [
            Icon(Icons.location_on_outlined, size: 16, color: BcColors.brand.withValues(alpha: 0.9)),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                'Pick up from this branch when your order is ready.',
                style: TextStyle(color: bc.mutedText, fontSize: 12),
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildDeliverySection(BcAdaptive bc, Color onSurface, CartState cartState) {
    final fulfillment = ref.watch(fulfillmentProvider);
    final hasSavedDelivery = (fulfillment.deliveryAddress ?? '').trim().isNotEmpty &&
        fulfillment.lat != null &&
        fulfillment.lng != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildOrderModeToggle(cartState),
        const SizedBox(height: 12),
        if (hasSavedDelivery) ...[
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: BcColors.brand.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: BcColors.brand.withValues(alpha: 0.2)),
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
                  child: const Icon(Icons.local_shipping_rounded, color: BcColors.brand, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        'DELIVERING TO',
                        style: TextStyle(
                          color: BcColors.brand,
                          fontSize: 10,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.6,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        fulfillment.deliveryAddress ?? _addressLineController.text,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          fontSize: 14,
                          color: onSurface,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        [
                          if ((fulfillment.storeName ?? '').isNotEmpty) fulfillment.storeName,
                          if (fulfillment.deliveryFee > 0) 'Fee LKR ${fulfillment.deliveryFee}',
                        ].whereType<String>().join(' · '),
                        style: TextStyle(color: bc.mutedText, fontSize: 12),
                      ),
                    ],
                  ),
                ),
                TextButton(
                  onPressed: () => _openFulfillmentSetup('DELIVERY'),
                  style: TextButton.styleFrom(
                    foregroundColor: BcColors.brand,
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 13),
                  ),
                  child: const Text('Change'),
                ),
              ],
            ),
          ),
        ] else ...[
          OutlinedButton.icon(
            onPressed: () => _openFulfillmentSetup('DELIVERY'),
            icon: const Icon(Icons.add_location_alt_outlined, size: 18),
            label: const Text('Set delivery address'),
            style: OutlinedButton.styleFrom(
              foregroundColor: BcColors.brand,
              side: const BorderSide(color: BcColors.brand),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _selectedStoreId,
            dropdownColor: bc.cardBg,
            decoration: const InputDecoration(labelText: 'Branch'),
            items: _stores.map((store) {
              return DropdownMenuItem<String>(
                value: store['id'] as String,
                child: Text(store['name'] as String),
              );
            }).toList(),
            onChanged: (val) {
              if (val == null) return;
              setState(() => _selectedStoreId = val);
              _loadDeliveryZones(val);
              _loadOffers(val);
            },
          ),
          const SizedBox(height: 12),
          _isLoadingZones
              ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
              : DropdownButtonFormField<String>(
                  value: _selectedDeliveryZoneId,
                  dropdownColor: bc.cardBg,
                  hint: const Text('Select your zone'),
                  items: _deliveryZones.map((zone) {
                    return DropdownMenuItem<String>(
                      value: zone['id'] as String,
                      child: Text("${zone['name']} (Fee: LKR ${zone['fee']})"),
                    );
                  }).toList(),
                  onChanged: (val) {
                    if (val != null) setState(() => _selectedDeliveryZoneId = val);
                  },
                ),
          const SizedBox(height: 12),
          TextFormField(
            controller: _addressLineController,
            style: TextStyle(color: onSurface),
            decoration: const InputDecoration(labelText: 'Address Line 1'),
            validator: (v) =>
                _orderMode == 'DELIVERY' && (v == null || v.trim().isEmpty)
                    ? 'Address is required'
                    : null,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  controller: _cityController,
                  style: TextStyle(color: onSurface),
                  decoration: const InputDecoration(labelText: 'City'),
                  validator: (v) =>
                      _orderMode == 'DELIVERY' && (v == null || v.trim().isEmpty)
                          ? 'City is required'
                          : null,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: TextFormField(
                  controller: _districtController,
                  style: TextStyle(color: onSurface),
                  decoration: const InputDecoration(labelText: 'District'),
                  validator: (v) =>
                      _orderMode == 'DELIVERY' && (v == null || v.trim().isEmpty)
                          ? 'District is required'
                          : null,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _buildOrderModeToggle(CartState cart) {
    return Row(
      children: [
        Expanded(child: _modeChip('TAKEAWAY', 'Pickup', Icons.storefront, cart)),
        const SizedBox(width: 10),
        Expanded(child: _modeChip('DELIVERY', 'Delivery', Icons.local_shipping, cart)),
      ],
    );
  }

  Future<void> _openFulfillmentSetup(String mode) async {
    await context.push('/fulfillment-setup?mode=$mode');
    if (!mounted) return;
    _syncFromFulfillment();
  }

  void _syncFromFulfillment() {
    final fulfillment = ref.read(fulfillmentProvider);
    setState(() {
      _orderMode = fulfillment.orderMode ?? _orderMode;
      _selectedStoreId = fulfillment.storeId ?? _selectedStoreId;
      _selectedDeliveryZoneId = fulfillment.deliveryZoneId ?? _selectedDeliveryZoneId;
      if (fulfillment.deliveryAddress != null && fulfillment.deliveryAddress!.isNotEmpty) {
        final parts = fulfillment.deliveryAddress!.split(', ');
        if (parts.isNotEmpty) _addressLineController.text = parts[0];
        if (parts.length > 1) _cityController.text = parts[1];
        if (parts.length > 2) _districtController.text = parts[2];
      }
      _paymentMethod = 'PAYHERE';
    });
    final cart = ref.read(cartProvider);
    _loadPaymentMethods(subtotal: cart.subtotal);
    if (_selectedStoreId != null) {
      _loadOffers(_selectedStoreId!);
      if (_orderMode == 'DELIVERY') _loadDeliveryZones(_selectedStoreId!);
    }
  }

  Widget _modeChip(String mode, String label, IconData icon, CartState cart) {
    final selected = _orderMode == mode;
    final bc = context.bc;
    return OutlinedButton.icon(
      onPressed: () => _setOrderMode(mode, cart),
      icon: Icon(icon, size: 16, color: selected ? BcColors.brand : bc.mutedText),
      label: Text(
        label,
        style: TextStyle(
          color: selected ? BcColors.brand : bc.mutedText,
          fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          fontSize: 12,
        ),
      ),
      style: OutlinedButton.styleFrom(
        backgroundColor: selected ? BcColors.brandSubtle : Colors.transparent,
        side: BorderSide(color: selected ? BcColors.brand : bc.border),
        padding: const EdgeInsets.symmetric(vertical: 10),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }

  Future<void> _setOrderMode(String mode, CartState cart) async {
    if (_orderMode == mode) return;

    if (mode == 'DELIVERY') {
      final fulfillment = ref.read(fulfillmentProvider);
      final hasAddress = (fulfillment.deliveryAddress ?? '').trim().isNotEmpty &&
          fulfillment.lat != null &&
          fulfillment.lng != null;
      if (!hasAddress) {
        await _openFulfillmentSetup('DELIVERY');
        return;
      }
      setState(() {
        _orderMode = 'DELIVERY';
        _selectedStoreId = fulfillment.storeId ?? _selectedStoreId;
        _selectedDeliveryZoneId = fulfillment.deliveryZoneId ?? _selectedDeliveryZoneId;
        _paymentMethod = 'PAYHERE';
        final parts = fulfillment.deliveryAddress!.split(', ');
        if (parts.isNotEmpty) _addressLineController.text = parts[0];
        if (parts.length > 1) _cityController.text = parts[1];
        if (parts.length > 2) _districtController.text = parts[2];
      });
    } else {
      setState(() {
        _orderMode = 'TAKEAWAY';
        _paymentMethod = 'PAYHERE';
      });
      final storeId = _selectedStoreId;
      final storeName = _selectedStoreName;
      if (storeId != null && storeName.isNotEmpty && storeName != 'Select a branch') {
        await ref.read(fulfillmentProvider.notifier).setTakeaway(storeId, storeName);
      }
    }

    if (_selectedStoreId != null) _loadOffers(_selectedStoreId!);
    _loadPaymentMethods(subtotal: cart.subtotal);
  }

  Widget _buildPickupTimeSection(BcAdaptive bc, Color onSurface) {
    final chips = <({String label, int? minutes, bool schedule})>[
      (label: '15 min', minutes: 15, schedule: false),
      (label: '30 min', minutes: 30, schedule: false),
      (label: '45 min', minutes: 45, schedule: false),
      (label: 'Schedule', minutes: null, schedule: true),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final chip in chips)
              _TimeChip(
                label: chip.schedule && _pickupPresetMinutes == null && _customScheduledAt != null
                    ? DateFormat('h:mm a').format(_customScheduledAt!)
                    : chip.label,
                selected: chip.schedule
                    ? _pickupPresetMinutes == null
                    : _pickupPresetMinutes == chip.minutes,
                onTap: () {
                  if (chip.schedule) {
                    _pickCustomSchedule();
                  } else {
                    setState(() {
                      _pickupPresetMinutes = chip.minutes;
                      _customScheduledAt = null;
                    });
                  }
                },
              ),
          ],
        ),
        const SizedBox(height: 10),
        Text.rich(
          TextSpan(
            style: TextStyle(color: bc.mutedText, fontSize: 13),
            children: [
              const TextSpan(text: 'Selected time: '),
              TextSpan(
                text: _pickupTimeLabel,
                style: TextStyle(fontWeight: FontWeight.w800, color: onSurface),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildContactSection(BcAdaptive bc, Color onSurface) {
    final auth = ref.watch(authProvider);
    if (auth.status == AuthStatus.authenticated && auth.user != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: bc.cardBg,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: bc.border),
            ),
            child: Row(
              children: [
                Icon(Icons.person_outline_rounded, color: BcColors.brand.withValues(alpha: 0.9)),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        auth.user!.name,
                        style: TextStyle(fontWeight: FontWeight.w800, color: onSurface),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(Icons.phone_outlined, size: 14, color: bc.mutedText),
                          const SizedBox(width: 4),
                          Text(
                            auth.user!.phone,
                            style: TextStyle(color: bc.mutedText, fontSize: 13),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.check_circle, color: BcColors.success, size: 20),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text.rich(
            TextSpan(
              style: TextStyle(color: bc.mutedText, fontSize: 12),
              children: [
                const TextSpan(text: 'Signed in — your orders appear in '),
                WidgetSpan(
                  alignment: PlaceholderAlignment.baseline,
                  baseline: TextBaseline.alphabetic,
                  child: GestureDetector(
                    onTap: () => context.push('/orders'),
                    child: const Text(
                      'order history',
                      style: TextStyle(
                        color: BcColors.brand,
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
                const TextSpan(text: '.'),
              ],
            ),
          ),
        ],
      );
    }

    return Column(
      children: [
        TextFormField(
          controller: _nameController,
          style: TextStyle(color: onSurface),
          decoration: const InputDecoration(labelText: 'Full Name *'),
          validator: (v) => v == null || v.trim().isEmpty ? 'Full name is required' : null,
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          style: TextStyle(color: onSurface),
          decoration: const InputDecoration(labelText: 'Mobile Number *'),
          validator: (v) {
            if (v == null || v.trim().isEmpty) return 'Mobile number is required';
            final cleaned = v.replaceAll(RegExp(r'\s+'), '');
            if (cleaned.length < 9) return 'Please enter a valid mobile number';
            return null;
          },
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          style: TextStyle(color: onSurface),
          decoration: const InputDecoration(labelText: 'Email Address (Optional)'),
        ),
        const SizedBox(height: 6),
        Align(
          alignment: Alignment.centerLeft,
          child: Text(
            'Your mobile number creates a Bing Chun account automatically when you place the order.',
            style: TextStyle(color: bc.mutedText, fontSize: 11),
          ),
        ),
      ],
    );
  }

  Widget _buildPaymentSection(BcAdaptive bc, Color onSurface, CartState cartState) {
    final options = _buildPaymentOptions(cartState);
    final selected = _getEffectivePaymentMethod(cartState);
    final threshold = _paymentCatalog.pickupOnlinePaymentThreshold > 0
        ? _paymentCatalog.pickupOnlinePaymentThreshold
        : pickupOnlinePaymentThreshold;
    final forceOnline =
        _orderMode == 'TAKEAWAY' && cartState.subtotal >= threshold;
    final gatewayLabel =
        _paymentCatalog.activeOnlineGateway == 'WEBXPAY' ? 'WebXPay' : 'PayHere';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (forceOnline) ...[
          Text(
            'Pickup orders of LKR ${NumberFormat('#,##0').format(threshold)} or more must be paid online.',
            style: TextStyle(color: bc.mutedText, fontSize: 12),
          ),
          const SizedBox(height: 10),
        ],
        if (_isLoadingPaymentMethods)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(
              child: SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2, color: BcColors.brand),
              ),
            ),
          )
        else if (options.isEmpty)
          Text(
            _paymentCatalog.onlineGatewayConfigured
                ? 'No payment methods available for this order.'
                : 'Online payment is not configured yet. Please try again later.',
            style: TextStyle(color: bc.mutedText, fontSize: 13),
          )
        else ...[
          for (final opt in options) ...[
            _PaymentOptionCard(
              label: opt['label']!,
              selected: selected == opt['value'],
              onTap: () => setState(() => _paymentMethod = opt['value']!),
            ),
            const SizedBox(height: 8),
          ],
          Text(
            selected == 'PAYHERE' || selected == 'CARD'
                ? "You'll complete payment securely via $gatewayLabel after placing your order."
                : 'Pay at the counter when you pick up.',
            style: TextStyle(color: bc.mutedText, fontSize: 12),
          ),
        ],
      ],
    );
  }

  Widget _buildOrderSummary(BcAdaptive bc, Color onSurface, CartState cartState) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        InkWell(
          onTap: () => setState(() => _summaryExpanded = !_summaryExpanded),
          borderRadius: BorderRadius.circular(8),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    'Order Summary',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: onSurface,
                    ),
                  ),
                ),
                Icon(
                  _summaryExpanded ? Icons.keyboard_arrow_up : Icons.keyboard_arrow_down,
                  color: bc.mutedText,
                ),
              ],
            ),
          ),
        ),
        if (_summaryExpanded) ...[
          const SizedBox(height: 8),
          for (final item in cartState.items)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Text(
                      '${item.product.name} × ${item.quantity}',
                      style: TextStyle(color: bc.mutedText, fontSize: 13),
                    ),
                  ),
                  Text(
                    formatMoney(item.totalPrice),
                    style: TextStyle(color: onSurface, fontSize: 13, fontWeight: FontWeight.w600),
                  ),
                ],
              ),
            ),
          const SizedBox(height: 4),
          _summaryRow('Subtotal', formatMoney(cartState.subtotal), bc, onSurface),
          if (_showWaivedPickupConvenienceFee(cartState))
            _summaryRow(
              formatConvenienceFeeLabel(_orderMode, _feeRates),
              formatMoney(_displayConvenienceFee(cartState)),
              bc,
              bc.mutedText,
              strikethrough: true,
            )
          else if (_chargedConvenienceFee(cartState) > 0)
            _summaryRow(
              formatConvenienceFeeLabel(_orderMode, _feeRates),
              formatMoney(_chargedConvenienceFee(cartState)),
              bc,
              onSurface,
            ),
          if (cartState.discount > 0)
            _summaryRow(
              'Discount',
              '- ${formatMoney(cartState.discount)}',
              bc,
              BcColors.success,
            ),
          if (_loyaltyDiscount(cartState) > 0)
            _summaryRow(
              'Points',
              '- ${formatMoney(_loyaltyDiscount(cartState))}',
              bc,
              BcColors.brand,
            ),
          if (_orderMode == 'DELIVERY' && _getDeliveryFee() > 0)
            _summaryRow('Delivery', formatMoney(_getDeliveryFee()), bc, onSurface),
          const SizedBox(height: 6),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                'Total',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: onSurface),
              ),
              Text(
                formatMoney(_calculateFinalTotal(cartState)),
                style: const TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 18,
                  color: BcColors.brand,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _summaryRow(
    String label,
    String value,
    BcAdaptive bc,
    Color valueColor, {
    bool strikethrough = false,
  }) {
    final decoration = strikethrough ? TextDecoration.lineThrough : TextDecoration.none;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                color: bc.mutedText,
                fontSize: 13,
                decoration: decoration,
                decorationColor: bc.mutedText,
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              color: valueColor,
              fontSize: 13,
              fontWeight: FontWeight.w600,
              decoration: decoration,
              decorationColor: valueColor,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPromoInput(BcAdaptive bc, Color onSurface) {
    return Row(
      children: [
        Expanded(
          child: TextFormField(
            controller: _promoController,
            style: TextStyle(color: onSurface),
            decoration: InputDecoration(
              hintText: 'Enter promo code',
              hintStyle: TextStyle(color: bc.mutedText),
              prefixIcon: const Icon(Icons.diamond_outlined, color: BcColors.brand, size: 18),
              filled: true,
              fillColor: bc.cardBg,
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: bc.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(14),
                borderSide: BorderSide(color: bc.border),
              ),
            ),
          ),
        ),
        const SizedBox(width: 10),
        TextButton(
          onPressed: _applyPromoInput,
          style: TextButton.styleFrom(
            foregroundColor: BcColors.brand,
            textStyle: const TextStyle(fontWeight: FontWeight.w800, fontSize: 14),
          ),
          child: const Text('Apply'),
        ),
      ],
    );
  }

  Widget _buildStickyBar(BuildContext context, CartState cartState, double bottomInset) {
    final bc = context.bc;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final panelColor = isDark ? BcColors.navyCard : Colors.white;
    final total = _calculateFinalTotal(cartState);
    final method = _getEffectivePaymentMethod(cartState);
    final payOnline = method == 'PAYHERE' || method == 'CARD';
    final cta = _orderMode == 'TAKEAWAY'
        ? (payOnline ? 'Pay & Place Pickup Order' : 'Place Pickup Order')
        : (payOnline ? 'Pay & Place Delivery Order' : 'Place Delivery Order');

    return Material(
      color: panelColor,
      elevation: 8,
      shadowColor: Colors.black.withValues(alpha: 0.12),
      child: Container(
        decoration: BoxDecoration(
          border: Border(top: BorderSide(color: bc.border)),
        ),
        padding: EdgeInsets.fromLTRB(16, 12, 16, bottomInset),
        child: Row(
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('Cup subtotal', style: TextStyle(color: bc.mutedText, fontSize: 13)),
                Text(
                  formatMoney(total),
                  style: const TextStyle(
                    color: BcColors.brand,
                    fontWeight: FontWeight.w900,
                    fontSize: 18,
                  ),
                ),
              ],
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.lock_outline, size: 12, color: bc.mutedText),
                      const SizedBox(width: 4),
                      Text(
                        'Secured checkout',
                        style: TextStyle(color: bc.mutedText, fontSize: 10),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _isPlacingOrder ? null : _handleSubmitOrder,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: BcColors.brand,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                      ),
                      child: _isPlacingOrder
                          ? const SizedBox(
                              height: 18,
                              width: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : Text(
                              cta,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                fontWeight: FontWeight.w800,
                                fontSize: 13,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  List<Map<String, String>> _buildPaymentOptions(CartState cart) {
    if (_paymentCatalog.methods.isNotEmpty) {
      return _paymentCatalog.methods
          .map((m) => {'value': m.id, 'label': m.label})
          .toList();
    }
    // Fallback when settings API is unreachable — still prefer online gateway.
    if (_orderMode == 'TAKEAWAY' && !requiresOnlinePaymentForPickup(cart.subtotal)) {
      return [
        {'value': 'CASH_AT_COUNTER', 'label': 'Cash at Counter'},
        {'value': 'PAYHERE', 'label': 'Pay Online'},
      ];
    }
    return [
      {'value': 'PAYHERE', 'label': 'Pay Online'},
    ];
  }

  String _getEffectivePaymentMethod(CartState cart) {
    final options = _buildPaymentOptions(cart);
    if (options.isEmpty) return _paymentMethod;
    final hasCurrentOption = options.any((opt) => opt['value'] == _paymentMethod);
    return hasCurrentOption ? _paymentMethod : options.first['value']!;
  }

  int _getDeliveryFee() {
    final fulfillment = ref.read(fulfillmentProvider);
    if (fulfillment.orderMode == 'DELIVERY' && fulfillment.deliveryFee > 0) {
      return fulfillment.deliveryFee;
    }
    if (_selectedDeliveryZoneId == null) return 0;
    final zone = _deliveryZones.firstWhere(
      (z) => z['id'] == _selectedDeliveryZoneId,
      orElse: () => null,
    );
    return zone != null ? (zone['fee'] as int? ?? 0) : 0;
  }

  ConvenienceFeeRates get _feeRates => _paymentCatalog.feeRates;

  String _paymentForFeePreview(CartState cart) {
    final selected = _getEffectivePaymentMethod(cart);
    if (selected.isNotEmpty) return selected;
    if (_orderMode == 'TAKEAWAY') {
      final options = _buildPaymentOptions(cart);
      final online = options.where((o) => o['value'] == 'PAYHERE' || o['value'] == 'CARD');
      if (online.isNotEmpty) return online.first['value']!;
      return options.isNotEmpty ? options.first['value']! : 'PAYHERE';
    }
    return selected;
  }

  int _displayConvenienceFee(CartState cart) {
    return computeCheckoutConvenienceFee(
      cart.subtotal,
      _orderMode,
      _paymentForFeePreview(cart),
      _feeRates,
    );
  }

  int _chargedConvenienceFee(CartState cart) {
    return chargedConvenienceFee(
      cart.subtotal,
      _orderMode,
      _getEffectivePaymentMethod(cart),
      _feeRates,
    );
  }

  bool _showWaivedPickupConvenienceFee(CartState cart) {
    if (_orderMode != 'TAKEAWAY') return false;
    final display = _displayConvenienceFee(cart);
    if (display <= 0) return false;
    final payment = _getEffectivePaymentMethod(cart);
    return payment.isEmpty || appliesConvenienceFee(_orderMode, payment);
  }

  /// Matches web: sub + delivery + chargedConvenience − discount.
  int _remainingBeforeLoyalty(CartState cart) {
    final total = cart.subtotal +
        (_orderMode == 'DELIVERY' ? _getDeliveryFee() : 0) +
        _chargedConvenienceFee(cart) -
        cart.discount;
    return total < 0 ? 0 : total;
  }

  CheckoutPointsRedeemResult _redeemCalc(CartState cart) {
    final loyalty = ref.read(loyaltyProvider).summary;
    final availablePoints = loyalty?.points ?? 0;
    final redeemValue = loyalty?.settings.redeemValue ?? 1.0;
    final remainingPayable = _remainingBeforeLoyalty(cart);
    final cap = calcCheckoutPointsRedeem(
      usePoints: 0,
      availablePoints: availablePoints,
      redeemValue: redeemValue,
      remainingPayable: remainingPayable,
    );
    final canRedeem = ref.read(authProvider).status == AuthStatus.authenticated &&
        (loyalty?.settings.checkoutRedeemEnabled ?? true) &&
        (loyalty?.checkoutRedeemUnlocked ??
            isCheckoutRedeemUnlocked(
              lifetimePointsEarned: loyalty?.lifetimePointsEarned ?? 0,
              minPointsToRedeem: loyalty?.settings.minPointsToRedeem ?? 100,
            )) &&
        cap.maxPoints > 0;
    final redeemEnabled = canRedeem && !_userDisabledRedeem;
    final requested = redeemEnabled ? (_usePointsRaw ?? cap.maxPoints) : 0;
    return calcCheckoutPointsRedeem(
      usePoints: canRedeem ? requested : 0,
      availablePoints: availablePoints,
      redeemValue: redeemValue,
      remainingPayable: remainingPayable,
    );
  }

  int _loyaltyDiscount(CartState cart) => _redeemCalc(cart).discountLkr;

  int _resolvedUsePoints(CartState cart) => _redeemCalc(cart).points;

  Widget _buildLoyaltySection(CartState cartState) {
    final auth = ref.watch(authProvider);
    final loyaltyState = ref.watch(loyaltyProvider);
    final summary = loyaltyState.summary;
    final redeemCalc = _redeemCalc(cartState);
    final earnPreview = estimateLoyaltyPointsEarned(
      _calculateFinalTotal(cartState),
      summary?.settings ?? const LoyaltySettings(),
    );

    final unlocked = summary?.checkoutRedeemUnlocked ??
        isCheckoutRedeemUnlocked(
          lifetimePointsEarned: summary?.lifetimePointsEarned ?? 0,
          minPointsToRedeem: summary?.settings.minPointsToRedeem ?? 100,
        );
    final minToUnlock = summary?.settings.minPointsToRedeem ?? 100;

    return CheckoutPointsRedeem(
      availablePoints: summary?.points ?? 0,
      maxPoints: redeemCalc.maxPoints,
      usePoints: redeemCalc.points,
      discountLkr: redeemCalc.discountLkr,
      enabled: !_userDisabledRedeem && redeemCalc.maxPoints > 0 && unlocked,
      signedIn: auth.status == AuthStatus.authenticated,
      earnPreview: earnPreview,
      blockedReason: unlocked
          ? null
          : 'Earn $minToUnlock points to unlock checkout redemption (${summary?.lifetimePointsEarned ?? 0}/$minToUnlock earned).',
      onEnabledChange: (enabled) {
        setState(() {
          _userDisabledRedeem = !enabled;
          if (enabled && _usePointsRaw == null) {
            _usePointsRaw = redeemCalc.maxPoints;
          }
        });
      },
      onPointsChange: (points) {
        setState(() => _usePointsRaw = points);
      },
    );
  }

  int _calculateFinalTotal(CartState cart) {
    final total = _remainingBeforeLoyalty(cart) - _loyaltyDiscount(cart);
    return total < 0 ? 0 : total;
  }
}

class _TimeChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _TimeChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected ? BcColors.brand : bc.border,
              width: selected ? 1.5 : 1,
            ),
            color: selected ? BcColors.brand.withValues(alpha: 0.06) : bc.cardBg,
          ),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? BcColors.brand : onSurface,
              fontWeight: selected ? FontWeight.w800 : FontWeight.w600,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }
}

class _PaymentOptionCard extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _PaymentOptionCard({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: bc.cardBg,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? BcColors.brand : bc.border,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: selected
                      ? BcColors.brand
                      : BcColors.brand.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  label.contains('Online') || label.contains('PayHere')
                      ? Icons.credit_card_rounded
                      : Icons.payments_outlined,
                  color: selected ? Colors.white : BcColors.brand,
                  size: 18,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 14,
                    color: onSurface,
                  ),
                ),
              ),
              Icon(
                selected ? Icons.check_circle : Icons.radio_button_unchecked,
                color: selected ? BcColors.brand : bc.mutedText,
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
