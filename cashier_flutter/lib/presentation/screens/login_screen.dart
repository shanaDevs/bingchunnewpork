import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/runtime_config.dart';
import '../../l10n/l10n.dart';
import '../components/buttons.dart';
import '../components/language_switch.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../state/auth_controller.dart';
import '../theme/pos_theme.dart';

/// Staff sign-in — port of the web `/admin/login`, laid out like the delivery
/// app: indigo hero with the EN / 中文 switch, then a card with the logo badge
/// on its top edge. Tap the badge 5 times to change the API server (debug builds).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _loading = false;
  bool _obscure = true;
  bool _appeared = false;
  int _logoTaps = 0;
  DateTime _lastTap = DateTime.fromMillisecondsSinceEpoch(0);

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) setState(() => _appeared = true);
    });
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    FocusScope.of(context).unfocus();
    setState(() => _loading = true);
    try {
      await context.read<AuthController>().login(_email.text, _password.text);
    } catch (e) {
      if (mounted) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _onLogoTap() {
    final now = DateTime.now();
    _logoTaps = now.difference(_lastTap) > const Duration(milliseconds: 2500) ? 1 : _logoTaps + 1;
    _lastTap = now;
    if (_logoTaps >= 5 && RuntimeConfig.instance.overridesAllowed) {
      _logoTaps = 0;
      showServerUrlDialog(context, context.read<AppContainer>());
    }
  }

  void _fillDemo(DemoAccount account) {
    _email.text = account.email;
    _password.text = account.password;
    _formKey.currentState?.validate();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final top = MediaQuery.paddingOf(context).top;
    final auth = context.watch<AuthController>();
    final rc = context.watch<RuntimeConfig>();

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: SystemUiOverlayStyle.light,
      child: Scaffold(body: _stacked(c, auth, rc, top)),
    );
  }

  /// Indigo hero on top, sign-in card with the logo badge on its edge.
  Widget _stacked(PosColors c, AuthController auth, RuntimeConfig rc, double top) {
    return SingleChildScrollView(
      padding: EdgeInsets.only(bottom: MediaQuery.paddingOf(context).bottom + PosSpacing.xxl),
      child: Column(
        children: [
          // Gradient spans the full width; the card stays in a centred column on tablets.
          _Hero(top: top, appeared: _appeared),
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: _contentWidth),
              child: Column(
                children: [
                  Transform.translate(
                    offset: const Offset(0, -56),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: PosSpacing.xl),
                      child: Stack(
                        clipBehavior: Clip.none,
                        alignment: Alignment.topCenter,
                        children: [
                          Container(
                            margin: const EdgeInsets.only(top: 44),
                            padding: const EdgeInsets.fromLTRB(PosSpacing.xl, 60, PosSpacing.xl, PosSpacing.xl),
                            decoration: _cardDecoration(c),
                            child: _form(c, auth, rc),
                          ),
                          AnimatedScale(
                            scale: _appeared ? 1 : 0.8,
                            duration: const Duration(milliseconds: 350),
                            curve: Curves.easeOutBack,
                            child: GestureDetector(onTap: _onLogoTap, child: const _LogoBadge()),
                          ),
                        ],
                      ),
                    ),
                  ),
                  _footnote(c),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Sign-in column width on tablets.
  static const _contentWidth = 520.0;

  BoxDecoration _cardDecoration(PosColors c) => BoxDecoration(
    color: c.card,
    borderRadius: BorderRadius.circular(24),
    border: Border.all(color: c.border.withValues(alpha: c.isDark ? 1 : 0.6)),
    boxShadow: [
      BoxShadow(
        color: c.isDark ? const Color(0x33000000) : const Color(0x1F1A1953),
        blurRadius: 30,
        offset: const Offset(0, 12),
      ),
    ],
  );

  Widget _footnote(PosColors c) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: PosSpacing.xl),
    child: Text(
      tr('Sessions are secured on this device. Sign out on shared tablets.'),
      textAlign: TextAlign.center,
      style: PosType.caption.copyWith(color: c.textSoft, fontSize: 11.5),
    ),
  );

  Widget _form(PosColors c, AuthController auth, RuntimeConfig rc) {
    InputDecoration field(String hint, IconData icon, {Widget? suffix}) => InputDecoration(
      hintText: hint,
      prefixIcon: Icon(icon, color: c.textMuted, size: 20),
      suffixIcon: suffix,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 15),
    );

    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            tr('Staff sign in'),
            textAlign: TextAlign.center,
            style: PosType.heading.copyWith(color: c.text, fontSize: 19),
          ),
          const SizedBox(height: 4),
          Text(
            tr('Use your branch cashier account'),
            textAlign: TextAlign.center,
            style: PosType.caption.copyWith(color: c.textMuted, fontSize: 12.5),
          ),
          const SizedBox(height: PosSpacing.xl),
          if (auth.signedOutReason != null) ...[
            InlineNotice(message: tr(auth.signedOutReason!), tone: NoticeTone.warning),
            const SizedBox(height: PosSpacing.md),
          ],
          if (rc.hasApiOverride) ...[
            InlineNotice(
              message: tr('Custom API URL active: {url}', {'url': rc.apiBaseUrl}),
              tone: NoticeTone.info,
              icon: Icons.dns_outlined,
            ),
            const SizedBox(height: PosSpacing.md),
          ],
          _FieldLabel(tr('Email')),
          TextFormField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autofillHints: const [AutofillHints.username, AutofillHints.email],
            textInputAction: TextInputAction.next,
            style: PosType.body.copyWith(color: c.text),
            decoration: field(tr('Staff email'), Icons.mail_outline_rounded),
            validator: (v) => (v == null || !v.contains('@')) ? tr('Enter a valid email') : null,
          ),
          const SizedBox(height: PosSpacing.md),
          _FieldLabel(tr('Password')),
          TextFormField(
            controller: _password,
            obscureText: _obscure,
            autofillHints: const [AutofillHints.password],
            textInputAction: TextInputAction.done,
            onFieldSubmitted: (_) => _submit(),
            style: PosType.body.copyWith(color: c.text),
            decoration: field(
              tr('Password'),
              Icons.lock_outline_rounded,
              suffix: IconButton(
                tooltip: _obscure ? tr('Show password') : tr('Hide password'),
                onPressed: () => setState(() => _obscure = !_obscure),
                icon: Icon(
                  _obscure ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                  color: c.textMuted,
                  size: 20,
                ),
              ),
            ),
            validator: (v) => (v == null || v.isEmpty) ? tr('Enter your password') : null,
          ),
          const SizedBox(height: PosSpacing.xl),
          PosButton(
            label: _loading ? tr('Signing in...') : tr('Sign In'),
            icon: Icons.login_rounded,
            loading: _loading,
            onPressed: _submit,
            height: 52,
          ),
          if (BuildDefaults.demoAccounts.isNotEmpty) ...[
            const SizedBox(height: PosSpacing.xl),
            Text(
              tr('Demo accounts (dev only)').toUpperCase(),
              textAlign: TextAlign.center,
              style: PosType.label.copyWith(color: c.textMuted),
            ),
            const SizedBox(height: PosSpacing.sm),
            for (final account in BuildDefaults.demoAccounts) ...[
              _DemoAccountCard(account: account, onTap: () => _fillDemo(account)),
              const SizedBox(height: PosSpacing.sm),
            ],
          ],
        ],
      ),
    );
  }
}

