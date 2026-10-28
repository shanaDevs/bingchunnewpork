import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/auth_provider.dart';
import '../theme/bc_theme.dart';
import '../widgets/bc_button.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _pinController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    await ref.read(authProvider.notifier).login(_pinController.text.trim());
  }

  void _fillDemo() {
    _pinController.text = '1234';
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);

    return Scaffold(
      body: Container(
        decoration: BoxDecoration(gradient: BcTheme.heroGradient),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Image.asset('assets/brand/logo.png', width: 72, height: 72),
                          const SizedBox(height: 16),
                          Text(
                            'Delivery Staff',
                            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                                  fontWeight: FontWeight.w700,
                                ),
                          ),
                          const SizedBox(height: 4),
                          const Text(
                            'Enter your staff PIN to view routes',
                            style: TextStyle(color: BcColors.textMuted, fontSize: 13),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 24),
                          TextFormField(
                            controller: _pinController,
                            keyboardType: TextInputType.number,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                              LengthLimitingTextInputFormatter(6),
                            ],
                            obscureText: true,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 28,
                              fontWeight: FontWeight.w700,
                              letterSpacing: 12,
                              fontFamily: 'monospace',
                            ),
                            decoration: const InputDecoration(
                              labelText: 'Staff PIN',
                              hintText: '••••',
                              prefixIcon: Icon(Icons.pin_outlined, color: BcColors.textMuted),
                            ),
                            validator: (v) {
                              if (v == null || v.isEmpty) return 'PIN required';
                              if (v.length < 4) return 'PIN must be 4–6 digits';
                              return null;
                            },
                            onFieldSubmitted: (_) => _submit(),
                          ),
                          if (auth.error != null) ...[
                            const SizedBox(height: 12),
                            Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: BcColors.error.withValues(alpha: 0.12),
                                borderRadius: BorderRadius.circular(10),
                                border: Border.all(color: BcColors.error.withValues(alpha: 0.35)),
                              ),
                              child: Text(
                                auth.error!,
                                style: const TextStyle(color: Color(0xFFF87171), fontSize: 13),
                              ),
                            ),
                          ],
                          const SizedBox(height: 20),
                          BcButton(
                            label: auth.loading ? 'Signing in…' : 'Sign In',
                            loading: auth.loading,
                            onPressed: _submit,
                          ),
                          const SizedBox(height: 16),
                          InkWell(
                            onTap: _fillDemo,
                            borderRadius: BorderRadius.circular(12),
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: BcColors.navyBorder),
                              ),
                              child: const Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text('Demo driver', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                  SizedBox(height: 4),
                                  Text(
                                    'PIN: 1234',
                                    style: TextStyle(color: BcColors.brand, fontSize: 12, fontFamily: 'monospace'),
                                  ),
                                  SizedBox(height: 2),
                                  Text(
                                    'Nugegoda branch — tap to fill',
                                    style: TextStyle(color: BcColors.textMuted, fontSize: 11),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
