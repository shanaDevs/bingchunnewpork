import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../app/theme/app_colors.dart';
import '../../../../core/feedback/bc_feedback.dart';
import '../../../../core/utils/customer_name.dart';
import '../../../../core/utils/money.dart';
import '../../../../core/utils/phone.dart';
import '../../../../l10n/app_localizations.dart';
import '../../../../shared/widgets/bc_buttons.dart';
import '../../../../shared/widgets/bc_text_field.dart';
import '../../../../shared/widgets/dev_otp_hint.dart';
import '../../../../shared/widgets/empty_state.dart';
import '../../../../shared/widgets/loading_state.dart';
import '../../../auth/presentation/providers/session_provider.dart';
import '../../../cart/presentation/providers/cart_providers.dart';
import '../../../fulfillment/domain/entities/order_setup.dart';
import '../../../fulfillment/domain/order_schedule.dart';
import '../../../fulfillment/presentation/providers/fulfillment_providers.dart';
import '../../../fulfillment/presentation/views/order_mode_sheet.dart';
import '../../../fulfillment/presentation/widgets/online_ordering_closed_banner.dart';
import '../../../loyalty/domain/entities/loyalty_summary.dart';
import '../../../loyalty/presentation/providers/loyalty_providers.dart';
import '../../../spin/presentation/providers/spin_providers.dart';
import '../../../stores/domain/store_ordering_hours.dart';
import '../../domain/checkout_fees.dart';
import '../providers/checkout_providers.dart';
import '../states/checkout_state.dart';
import 'checkout_payment_screen.dart';

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _email;
  late final TextEditingController _otp;
  var _loadedKey = '';

  @override
  void initState() {
    super.initState();
    final user = ref.read(authSessionProvider).user;
    _name = TextEditingController(
      text: isPlaceholderCustomerName(user?.name) ? '' : (user?.name ?? ''),
    );
    _phone = TextEditingController(text: user?.phone ?? '');
    _email = TextEditingController(text: user?.email ?? '');
    _otp = TextEditingController();
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncMethods());
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _email.dispose();
    _otp.dispose();
    super.dispose();
  }

  void _syncMethods() {
    final setup = ref.read(orderSetupProvider);
    final cart = ref.read(cupProvider);
    final mode = setup.mode;
    if (mode == null || !setup.isComplete || cart.lines.isEmpty) return;
    final key = '$mode-${cart.subtotal}';
    if (key != _loadedKey) {
      _loadedKey = key;
      ref
          .read(checkoutNotifierProvider.notifier)
          .loadMethods(orderMode: mode, subtotal: cart.subtotal);
    }
    ref
        .read(checkoutNotifierProvider.notifier)
        .syncSpinReward(subtotal: cart.subtotal, orderMode: mode);
  }

  Future<void> _place() async {
    await BcFeedback.hfCheckout();
    final session = ref.read(authSessionProvider);
    final setup = ref.read(orderSetupProvider);
    final cart = ref.read(cupProvider);
    final checkout = ref.read(checkoutNotifierProvider);
    final spin = checkout.spinValidation;
    final promoOn = checkout.spinApplied && spin != null && spin.valid;
    final discount = promoOn ? spin.discount : 0;
    final deliveryFee = setup.isDelivery
        ? (promoOn && spin.freeDelivery ? 0 : setup.deliveryFee)
        : 0;
    final convenience = CheckoutFees.chargedConvenienceFee(
      subtotal: cart.subtotal,
      orderMode: setup.mode,
      paymentMethod: checkout.selectedMethodId,
      deliveryRate:
          checkout.catalog?.deliveryFeeRate ?? CheckoutFees.defaultDeliveryRate,
      pickupRate:
          checkout.catalog?.pickupFeeRate ?? CheckoutFees.defaultPickupRate,
    );
    final remaining = cart.subtotal + deliveryFee + convenience - discount;
    final loyalty = ref.read(loyaltySummaryProvider).valueOrNull;
    final outcome = await ref
        .read(checkoutNotifierProvider.notifier)
        .place(
          cart: cart,
          setup: setup,
          authenticated: session.isAuthenticated,
          name: _name.text,
          phone: _phone.text,
          accountName: session.user?.name,
          loyalty: loyalty,
          remainingPayable: remaining < 0 ? 0 : remaining,
        );
    if (!mounted) return;
    switch (outcome.kind) {
      case PlaceCheckoutKind.ignored:
        return;
      case PlaceCheckoutKind.loginRequired:
      case PlaceCheckoutKind.failed:
        await BcFeedback.hfError();
        final message = ref.read(checkoutNotifierProvider).errorMessage;
        if (message != null && context.mounted) {
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(message)));
        }
        return;
      case PlaceCheckoutKind.cash:
        await BcFeedback.hfSuccess();
        await ref.read(cupProvider.notifier).clear();
        if (!mounted) return;
        context.go(
          '/order/${Uri.encodeComponent(outcome.result!.orderNumber)}',
        );
        return;
      case PlaceCheckoutKind.online:
        final result = outcome.result!;
        if (result.paymentUrl == null || result.paymentUrl!.isEmpty) {
          await BcFeedback.hfError();
          if (!context.mounted) return;
          final message = AppLocalizations.of(context).paymentOpenFailed;
          ScaffoldMessenger.of(
            context,
          ).showSnackBar(SnackBar(content: Text(message)));
          return;
        }
        if (!mounted) return;
        context.push(
          '/checkout/pay',
          extra: CheckoutPaymentArgs(
            orderNumber: result.orderNumber,
            paymentUrl: result.paymentUrl!,
          ),
        );
        return;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = Theme.of(context).extension<BcColors>()!;
    final cart = ref.watch(cupProvider);
    final setup = ref.watch(orderSetupProvider);
    final session = ref.watch(authSessionProvider);
    final state = ref.watch(checkoutNotifierProvider);
    final phoneAuth = ref.watch(checkoutPhoneAuthProvider);

    ref.listen(authSessionProvider, (previous, next) {
      final user = next.user;
      if (user == null) return;
      _name.text = user.name;
      _phone.text = user.phone;
      if ((user.email ?? '').isNotEmpty) _email.text = user.email!;
      ref.read(checkoutPhoneAuthProvider.notifier).reset();
    });
    ref.listen(cupProvider, (previous, next) => _syncMethods());
    ref.listen(orderSetupProvider, (previous, next) => _syncMethods());
    ref.listen(spinClaimProvider, (previous, next) => _syncMethods());

    if (cart.lines.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: Text(l10n.checkoutTitle)),
        body: EmptyState(
          message: l10n.cupEmpty,
          actionLabel: l10n.browseMenu,
          onAction: () => context.go('/menu'),
        ),
      );
    }

    final methodId = state.selectedMethodId;
    final catalog = state.catalog;
    final convenience = CheckoutFees.chargedConvenienceFee(
      subtotal: cart.subtotal,
      orderMode: setup.mode,
      paymentMethod: methodId,
      deliveryRate:
          catalog?.deliveryFeeRate ?? CheckoutFees.defaultDeliveryRate,
      pickupRate: catalog?.pickupFeeRate ?? CheckoutFees.defaultPickupRate,
    );
    final spin = state.spinValidation;
    final promoOn = state.spinApplied && spin != null && spin.valid;
    final discount = promoOn ? spin.discount : 0;
    final freeDelivery = promoOn && spin.freeDelivery;
    final deliveryFee = setup.isDelivery
        ? (freeDelivery ? 0 : setup.deliveryFee)
        : 0;
    var total = cart.subtotal + deliveryFee + convenience - discount;
    if (total < 0) total = 0;
    final loyalty =
        ref.watch(loyaltySummaryProvider).valueOrNull ?? LoyaltySummary.guest;
    final remainingPayable = total;
    final redeem = calcCheckoutPointsRedeem(
      usePoints: state.redeemEnabled && loyalty.checkoutRedeemUnlocked
          ? (state.usePoints > 0 ? state.usePoints : loyalty.points)
          : 0,
      availablePoints: loyalty.points,
      remainingPayable: remainingPayable,
      redeemValue: loyalty.settings.redeemValue,
    );
    final pointsOff =
        state.redeemEnabled && loyalty.checkoutRedeemUnlocked ? redeem.discountLkr : 0;
    total = total - pointsOff;
    if (total < 0) total = 0;
    final orderingClosed =
        setup.isComplete && !isOnlineOrderingOpen(setup.hours);
    final belowMin = setup.isDelivery && cart.subtotal < setup.minOrder;
    final ctaLabel = state.placing
        ? l10n.placingOrder
        : session.isAuthenticated
        ? l10n.payAndPlaceOrder
        : l10n.verifyPhoneToPlace;

    return PopScope(
      canPop: !state.placing,
      child: Scaffold(
        appBar: AppBar(title: Text(l10n.checkoutTitle)),
        body: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            _StepHeader(number: 1, title: l10n.checkoutStepFulfillment),
            const SizedBox(height: 8),
            _FulfillmentCard(
              setupComplete: setup.isComplete,
              isDelivery: setup.isDelivery,
              title: setup.isComplete
                  ? (setup.isDelivery
                        ? l10n.deliveringFrom
                        : l10n.pickingUpFrom)
                  : l10n.chooseFulfillment,
              storeName: setup.isDelivery
                  ? (setup.storeName ?? l10n.modeDelivery)
                  : (setup.storeName ?? l10n.modeTakeaway),
              address: setup.isDelivery ? (setup.deliveryAddress ?? '') : '',
              feeLabel: setup.isDelivery
                  ? l10n.deliveryFee(Money.lkr(setup.deliveryFee))
                  : l10n.pickupTime,
              eta: setup.isDelivery
                  ? l10n.etaMinutes(20)
                  : l10n.pickupInMinutes(state.scheduleMinutes),
              onChange: state.placing
                  ? null
                  : () =>
                        showOrderModeSheet(context, ref: ref, allowSkip: false),
              changeLabel: l10n.changeFulfillment,
            ),
            OnlineOrderingClosedBanner(setup: setup),
            if (setup.isTakeaway) ...[
              const SizedBox(height: 8),
              _PickupScheduleChips(
                setup: setup,
                state: state,
                placing: state.placing,
              ),
            ],
            const SizedBox(height: 20),
            _StepHeader(number: 2, title: l10n.checkoutStepContact),
            const SizedBox(height: 8),
            _SectionCard(
              child: session.isAuthenticated && session.user != null
                  ? _SignedInContact(
                      name: formatAccountProfileName(
                        name: session.user!.name,
                        phone: session.user!.phone,
                      ),
                      phone: session.user!.phone,
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        BcTextField(
                          controller: _name,
                          label: l10n.checkoutFullName,
                          hint: l10n.nameHint,
                          textInputAction: TextInputAction.next,
                          enabled: !state.placing && !phoneAuth.isVerifyingOtp,
                          onChanged: (_) => setState(() {}),
                        ),
                        const SizedBox(height: 12),
                        Stack(
                          alignment: Alignment.centerRight,
                          children: [
                            BcTextField(
                              controller: _phone,
                              label: l10n.checkoutMobile,
                              hint: l10n.phoneHint,
                              keyboardType: TextInputType.phone,
                              enabled:
                                  !state.placing && !phoneAuth.isVerifyingOtp,
                              inputFormatters: [
                                FilteringTextInputFormatter.digitsOnly,
                                LengthLimitingTextInputFormatter(10),
                              ],
                              onChanged: (value) {
                                final formatted = Phone.formatInput(value);
                                if (formatted != value) {
                                  _phone.value = TextEditingValue(
                                    text: formatted,
                                    selection: TextSelection.collapsed(
                                      offset: formatted.length,
                                    ),
                                  );
                                }
                                ref
                                    .read(checkoutPhoneAuthProvider.notifier)
                                    .onPhoneChanged(formatted);
                              },
                            ),
                            if (phoneAuth.isChecking)
                              const Padding(
                                padding: EdgeInsets.only(right: 12),
                                child: SizedBox(
                                  width: 16,
                                  height: 16,
                                  child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 12),
                        BcTextField(
                          controller: _email,
                          label: l10n.checkoutEmailOptional,
                          keyboardType: TextInputType.emailAddress,
                          enabled: !state.placing && !phoneAuth.isVerifyingOtp,
                        ),
                        if (phoneAuth.showSendOtp) ...[
                          const SizedBox(height: 12),
                          FilledButton(
                            onPressed:
                                phoneAuth.isSendingOtp ||
                                    _name.text.trim().length < 2
                                ? null
                                : () async {
                                    await ref
                                        .read(
                                          checkoutPhoneAuthProvider.notifier,
                                        )
                                        .sendOtp(
                                          phone: _phone.text,
                                          name: _name.text,
                                        );
                                    _otp.clear();
                                  },
                            child: phoneAuth.isSendingOtp
                                ? const SizedBox(
                                    width: 20,
                                    height: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : Text(l10n.checkoutSendOtp),
                          ),
                        ],
                        if (phoneAuth.showOtpInput) ...[
                          const SizedBox(height: 12),
                          Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: colors.brand.withValues(alpha: 0.06),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: colors.brand.withValues(alpha: 0.25),
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                TextField(
                                  controller: _otp,
                                  enabled: !phoneAuth.isVerifyingOtp,
                                  textAlign: TextAlign.center,
                                  keyboardType: TextInputType.number,
                                  style: Theme.of(context).textTheme.titleLarge
                                      ?.copyWith(
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 8,
                                      ),
                                  inputFormatters: [
                                    FilteringTextInputFormatter.digitsOnly,
                                    LengthLimitingTextInputFormatter(6),
                                  ],
                                  onChanged: ref
                                      .read(checkoutPhoneAuthProvider.notifier)
                                      .setOtpCode,
                                  decoration: InputDecoration(
                                    hintText: l10n.checkoutOtpHint,
                                    hintStyle: const TextStyle(
                                      letterSpacing: 0,
                                    ),
                                  ),
                                ),
                                if (phoneAuth.debugOtp != null &&
                                    phoneAuth.debugOtp!.isNotEmpty) ...[
                                  const SizedBox(height: 12),
                                  DevOtpHint(code: phoneAuth.debugOtp!),
                                ],
                                const SizedBox(height: 12),
                                FilledButton(
                                  onPressed:
                                      phoneAuth.isVerifyingOtp ||
                                          phoneAuth.otpCode.length != 6
                                      ? null
                                      : () => ref
                                            .read(
                                              checkoutPhoneAuthProvider
                                                  .notifier,
                                            )
                                            .verifyOtp(
                                              phone: _phone.text,
                                              name: _name.text,
                                              email: _email.text,
                                            ),
                                  child: phoneAuth.isVerifyingOtp
                                      ? const SizedBox(
                                          width: 20,
                                          height: 20,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : Text(l10n.checkoutVerifyOtp),
                                ),
                                OutlinedButton(
                                  onPressed: phoneAuth.isSendingOtp
                                      ? null
                                      : () async {
                                          await ref
                                              .read(
                                                checkoutPhoneAuthProvider
                                                    .notifier,
                                              )
                                              .sendOtp(
                                                phone: _phone.text,
                                                name: _name.text,
                                              );
                                          _otp.clear();
                                        },
                                  child: Text(l10n.resendOtp),
                                ),
                              ],
                            ),
                          ),
                        ],
                        const SizedBox(height: 10),
                        Text(
                          phoneAuth.isChecking
                              ? l10n.checkoutCheckingAccount
                              : phoneAuth.showSendOtp || phoneAuth.showOtpInput
                              ? l10n.checkoutNewNumberHint
                              : l10n.checkoutExistingHint,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: colors.textMuted),
                        ),
                        if (phoneAuth.errorMessage != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            phoneAuth.errorMessage!,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ],
                      ],
                    ),
            ),
            const SizedBox(height: 20),
            _StepHeader(number: 3, title: l10n.checkoutStepPayment),
            const SizedBox(height: 8),
            if (state.loadingMethods)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: LoadingState(),
              )
            else if (state.methods.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: Text(l10n.noPaymentMethods),
              )
            else
              for (final method in state.methods)
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Material(
                    color: method.id == state.selectedMethodId
                        ? colors.brand.withValues(alpha: 0.08)
                        : colors.navyCard,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: BorderSide(
                        color: method.id == state.selectedMethodId
                            ? colors.brand
                            : colors.navyBorder,
                        width: method.id == state.selectedMethodId ? 1.5 : 1,
                      ),
                    ),
                    child: ListTile(
                      title: Text(method.label),
                      leading: Icon(
                        method.id == state.selectedMethodId
                            ? Icons.radio_button_checked
                            : Icons.radio_button_off,
                        color: colors.brand,
                      ),
                      onTap: state.placing
                          ? null
                          : () {
                              BcFeedback.sndToggle();
                              ref
                                  .read(checkoutNotifierProvider.notifier)
                                  .selectMethod(method.id);
                            },
                    ),
                  ),
                ),
            const SizedBox(height: 20),
            _StepHeader(number: 4, title: l10n.checkoutStepSummary),
            const SizedBox(height: 8),
            _SectionCard(
              child: Column(
                children: [
                  for (final line in cart.lines)
                    _SummaryRow(
                      label: '${line.quantity}× ${line.name}',
                      value: Money.lkr(line.unitPrice * line.quantity),
                    ),
                  const Divider(),
                  _SummaryRow(
                    label: l10n.subtotal,
                    value: Money.lkr(cart.subtotal),
                  ),
                  if (setup.isDelivery)
                    _SummaryRow(
                      label: freeDelivery
                          ? l10n.spinFreeDelivery
                          : l10n.deliveryFeeLabel,
                      value: Money.lkr(deliveryFee),
                    ),
                  if (discount > 0)
                    _SummaryRow(
                      label: l10n.discountLabel,
                      value: '-${Money.lkr(discount)}',
                      valueColor: colors.success,
                    ),
                  if (convenience > 0)
                    _SummaryRow(
                      label: l10n.convenienceFeeOfItems,
                      value: Money.lkr(convenience),
                    ),
                  if (spin != null &&
                      spin.valid &&
                      (spin.giftLabel ?? '').isNotEmpty)
                    _SummaryRow(label: l10n.spinGift, value: spin.giftLabel!),
                  if (pointsOff > 0)
                    _SummaryRow(
                      label: 'Points (${redeem.points} pts)',
                      value: '-${Money.lkr(pointsOff)}',
                      valueColor: colors.success,
                    ),
                  _SummaryRow(
                    label: l10n.total,
                    value: Money.lkr(total),
                    emphasize: true,
                    valueColor: colors.brand,
                  ),
                  if (session.isAuthenticated &&
                      loyalty.settings.checkoutRedeemEnabled &&
                      !loyalty.checkoutRedeemUnlocked) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Earn ${loyalty.settings.minPointsToRedeem} points to unlock checkout redemption (${loyalty.lifetimePointsEarned}/${loyalty.settings.minPointsToRedeem} earned).',
                      style: TextStyle(color: colors.mutedText, fontSize: 12),
                    ),
                  ],
                  if (session.isAuthenticated &&
                      loyalty.settings.checkoutRedeemEnabled &&
                      loyalty.checkoutRedeemUnlocked &&
                      loyalty.points > 0) ...[
                    const SizedBox(height: 8),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      value: state.redeemEnabled && redeem.maxPoints > 0,
                      title: const Text(
                        'Redeem points',
                        style: TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        redeem.maxPoints == 0
                            ? 'Add a bit more to this order to redeem.'
                            : '1 point = LKR ${loyalty.settings.redeemValue} · − LKR ${redeem.discountLkr} off this order',
                      ),
                      onChanged: state.placing || redeem.maxPoints == 0
                          ? null
                          : (v) {
                              BcFeedback.sndToggle();
                              ref
                                  .read(checkoutNotifierProvider.notifier)
                                  .setRedeemEnabled(v);
                              if (v) {
                                ref
                                    .read(checkoutNotifierProvider.notifier)
                                    .setUsePoints(redeem.maxPoints);
                              }
                            },
                    ),
                  ],
                  if (state.spinClaim != null) ...[
                    const SizedBox(height: 8),
                    SwitchListTile(
                      contentPadding: EdgeInsets.zero,
                      value:
                          state.spinApplied &&
                          state.spinValidation?.valid == true,
                      title: Text(
                        state.spinApplied && state.spinValidation?.valid == true
                            ? l10n.promoApplied
                            : l10n.applyPromo,
                        style: TextStyle(
                          color:
                              state.spinApplied &&
                                  state.spinValidation?.valid == true
                              ? colors.success
                              : null,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      subtitle: Text(state.spinClaim!.offer.label),
                      onChanged: state.placing
                          ? null
                          : (v) {
                              BcFeedback.sndToggle();
                              ref
                                  .read(checkoutNotifierProvider.notifier)
                                  .setSpinApplied(v);
                            },
                    ),
                  ],
                ],
              ),
            ),
            if (state.spinError != null) ...[
              const SizedBox(height: 8),
              Text(state.spinError!),
            ],
            if (belowMin) ...[
              const SizedBox(height: 8),
              Text(l10n.deliveryMinOrder(Money.lkr(setup.minOrder))),
            ],
            if (state.offline) ...[
              const SizedBox(height: 8),
              Text(l10n.offlineBlock),
            ],
            if (state.errorMessage != null) ...[
              const SizedBox(height: 8),
              Text(
                state.errorMessage!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ],
            if (!session.isAuthenticated) ...[
              const SizedBox(height: 8),
              Text(l10n.guestCheckoutHelper),
            ],
            const SizedBox(height: 16),
            BcPrimaryButton(
              label: ctaLabel,
              loading: state.placing,
              onPressed:
                  belowMin ||
                      orderingClosed ||
                      !setup.isComplete ||
                      state.loadingMethods ||
                      state.selectedMethodId == null ||
                      !session.isAuthenticated
                  ? null
                  : _place,
            ),
            const SizedBox(height: 8),
            Text(
              l10n.securedCheckout,
              textAlign: TextAlign.center,
              style: Theme.of(
                context,
              ).textTheme.bodySmall?.copyWith(color: colors.textMuted),
            ),
          ],
        ),
      ),
    );
  }
}

