import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import '../theme/bc_theme.dart';

/// Online checkout uses PayHere — the app does not store card numbers or CVV.
class PaymentMethodsScreen extends ConsumerStatefulWidget {
  const PaymentMethodsScreen({super.key});

  @override
  ConsumerState<PaymentMethodsScreen> createState() => _PaymentMethodsScreenState();
}

class _PaymentMethodsScreenState extends ConsumerState<PaymentMethodsScreen> {
  static const _legacyCardsKey = 'bc_saved_payment_cards';
  static const _legacyClearedKey = 'bc_saved_payment_cards_cleared_v2';

  final _storage = const FlutterSecureStorage();
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _clearLegacyVault();
  }

  Future<void> _clearLegacyVault() async {
    try {
      final cleared = await _storage.read(key: _legacyClearedKey);
      if (cleared != '1') {
        await _storage.delete(key: _legacyCardsKey);
        await _storage.write(key: _legacyClearedKey, value: '1');
      }
    } catch (_) {
      // Best-effort migration only.
    }
    if (mounted) setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Scaffold(
      backgroundColor: bc.pageBg,
      appBar: AppBar(
        title: const Text('Payment Methods'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
          : Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: bc.cardBg,
                        shape: BoxShape.circle,
                        border: Border.all(color: bc.border),
                      ),
                      child: const Icon(
                        Icons.lock_outline_rounded,
                        size: 48,
                        color: BcColors.brand,
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Pay securely at checkout',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: onSurface,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Card details are entered on PayHere during checkout. Bing Chun does not save your card number or CVV in the app.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 14,
                        color: bc.mutedText,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
