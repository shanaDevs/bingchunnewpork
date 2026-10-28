import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_lock.dart';
import '../../core/feedback.dart';
import '../components/pin_pad.dart';
import '../theme/bc_theme.dart';
import '../../l10n/l10n.dart';

/// Create a 4-digit app PIN: enter it, then enter it again to confirm.
/// Pops `true` once the PIN is saved and the PIN lock is on.
class PinSetupScreen extends StatefulWidget {
  const PinSetupScreen({super.key});

  @override
  State<PinSetupScreen> createState() => _PinSetupScreenState();
}

class _PinSetupScreenState extends State<PinSetupScreen> {
  String _first = '';
  String _pin = '';
  bool _confirming = false;
  bool _saving = false;
  String? _error;
  int _errorTick = 0;

  /// Same digit four times or a straight run — too easy to guess over a shoulder.
  static bool _tooSimple(String p) {
    if (p.split('').toSet().length == 1) return true;
    const runs = '0123456789';
    return runs.contains(p) || runs.split('').reversed.join().contains(p);
  }

  void _onDigit(String d) {
    if (_saving || _pin.length >= AppLock.pinLength) return;
    setState(() {
      _pin += d;
      _error = null;
    });
    if (_pin.length == AppLock.pinLength) Future.delayed(const Duration(milliseconds: 120), _onComplete);
  }

  void _onBackspace() {
    if (_saving || _pin.isEmpty) return;
    setState(() => _pin = _pin.substring(0, _pin.length - 1));
  }

  void _fail(String message, {bool restart = false}) {
    BcFeedback.error();
    setState(() {
      _error = message;
      _errorTick++;
      _pin = '';
      if (restart) {
        _first = '';
        _confirming = false;
      }
    });
  }

  Future<void> _onComplete() async {
    if (!mounted) return;
    if (!_confirming) {
      if (_tooSimple(_pin)) return _fail(tr('That PIN is too easy to guess. Try another.'));
      BcFeedback.tap();
      setState(() {
        _first = _pin;
        _pin = '';
        _confirming = true;
      });
      return;
    }
    if (_pin != _first) return _fail(tr("PINs didn't match. Start again."), restart: true);

    setState(() => _saving = true);
    await context.read<AppLock>().setPin(_pin);
    if (!mounted) return;
    BcFeedback.success();
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return Scaffold(
      backgroundColor: c.background,
      appBar: AppBar(
        backgroundColor: c.background,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          tooltip: tr('Back'),
          icon: Icon(Icons.arrow_back_rounded, color: c.text),
          onPressed: () => Navigator.of(context).pop(false),
        ),
        title: Text(tr('App PIN'), style: BcType.section.copyWith(color: c.text)),
        centerTitle: true,
      ),
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, box) => SingleChildScrollView(
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: box.maxHeight),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 8, 24, 24),
                child: Column(
                  children: [
                    _StepIndicator(step: _confirming ? 2 : 1),
                    const SizedBox(height: 26),
                    Container(
                      width: 72,
                      height: 72,
                      decoration: BoxDecoration(color: c.brandSubtle, shape: BoxShape.circle),
                      child: Icon(
                        _confirming ? Icons.verified_user_outlined : Icons.pin_outlined,
                        color: c.brand,
                        size: 34,
                      ),
                    ),
                    const SizedBox(height: 18),
                    AnimatedSwitcher(
                      duration: BcMotion.standard,
                      child: Column(
                        key: ValueKey(_confirming),
                        children: [
                          Text(
                            _confirming ? tr('Confirm your PIN') : tr('Create a 4-digit PIN'),
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: c.text),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _confirming
                                ? tr('Enter the same PIN again to turn on the app lock.')
                                : tr("You'll enter this PIN each time you open the app."),
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 13.5, height: 1.45, color: c.textMuted),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 30),
                    PinDots(length: AppLock.pinLength, filled: _pin.length, errorTick: _errorTick),
                    const SizedBox(height: 14),
                    SizedBox(
                      height: 20,
                      child: AnimatedSwitcher(
                        duration: BcMotion.fast,
                        child: Text(
                          _error ?? '',
                          key: ValueKey(_error),
                          textAlign: TextAlign.center,
                          style: BcType.caption.copyWith(color: c.danger, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                    const SizedBox(height: 22),
                    PinKeypad(enabled: !_saving, onDigit: _onDigit, onBackspace: _onBackspace),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _StepIndicator extends StatelessWidget {
  const _StepIndicator({required this.step});
  final int step;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    Widget bar(bool on) => Expanded(
      child: AnimatedContainer(
        duration: BcMotion.standard,
        height: 5,
        decoration: BoxDecoration(color: on ? c.brand : c.border, borderRadius: BorderRadius.circular(99)),
      ),
    );
    return Column(
      children: [
        Row(children: [bar(true), const SizedBox(width: 8), bar(step == 2)]),
        const SizedBox(height: 8),
        Text(
          tr('Step {step} of 2', {'step': step}),
          style: BcType.tiny.copyWith(color: c.textMuted),
        ),
      ],
    );
  }
}
