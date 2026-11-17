import 'package:flutter/material.dart';

import '../../core/format.dart';
import '../../core/intents.dart';
import '../../l10n/l10n.dart';
import 'bc_dialog.dart';

/// "Call {name}?" confirmation (QuickDrop CallConfirmDialog): shows who and which number,
/// then opens the dialer only when the rider taps Call.
Future<void> confirmAndCall(BuildContext context, {required String name, required String phone}) async {
  if (phone.trim().isEmpty) return;
  final messenger = ScaffoldMessenger.of(context);
  final ok = await showBcConfirm(
    context,
    title: tr('Call {name}?', {'name': name}),
    message: Format.lkMobileDisplay(phone.trim()),
    confirmLabel: tr('Call'),
    icon: Icons.call_rounded,
    tone: BcDialogTone.call,
  );
  if (!ok) return;
  final err = await Intents.dial(phone);
  if (err != null) messenger.showSnackBar(SnackBar(content: Text(err)));
}