/// Indigo hero (web cashier sidebar gradient) with title, mascot and the language switch.
class _Hero extends StatelessWidget {
  const _Hero({required this.top, required this.appeared});
  final double top;
  final bool appeared;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final width = MediaQuery.sizeOf(context).width.clamp(0, _LoginScreenState._contentWidth).toDouble();
    return SizedBox(
      height: top + 300,
      child: ClipPath(
        clipper: const _CurveClipper(),
        child: Container(
          decoration: const BoxDecoration(gradient: PosColors.sidebarGradient),
          alignment: Alignment.topCenter,
          // Full-width gradient; title, mascot and switch line up with the sign-in card.
          child: SizedBox(
            width: width,
            child: Stack(
              // Glows fade past the centred column instead of ending in a hard edge.
              clipBehavior: Clip.none,
              children: [
                // Soft brand glows, like the web hero bubbles.
                Positioned(
                  right: -60,
                  top: top - 20,
                  child: _Glow(size: 220, color: c.brand.withValues(alpha: 0.35)),
                ),
                Positioned(left: -40, bottom: 30, child: _Glow(size: 140, color: c.brand.withValues(alpha: 0.18))),
                Positioned(
                  right: 4,
                  bottom: 52,
                  child: AnimatedOpacity(
                    opacity: appeared ? 1 : 0,
                    duration: const Duration(milliseconds: 450),
                    child: AnimatedSlide(
                      offset: appeared ? Offset.zero : const Offset(0.1, 0),
                      duration: const Duration(milliseconds: 450),
                      curve: Curves.easeOut,
                      child: Image.asset('assets/images/logo.png', height: width * 0.42),
                    ),
                  ),
                ),
                Positioned(top: top + 12, right: PosSpacing.lg, child: const PosLanguageSwitch(onDark: true)),
                Positioned(
                  left: PosSpacing.xxl,
                  top: top + 64,
                  right: width * 0.40,
                  child: AnimatedOpacity(
                    opacity: appeared ? 1 : 0,
                    duration: const Duration(milliseconds: 450),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          tr('Welcome back'),
                          style: PosType.body.copyWith(color: Colors.white.withValues(alpha: 0.8), fontSize: 15),
                        ),
                        const SizedBox(height: 6),
                        Text.rich(
                          TextSpan(
                            children: [
                              TextSpan(
                                text: '${tr('Cashier')} ',
                                style: const TextStyle(color: Colors.white),
                              ),
                              TextSpan(
                                text: tr('Panel'),
                                style: const TextStyle(color: Color(0xFF7CB4FF)),
                              ),
                            ],
                          ),
                          style: PosType.title.copyWith(fontSize: 31, fontWeight: FontWeight.w800, height: 1.1),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          tr('Manage orders and run the pickup queue.'),
                          style: PosType.body.copyWith(
                            color: Colors.white.withValues(alpha: 0.78),
                            fontSize: 13.5,
                            height: 1.45,
                          ),
                        ),
                        const SizedBox(height: 14),
                        Container(
                          width: 46,
                          height: 5,
                          decoration: BoxDecoration(
                            color: c.brand,
                            borderRadius: BorderRadius.circular(PosRadius.pill),
                          ),
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
    );
  }
}

class _Glow extends StatelessWidget {
  const _Glow({required this.size, required this.color});
  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      shape: BoxShape.circle,
      gradient: RadialGradient(colors: [color, color.withValues(alpha: 0)]),
    ),
  );
}

/// Gentle concave bottom edge for the hero.
class _CurveClipper extends CustomClipper<Path> {
  const _CurveClipper();

  @override
  Path getClip(Size size) {
    const depth = 46.0;
    return Path()
      ..lineTo(0, size.height - depth)
      ..quadraticBezierTo(size.width * 0.25, size.height, size.width * 0.55, size.height - depth * 0.55)
      ..quadraticBezierTo(size.width * 0.82, size.height - depth * 1.2, size.width, size.height - depth * 0.7)
      ..lineTo(size.width, 0)
      ..close();
  }

  @override
  bool shouldReclip(covariant CustomClipper<Path> oldClipper) => false;
}

/// Round white badge with the brand mascot, notched over the card's top edge.
class _LogoBadge extends StatelessWidget {
  const _LogoBadge();

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Container(
      width: 92,
      height: 92,
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(
        color: c.canvas,
        shape: BoxShape.circle,
        boxShadow: const [BoxShadow(color: Color(0x261A1953), blurRadius: 18, offset: Offset(0, 6))],
      ),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white,
          shape: BoxShape.circle,
          border: Border.all(color: c.brand.withValues(alpha: 0.25), width: 2),
        ),
        child: Image.asset('assets/images/logo.png', fit: BoxFit.contain),
      ),
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 2, bottom: 6),
    child: Text(text, style: PosType.bodyStrong.copyWith(color: context.pos.text, fontSize: 13)),
  );
}

/// Dev-only quick fill from `.env`, like the web "Demo accounts (dev only)" list:
/// role label, what the account demonstrates, and the email.
class _DemoAccountCard extends StatelessWidget {
  const _DemoAccountCard({required this.account, required this.onTap});
  final DemoAccount account;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return Material(
      color: c.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(PosRadius.card),
        side: BorderSide(color: c.border.withValues(alpha: 0.7)),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(PosRadius.card),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: PosSpacing.md, vertical: 10),
          child: Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(color: c.brandSubtle, borderRadius: BorderRadius.circular(PosRadius.button)),
                child: Icon(Icons.bolt_rounded, color: c.brand, size: 19),
              ),
              const SizedBox(width: PosSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      account.label.isEmpty ? account.email : account.label,
                      style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13.5),
                    ),
                    if (account.note.isNotEmpty)
                      Text(account.note, style: PosType.caption.copyWith(color: c.textMuted, fontSize: 11.5)),
                    Text(
                      account.email,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: PosType.caption.copyWith(color: c.brand, fontSize: 11.5),
                    ),
                  ],
                ),
              ),
              Icon(Icons.north_west_rounded, size: 16, color: c.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

/// Debug-only API host override.
Future<void> showServerUrlDialog(BuildContext context, AppContainer container) async {
  final rc = RuntimeConfig.instance;
  final controller = TextEditingController(text: rc.apiBaseUrl);
  final result = await showDialog<String>(
    context: context,
    builder: (ctx) {
      final c = ctx.pos;
      return AlertDialog(
        title: Text(tr('API server'), style: PosType.heading.copyWith(color: c.text)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              tr('Base URL including /api. Leave empty to use the build default.'),
              style: PosType.caption.copyWith(color: c.textMuted),
            ),
            const SizedBox(height: PosSpacing.md),
            TextField(
              controller: controller,
              keyboardType: TextInputType.url,
              decoration: const InputDecoration(hintText: 'http://127.0.0.1:4000/api'),
            ),
            const SizedBox(height: PosSpacing.sm),
            Text(
              tr('Default: {url}', {'url': BuildDefaults.apiBaseUrl}),
              style: PosType.caption.copyWith(color: c.textSoft, fontSize: 11),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, ''), child: Text(tr('Reset'))),
          TextButton(onPressed: () => Navigator.pop(ctx), child: Text(tr('Cancel'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, controller.text), child: Text(tr('Save'))),
        ],
      );
    },
  );
  controller.dispose();
  if (result == null) return;
  await container.applyApiBaseUrl(result);
  if (context.mounted) showPosSnack(context, tr('API server updated'), kind: PosSnackKind.success);
}
