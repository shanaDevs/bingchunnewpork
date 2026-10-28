import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';

class HelpSupportScreen extends ConsumerStatefulWidget {
  const HelpSupportScreen({super.key});

  @override
  ConsumerState<HelpSupportScreen> createState() => _HelpSupportScreenState();
}

class _HelpSupportScreenState extends ConsumerState<HelpSupportScreen> {
  final _formKey = GlobalKey<FormState>();
  final _subjectController = TextEditingController();
  final _messageController = TextEditingController();
  bool _isSubmitting = false;

  final List<Map<String, String>> _faqs = [
    {
      'q': 'How do I track my order?',
      'a': 'You can track your order in real-time by navigating to the "Orders" tab, selecting your active order, and tapping "Track Order". You will also receive push notifications for delivery milestones.'
    },
    {
      'q': 'What are loyalty points used for?',
      'a': 'Loyalty points are earned on every purchase (10 points per dollar). You can redeem them during checkout for free toppings, discount vouchers, or exclusive merch.'
    },
    {
      'q': 'How can I change my delivery address?',
      'a': 'Before placing an order, you can update your location on the Checkout screen or in the Address Book. Note that active orders cannot have their delivery location changed once dispatched.'
    },
    {
      'q': 'What is the refund policy?',
      'a': 'If there is an issue with your order (missing items, incorrect preparation), please contact support immediately via this form. Refunds are processed within 3-5 business days to your original payment method.'
    },
  ];

  @override
  void dispose() {
    _subjectController.dispose();
    _messageController.dispose();
    super.dispose();
  }

  Future<void> _submitTicket() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSubmitting = true);

    // Simulate sending support request to backend
    await Future.delayed(const Duration(seconds: 1500));

    if (mounted) {
      setState(() {
        _isSubmitting = false;
        _subjectController.clear();
        _messageController.clear();
      });
      showAppToast(context, 'Ticket submitted! We will respond within 24 hours.');
      FocusScope.of(context).unfocus();
    }
  }

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Scaffold(
      backgroundColor: bc.pageBg,
      appBar: AppBar(
        title: const Text('Help & Support'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Frequently Asked Questions',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: onSurface,
              ),
            ),
            const SizedBox(height: 12),
            Container(
              decoration: BoxDecoration(
                color: bc.cardBg,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: bc.border),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(16),
                child: Column(
                  children: _faqs.map((faq) {
                    return ExpansionTile(
                      shape: const Border(),
                      title: Text(
                        faq['q']!,
                        style: TextStyle(
                          fontWeight: FontWeight.w600,
                          fontSize: 14,
                          color: onSurface,
                        ),
                      ),
                      childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                      children: [
                        Text(
                          faq['a']!,
                          style: TextStyle(
                            color: bc.mutedText,
                            fontSize: 13,
                            height: 1.4,
                          ),
                        )
                      ],
                    );
                  }).toList(),
                ),
              ),
            ),
            const SizedBox(height: 28),
            Text(
              'Message Support',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: onSurface,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Send us a message and our support team will help you.',
              style: TextStyle(color: bc.mutedText, fontSize: 12),
            ),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: bc.cardBg,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: bc.border),
              ),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    TextFormField(
                      controller: _subjectController,
                      enabled: !_isSubmitting,
                      style: TextStyle(color: onSurface),
                      decoration: const InputDecoration(
                        labelText: 'Subject',
                        prefixIcon: Icon(Icons.title_rounded),
                        hintText: 'e.g. Missing Item, Refund Request',
                      ),
                      validator: (v) => v == null || v.trim().length < 3 ? 'Subject is too short' : null,
                    ),
                    const SizedBox(height: 14),
                    TextFormField(
                      controller: _messageController,
                      enabled: !_isSubmitting,
                      style: TextStyle(color: onSurface),
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: 'Message',
                        alignLabelWithHint: true,
                        prefixIcon: Padding(
                          padding: EdgeInsets.only(bottom: 54),
                          child: Icon(Icons.chat_bubble_outline_rounded),
                        ),
                        hintText: 'Describe your issue in detail...',
                      ),
                      validator: (v) => v == null || v.trim().length < 10 ? 'Message must be at least 10 characters' : null,
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      onPressed: _isSubmitting ? null : _submitTicket,
                      style: ElevatedButton.styleFrom(
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                      child: _isSubmitting
                          ? const SizedBox(
                              height: 20,
                              width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                              ),
                            )
                          : const Text('Submit Request'),
                    )
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