class _SignedInContact extends StatelessWidget {
  const _SignedInContact({required this.name, required this.phone});

  final String name;
  final String phone;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colors = Theme.of(context).extension<BcColors>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: colors.navyLight,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: colors.navyBorder),
          ),
          child: Row(
            children: [
              Icon(Icons.person_outline, color: colors.brand, size: 20),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Row(
                      children: [
                        Icon(
                          Icons.phone_outlined,
                          size: 12,
                          color: colors.textMuted,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          phone,
                          style: Theme.of(context).textTheme.bodySmall
                              ?.copyWith(color: colors.textMuted),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Text(
          l10n.checkoutSignedInHint,
          style: Theme.of(
            context,
          ).textTheme.bodySmall?.copyWith(color: colors.textMuted),
        ),
      ],
    );
  }
}

class _StepHeader extends StatelessWidget {
  const _StepHeader({required this.number, required this.title});

  final int number;
  final String title;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<BcColors>()!;
    return Row(
      children: [
        Container(
          width: 28,
          height: 28,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: colors.brand,
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
          style: Theme.of(
            context,
          ).textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
      ],
    );
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<BcColors>()!;
    return Material(
      color: colors.navyCard,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: colors.navyBorder),
      ),
      child: Padding(padding: const EdgeInsets.all(14), child: child),
    );
  }
}

