import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:sms_autofill/sms_autofill.dart';
import 'package:url_launcher/url_launcher.dart';

import '../config/api_config.dart';
import '../providers/auth_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/app_exit.dart';
import '../utils/app_toast.dart';
import '../utils/phone.dart';
import '../widgets/design/bc_app_design.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> with CodeAutoFill {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();

  bool _isCheckingPhone = false;
  bool _showOtpForm = false;
  bool _showDetailsForm = false;
  bool _offersOptIn = true;
  bool _isAutoVerifying = false;
  String _otpValue = '';
  String? _appSignature;

  String _phone = '';
  int _resendSeconds = 0;
  Timer? _resendTimer;
  Timer? _clipboardTimer;
  String? _lastClipboardOtp;
  /// OTPs from an earlier SMS/clipboard that must not be auto-pasted after resend.
  final Set<String> _staleOtps = {};
  int _otpClearGen = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      try {
        _appSignature = await SmsAutoFill().getAppSignature;
      } catch (_) {}
      final auth = ref.read(authProvider);
      if (auth.status == AuthStatus.unauthenticated) {
        _resetToPhoneStep();
      } else {
        _resumeAuthFlow();
      }
    });
  }

  @override
  void codeUpdated() {
    final raw = code;
    if (raw == null || raw.isEmpty || !mounted) return;
    _applyIncomingOtp(raw);
  }

  /// Fills OTP boxes from SMS listener or clipboard, then auto-verifies.
  void _applyIncomingOtp(String raw) {
    if (!mounted || _isAutoVerifying || !_showOtpForm || _showDetailsForm) return;
    final match = RegExp(r'\b(\d{6})\b').firstMatch(raw);
    final digits = match?.group(1) ?? raw.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 6) return;
    final six = digits.substring(0, 6);
    // Ignore codes from a previous SMS after resend / new request.
    if (_staleOtps.contains(six)) return;
    if (six == _otpValue) return;

    setState(() => _otpValue = six);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _isAutoVerifying) return;
      if (_otpValue == six && !_staleOtps.contains(six)) {
        _handleVerify(code: six);
      }
    });
  }

  Future<void> _prepareForNewOtp() async {
    if (_otpValue.length == 6) _staleOtps.add(_otpValue);
    if (_lastClipboardOtp != null) _staleOtps.add(_lastClipboardOtp!);
    try {
      final data = await Clipboard.getData(Clipboard.kTextPlain);
      final text = data?.text?.trim() ?? '';
      final match = RegExp(r'\b(\d{6})\b').firstMatch(text);
      if (match != null) _staleOtps.add(match.group(1)!);
    } catch (_) {}
    _lastClipboardOtp = null;
  }

  void _startClipboardWatch() {
    _clipboardTimer?.cancel();
    _clipboardTimer = Timer.periodic(const Duration(milliseconds: 700), (_) async {
      if (!mounted || !_showOtpForm || _showDetailsForm || _isAutoVerifying) return;
      try {
        final data = await Clipboard.getData(Clipboard.kTextPlain);
        final text = data?.text?.trim() ?? '';
        if (text.isEmpty) return;
        final match = RegExp(r'\b(\d{6})\b').firstMatch(text);
        if (match == null) return;
        final six = match.group(1)!;
        if (_staleOtps.contains(six)) return;
        if (six == _lastClipboardOtp) return;
        _lastClipboardOtp = six;
        _applyIncomingOtp(six);
      } catch (_) {}
    });
  }

  void _stopClipboardWatch() {
    _clipboardTimer?.cancel();
    _clipboardTimer = null;
  }

  @override
  void dispose() {
    _resendTimer?.cancel();
    _stopClipboardWatch();
    cancel();
    unregisterListener();
    _phoneController.dispose();
    _nameController.dispose();
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _startSmsListener() async {
    try {
      await cancel();
      await unregisterListener();
    } catch (_) {}
    listenForCode(smsCodeRegexPattern: r'(\d{6})');
    _startClipboardWatch();
  }

  Future<void> _stopSmsListener() async {
    _stopClipboardWatch();
    try {
      await cancel();
      await unregisterListener();
    } catch (_) {}
  }

  void _startResendTimer() {
    _resendTimer?.cancel();
    setState(() => _resendSeconds = 60);
    _resendTimer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      if (_resendSeconds <= 1) {
        timer.cancel();
        setState(() => _resendSeconds = 0);
      } else {
        setState(() => _resendSeconds -= 1);
      }
    });
  }

  void _resumeAuthFlow() {
    final auth = ref.read(authProvider);
    if (auth.status != AuthStatus.authenticated) return;
    final user = auth.user;
    if (user != null && user.isProfileComplete) return;
    if (user != null) {
      if (user.name.isNotEmpty && user.name != 'Guest') _nameController.text = user.name;
      if (user.email != null && user.email!.isNotEmpty) _emailController.text = user.email!;
      _phone = user.phone;
      setState(() {
        _showOtpForm = true;
        _showDetailsForm = true;
      });
    }
  }

  Future<void> _handleNext() async {
    if (!_formKey.currentState!.validate()) return;
    final phone = normalizeSriLankanPhone(_phoneController.text.trim());
    _phone = phone;
    setState(() => _isCheckingPhone = true);

    await _prepareForNewOtp();
    // Start SMS listener before the request so we don't miss a fast SMS.
    await _startSmsListener();

    final result = await ref.read(authProvider.notifier).requestOtp(
          phone,
          appSignature: _appSignature,
        );
    if (!mounted) return;
    setState(() => _isCheckingPhone = false);
    if (result.success) {
      _showSuccess('Verification code sent');
      await _prepareForNewOtp();
      setState(() {
        _showOtpForm = true;
        _showDetailsForm = false;
        _otpValue = '';
        _otpClearGen++;
      });
      _startResendTimer();
      // Re-arm listener after navigating to OTP step (in case native listener needs refresh).
      await _startSmsListener();
    } else {
      await _stopSmsListener();
      _showError(result.errorMessage ?? 'Failed to send OTP. Please try again.');
    }
  }

  Future<void> _handleVerify({String? code}) async {
    final otp = (code ?? _otpValue).trim();
    if (otp.length != 6) {
      _showError('Please enter the 6-digit code');
      return;
    }
    if (_isAutoVerifying) return;
    setState(() {
      _otpValue = otp;
      _isAutoVerifying = true;
    });

    final phone = normalizeSriLankanPhone(_phone);
    final result = await ref.read(authProvider.notifier).verifyOtp(phone, otp);
    if (!mounted) return;
    setState(() => _isAutoVerifying = false);

    if (result.success) {
      await _stopSmsListener();
      final user = ref.read(authProvider).user;
      if (user != null && user.isProfileComplete) {
        goHome(context);
        return;
      }
      if (user != null) {
        if (user.name.isNotEmpty && user.name != 'Guest') _nameController.text = user.name;
        if (user.email != null && user.email!.isNotEmpty) _emailController.text = user.email!;
      }
      setState(() {
        _showOtpForm = true;
        _showDetailsForm = true;
      });
    } else {
      _showError(result.errorMessage ?? 'Invalid or expired OTP. Please try again.');
      setState(() {
        _otpValue = '';
        _otpClearGen++;
      });
    }
  }

  void _onOtpCompleted(String code) {
    if (!mounted || _isAutoVerifying) return;
    _handleVerify(code: code);
  }

  Future<void> _handleRegister() async {
    if (!_formKey.currentState!.validate()) return;
    final success = await ref.read(authProvider.notifier).updateProfile(
          _nameController.text.trim(),
          email: _emailController.text.trim().isEmpty ? null : _emailController.text.trim(),
        );
    if (success && mounted) goHome(context);
    if (!success && mounted) {
      _showError(ref.read(authProvider).errorMessage ?? 'Profile setup failed');
    }
  }

  void _showError(String message) => showAppToast(context, message, isError: true);
  void _showSuccess(String message) => showAppToast(context, message, isError: false);

  Future<void> _openUrl(String path) async {
    final uri = Uri.parse('${ApiConfig.frontendUrl}$path');
    if (await canLaunchUrl(uri)) await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _goBackToPhone() {
    _stopSmsListener();
    _resetToPhoneStep();
  }

  void _resetToPhoneStep() {
    _resendTimer?.cancel();
    _stopSmsListener();
    _phoneController.clear();
    _nameController.clear();
    _emailController.clear();
    if (!mounted) return;
    setState(() {
      _showOtpForm = false;
      _showDetailsForm = false;
      _otpValue = '';
      _otpClearGen++;
      _phone = '';
      _resendSeconds = 0;
      _isCheckingPhone = false;
      _isAutoVerifying = false;
      _lastClipboardOtp = null;
      _staleOtps.clear();
    });
  }

  Future<void> _onSystemBack() async {
    if (_showDetailsForm) {
      setState(() => _showDetailsForm = false);
      return;
    }
    if (_showOtpForm) {
      _resetToPhoneStep();
      return;
    }
    await confirmAppExit(context);
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<AuthState>(authProvider, (previous, next) {
      if (previous?.status == AuthStatus.authenticated &&
          next.status == AuthStatus.unauthenticated) {
        _resetToPhoneStep();
      }
    });

    final authState = ref.watch(authProvider);
    final isLoading = authState.status == AuthStatus.authenticating || _isCheckingPhone;
    final viewInsets = MediaQuery.viewInsetsOf(context);
    final isOtpStep = _showOtpForm && !_showDetailsForm;
    final isPhoneStep = !_showOtpForm && !_showDetailsForm;
    // OTP hero is compact so mascot + phone stay fully on the dark area.
    final heroHeight = isOtpStep ? 360.0 : (_showDetailsForm ? 300.0 : 390.0);
    final showLegalFooter = isPhoneStep || isOtpStep;
    final topInset = MediaQuery.paddingOf(context).top;

    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        _onSystemBack();
      },
      child: Theme(
      data: Theme.of(context).copyWith(
        brightness: Brightness.light,
        scaffoldBackgroundColor: BcDesign.pageBg,
        inputDecorationTheme: const InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
        ),
      ),
      child: Scaffold(
        backgroundColor: BcDesign.pageBg,
        resizeToAvoidBottomInset: true,
        body: Stack(
          children: [
            Positioned(top: 0, left: 0, right: 0, child: BcHeroBackground(height: heroHeight + topInset * 0.35)),
            SafeArea(
              bottom: false,
              child: SingleChildScrollView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: EdgeInsets.fromLTRB(20, isOtpStep ? 0 : 4, 20, 24 + viewInsets.bottom),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    if (isOtpStep)
                      _buildOtpHero()
                    else if (_showDetailsForm)
                      _buildVerifiedHero()
                    else
                      _buildWelcomeHero(),
                    SizedBox(height: isOtpStep ? 20 : (isPhoneStep ? 28 : 16)),
                    _buildAuthCard(isLoading),
                    if (showLegalFooter) ...[
                      const SizedBox(height: 16),
                      if (isOtpStep)
                        Center(
                          child: GestureDetector(
                            onTap: () => _openUrl('/help'),
                            child: const Text('Need help?', style: TextStyle(color: BcColors.brand, fontSize: 14, fontWeight: FontWeight.w600)),
                          ),
                        )
                      else
                        _buildFooter(),
                    ],
                    SizedBox(height: MediaQuery.paddingOf(context).bottom + 8),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
      ),
    );
  }

  Widget _buildAuthCard(bool isLoading) {
    return BcAuthCard(
      child: Form(
        key: _formKey,
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 280),
          child: _showDetailsForm
              ? _buildDetailsStep(isLoading)
              : (_showOtpForm ? _buildOtpStep(isLoading) : _buildPhoneStep(isLoading)),
        ),
      ),
    );
  }

  Widget _buildWelcomeHero() {
    return Padding(
      // Extra bottom pad so title/tagline clear the curved wave before the card.
      padding: const EdgeInsets.only(bottom: 28),
      child: _brandBlock(
        title: 'Welcome to Bing Chun',
        subtitle: 'Your next perfect sip is moments away.',
        mascotHeight: 108,
        mascotAsset: 'assets/brand/mascot-hover.png',
      ),
    );
  }

  Widget _buildOtpHero() {
    return Column(
      children: [
        SizedBox(
          height: 40,
          child: Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              visualDensity: VisualDensity.compact,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 40, minHeight: 40),
              onPressed: _goBackToPhone,
              icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
            ),
          ),
        ),
        Image.asset(
          'assets/brand/mascot-hover.png',
          height: 64,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => Image.asset('assets/mascots/welcome.png', height: 56),
        ),
        const SizedBox(height: 4),
        const Text(
          'BING CHUN',
          style: TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w800, letterSpacing: 2),
        ),
        Text(
          'SRI LANKA',
          style: TextStyle(
            color: BcColors.brandLight.withValues(alpha: 0.95),
            fontSize: 9,
            letterSpacing: 3,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 12),
        const Text(
          'Verify your number',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800, height: 1.15),
        ),
        const SizedBox(height: 8),
        Text(
          'Enter the 6-digit code sent to',
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 13, height: 1.3),
        ),
        const SizedBox(height: 4),
        Text(
          formatPhoneDisplay(_phone),
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w800),
        ),
        TextButton(
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 2),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          onPressed: _goBackToPhone,
          child: const Text(
            'Change number',
            style: TextStyle(color: BcColors.brandLight, fontWeight: FontWeight.w600, fontSize: 14),
          ),
        ),
        const SizedBox(height: 12),
      ],
    );
  }

  Widget _buildVerifiedHero() {
    return Column(
      children: [
        Align(
          alignment: Alignment.centerLeft,
          child: IconButton(
            visualDensity: VisualDensity.compact,
            padding: EdgeInsets.zero,
            onPressed: () => setState(() => _showDetailsForm = false),
            icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
          ),
        ),
        Image.asset(
          'assets/brand/mascot-hover.png',
          height: 72,
          fit: BoxFit.contain,
          errorBuilder: (_, __, ___) => const SizedBox.shrink(),
        ),
        const SizedBox(height: 6),
        const Text('BING CHUN', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: 2)),
        Text('SRI LANKA', style: TextStyle(color: BcColors.brandLight.withValues(alpha: 0.95), fontSize: 10, letterSpacing: 3, fontWeight: FontWeight.w600)),
        const SizedBox(height: 16),
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: BcColors.success.withValues(alpha: 0.15),
            shape: BoxShape.circle,
            border: Border.all(color: BcColors.success, width: 2),
          ),
          child: const Icon(Icons.check_rounded, color: BcColors.success, size: 36),
        ),
        const SizedBox(height: 14),
        const Text("You're verified!", textAlign: TextAlign.center, style: TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        Text('Fill your information to get started.', textAlign: TextAlign.center, style: TextStyle(color: Colors.white.withValues(alpha: 0.72), fontSize: 14)),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _brandBlock({
    required String title,
    required String subtitle,
    required double mascotHeight,
    String mascotAsset = 'assets/brand/mascot-hover.png',
  }) {
    return Column(
      children: [
        if (mascotHeight > 0) ...[
          Image.asset(
            mascotAsset,
            height: mascotHeight,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => Image.asset(
              'assets/mascots/welcome.png',
              height: mascotHeight * 0.85,
              fit: BoxFit.contain,
            ),
          ),
          const SizedBox(height: 10),
        ],
        const Text(
          'BING CHUN',
          style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800, letterSpacing: 2.4),
        ),
        const SizedBox(height: 4),
        Text(
          'SRI LANKA',
          style: TextStyle(
            color: BcColors.brandLight.withValues(alpha: 0.95),
            fontSize: 10,
            letterSpacing: 3.2,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 18),
        Text(
          title,
          textAlign: TextAlign.center,
          style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w800, height: 1.2),
        ),
        const SizedBox(height: 8),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: TextStyle(color: Colors.white.withValues(alpha: 0.72), fontSize: 14, height: 1.35),
        ),
      ],
    );
  }

  Widget _buildPhoneStep(bool isLoading) {
    return Column(
      key: const ValueKey('phone'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text(
          'Continue with mobile',
          style: TextStyle(color: BcDesign.cardNavy, fontSize: 22, fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 8),
        const Text(
          "We'll send a one-time code to verify your number.",
          style: TextStyle(color: BcDesign.muted, fontSize: 14, height: 1.4),
        ),
        const SizedBox(height: 24),
        TextFormField(
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          enabled: !isLoading,
          inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9\s]'))],
          style: const TextStyle(color: BcDesign.cardNavy, fontSize: 16, fontWeight: FontWeight.w600),
          decoration: bcAuthInputDecoration(
            label: 'Mobile number',
            hint: '76 581 1999',
          ).copyWith(
            prefixIcon: null,
            prefixIconConstraints: const BoxConstraints(minWidth: 0, minHeight: 0),
            prefix: Padding(
              padding: const EdgeInsets.only(right: 10),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.smartphone_outlined, color: BcColors.brand, size: 20),
                  const SizedBox(width: 8),
                  const Text('+94', style: TextStyle(color: BcDesign.cardNavy, fontWeight: FontWeight.w700, fontSize: 15)),
                  const SizedBox(width: 2),
                  Icon(Icons.keyboard_arrow_down_rounded, color: BcColors.brand.withValues(alpha: 0.85), size: 18),
                  const SizedBox(width: 8),
                  Container(width: 1, height: 22, color: const Color(0xFFD5DEEA)),
                  const SizedBox(width: 8),
                ],
              ),
            ),
          ),
          validator: (v) {
            if (v == null || v.trim().isEmpty) return 'Mobile number is required';
            if (!isValidSriLankanPhone(v)) return 'Enter a valid Sri Lankan mobile number';
            return null;
          },
        ),
        const SizedBox(height: 22),
        BcPrimaryButton(label: 'Send verification code', isLoading: isLoading, onPressed: _handleNext),
        const SizedBox(height: 16),
        _secureNote(),
      ],
    );
  }

  Widget _buildOtpStep(bool isLoading) {
    final busy = isLoading || _isAutoVerifying;
    return Column(
      key: const ValueKey('otp'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Enter verification code', style: TextStyle(color: BcDesign.cardNavy, fontSize: 20, fontWeight: FontWeight.w800)),
        const SizedBox(height: 6),
        const Text('The code will expire in 5 minutes.', style: TextStyle(color: BcDesign.muted, fontSize: 13)),
        const SizedBox(height: 18),
        BcOtpBoxes(
          key: ValueKey('otp-boxes-$_otpClearGen'),
          currentCode: _otpValue.length == 6 ? _otpValue : null,
          enabled: !busy,
          filledNavy: false,
          onChanged: (v) {
            if (v == _otpValue) return;
            setState(() => _otpValue = v);
          },
          onCompleted: _onOtpCompleted,
        ),
        const SizedBox(height: 20),
        BcPrimaryButton(label: 'Verify & continue', isLoading: busy, onPressed: () => _handleVerify()),
        const SizedBox(height: 14),
        const Text("Didn't receive the code?", textAlign: TextAlign.center, style: TextStyle(color: BcDesign.muted, fontSize: 13)),
        const SizedBox(height: 4),
        if (_resendSeconds > 0)
          Text(
            'Resend code in 00:${_resendSeconds.toString().padLeft(2, '0')}',
            textAlign: TextAlign.center,
            style: const TextStyle(color: BcColors.brand, fontWeight: FontWeight.w700),
          )
        else
          TextButton(onPressed: busy ? null : _handleNext, child: const Text('Resend code')),
        TextButton(
          onPressed: busy ? null : _goBackToPhone,
          child: const Text('Use a different number', style: TextStyle(color: BcColors.brand)),
        ),
        const SizedBox(height: 6),
        _secureNote(protected: true),
      ],
    );
  }

  Widget _buildDetailsStep(bool isLoading) {
    return Column(
      key: const ValueKey('details'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Personal info', style: TextStyle(color: BcDesign.cardNavy, fontSize: 22, fontWeight: FontWeight.w800)),
        const SizedBox(height: 8),
        const Text('Fill your information to complete your profile.', style: TextStyle(color: BcDesign.muted, fontSize: 14)),
        const SizedBox(height: 22),
        TextFormField(
          controller: _nameController,
          enabled: !isLoading,
          style: const TextStyle(color: BcDesign.cardNavy),
          decoration: bcAuthInputDecoration(label: 'Full name', hint: 'e.g. John Doe', prefixIcon: Icons.person_outline),
          validator: (v) => (v == null || v.trim().isEmpty) ? 'Full name is required' : null,
        ),
        const SizedBox(height: 14),
        TextFormField(
          controller: _emailController,
          keyboardType: TextInputType.emailAddress,
          enabled: !isLoading,
          style: const TextStyle(color: BcDesign.cardNavy),
          decoration: bcAuthInputDecoration(label: 'Email address', hint: 'e.g. john@example.com', prefixIcon: Icons.mail_outline),
        ),
        const SizedBox(height: 16),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          value: _offersOptIn,
          activeThumbColor: Colors.white,
          activeTrackColor: BcColors.brand,
          title: const Text('Offers & rewards updates', style: TextStyle(color: BcDesign.cardNavy, fontWeight: FontWeight.w600, fontSize: 14)),
          onChanged: isLoading ? null : (v) => setState(() => _offersOptIn = v),
        ),
        const SizedBox(height: 12),
        BcPrimaryButton(label: 'Create account', isLoading: isLoading, onPressed: _handleRegister),
      ],
    );
  }

  Widget _secureNote({bool protected = false}) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.verified_user_outlined, size: 16, color: BcColors.brand.withValues(alpha: 0.85)),
        const SizedBox(width: 6),
        Flexible(
          child: Text(
            protected ? 'Secure OTP login • Your account is protected' : 'Secure OTP login • No password needed',
            textAlign: TextAlign.center,
            style: const TextStyle(color: BcDesign.muted, fontSize: 12, fontWeight: FontWeight.w500),
          ),
        ),
      ],
    );
  }

  Widget _buildFooter() {
    return Column(
      children: [
        Wrap(
          alignment: WrapAlignment.center,
          children: [
            const Text('By continuing, you agree to our ', style: TextStyle(color: BcDesign.muted, fontSize: 12)),
            GestureDetector(onTap: () => _openUrl('/terms'), child: const Text('Terms & Conditions', style: TextStyle(color: BcColors.brand, fontSize: 12, fontWeight: FontWeight.w600))),
            const Text(' and ', style: TextStyle(color: BcDesign.muted, fontSize: 12)),
            GestureDetector(onTap: () => _openUrl('/privacy'), child: const Text('Privacy Policy.', style: TextStyle(color: BcColors.brand, fontSize: 12, fontWeight: FontWeight.w600))),
          ],
        ),
        const SizedBox(height: 14),
        GestureDetector(onTap: () => _openUrl('/help'), child: const Text('Need help?', style: TextStyle(color: BcColors.brand, fontSize: 14, fontWeight: FontWeight.w600))),
      ],
    );
  }
}