class _FulfillmentCard extends StatelessWidget {
  const _FulfillmentCard({
    required this.setupComplete,
    required this.isDelivery,
    required this.title,
    required this.storeName,
    required this.address,
    required this.feeLabel,
    required this.eta,
    required this.onChange,
    required this.changeLabel,
  });

  final bool setupComplete;
  final bool isDelivery;
  final String title;
  final String storeName;
  final String address;
  final String feeLabel;
  final String eta;
  final VoidCallback? onChange;
  final String changeLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<BcColors>()!;
    return Material(
      color: colors.brand.withValues(alpha: 0.08),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: colors.brand.withValues(alpha: 0.25)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: colors.brand.withValues(alpha: 0.16),
                shape: BoxShape.circle,
              ),
              child: Icon(
                isDelivery
                    ? Icons.local_shipping_outlined
                    : Icons.shopping_bag_outlined,
                color: colors.brand,
                size: 20,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: Theme.of(
                      context,
                    ).textTheme.labelMedium?.copyWith(color: colors.textMuted),
                  ),
                  Text(
                    storeName,
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  if (address.isNotEmpty)
                    Text(
                      address,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  Text(
                    '$feeLabel · $eta',
                    style: Theme.of(
                      context,
                    ).textTheme.bodySmall?.copyWith(color: colors.textMuted),
                  ),
                ],
              ),
            ),
            if (setupComplete)
              Icon(Icons.check_circle, color: colors.success, size: 22),
            TextButton(onPressed: onChange, child: Text(changeLabel)),
          ],
        ),
      ),
    );
  }
}

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({
    required this.label,
    required this.value,
    this.emphasize = false,
    this.valueColor,
  });

  final String label;
  final String value;
  final bool emphasize;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final style = emphasize
        ? Theme.of(
            context,
          ).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800)
        : Theme.of(context).textTheme.bodyMedium;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(child: Text(label, style: style)),
          Text(
            value,
            style: style?.copyWith(
              color: valueColor,
              fontWeight: emphasize ? FontWeight.w800 : null,
            ),
          ),
        ],
      ),
    );
  }
}

String? _customIsoWithoutHours(TimeOfDay picked) {
  final now = DateTime.now();
  final scheduled = DateTime(
    now.year,
    now.month,
    now.day,
    picked.hour,
    picked.minute,
  );
  if (!scheduled.isAfter(now)) return null;
  if (scheduled.isBefore(
    now.add(const Duration(minutes: minCustomScheduleLeadMinutes)),
  )) {
    return null;
  }
  return scheduled.toUtc().toIso8601String();
}

class _PickupScheduleChips extends ConsumerWidget {
  const _PickupScheduleChips({
    required this.setup,
    required this.state,
    required this.placing,
  });

  final OrderSetup setup;
  final CheckoutState state;
  final bool placing;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final hours = setup.hours;
    final locked = hours != null && isSchedulingLocked(hours);
    if (locked) {
      return Text(
        'Scheduling closed — last pickup slot was ${hours.pickupCutoffMinutes} min before close.',
        style: Theme.of(context).textTheme.bodySmall,
      );
    }
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final minutes in const [15, 30, 45])
          ChoiceChip(
            label: Text(l10n.pickupInMinutes(minutes)),
            selected: !state.scheduleCustom && state.scheduleMinutes == minutes,
            onSelected: placing
                ? null
                : (_) {
                    BcFeedback.sndToggle();
                    ref
                        .read(checkoutNotifierProvider.notifier)
                        .setScheduleMinutes(minutes);
                  },
          ),
        ChoiceChip(
          label: Text(
            state.scheduleCustom && state.customScheduledAt != null
                ? schedulePickupTimeLabel(state.customScheduledAt)
                : 'Schedule',
          ),
          selected: state.scheduleCustom,
          onSelected: placing
              ? null
              : (_) async {
                  final picked = await showTimePicker(
                    context: context,
                    initialTime: TimeOfDay.fromDateTime(
                      DateTime.now().add(
                        const Duration(minutes: minCustomScheduleLeadMinutes),
                      ),
                    ),
                  );
                  if (picked == null) return;
                  final iso = hours == null
                      ? _customIsoWithoutHours(picked)
                      : scheduledAtFromTimeOfDay(
                          hour: picked.hour,
                          minute: picked.minute,
                          hours: hours,
                        );
                  if (iso == null) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text(
                            'Please choose a time at least $minCustomScheduleLeadMinutes minutes from now',
                          ),
                        ),
                      );
                    }
                    return;
                  }
                  BcFeedback.sndToggle();
                  ref
                      .read(checkoutNotifierProvider.notifier)
                      .setScheduleCustom(iso);
                },
        ),
      ],
    );
  }
}
