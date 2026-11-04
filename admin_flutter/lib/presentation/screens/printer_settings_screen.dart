import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/bluetooth_printer.dart';
import '../../core/feedback.dart';
import '../../core/runtime_config.dart';
import '../../l10n/l10n.dart';
import '../components/pos_app_bar.dart';
import '../components/buttons.dart';
import '../components/layout.dart';
import '../components/pos_card.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../printing/item_slips.dart';
import '../theme/pos_theme.dart';

/// Pick a bonded Bluetooth thermal printer and run a SUN-style test print.
class PrinterSettingsScreen extends StatefulWidget {
  const PrinterSettingsScreen({super.key});

  @override
  State<PrinterSettingsScreen> createState() => _PrinterSettingsScreenState();
}

class _PrinterSettingsScreenState extends State<PrinterSettingsScreen> {
  bool _loading = true;
  bool _busy = false;
  String? _error;
  List<BondedPrinter> _devices = const [];

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  Future<void> _refresh() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (!BluetoothPrinter.isSupported) {
        setState(() {
          _error = tr('Bluetooth printing is only available on Android');
          _devices = const [];
          _loading = false;
        });
        return;
      }
      var allowed = await BluetoothPrinter.hasPermission();
      if (!allowed) allowed = await BluetoothPrinter.requestPermission();
      if (!allowed) {
        setState(() {
          _error = tr('Bluetooth permission is required to list paired printers');
          _devices = const [];
          _loading = false;
        });
        return;
      }
      if (!await BluetoothPrinter.isBluetoothOn()) {
        setState(() {
          _error = tr('Turn on Bluetooth, then refresh');
          _devices = const [];
          _loading = false;
        });
        return;
      }
      final devices = await BluetoothPrinter.listBonded();
      if (!mounted) return;
      setState(() {
        _devices = devices;
        _loading = false;
        if (devices.isEmpty) {
          _error = tr('No paired printers. Pair the printer in Android Bluetooth settings first.');
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _select(BondedPrinter d) async {
    await context.read<RuntimeConfig>().setBluetoothPrinter(mac: d.address, name: d.name);
    PosFeedback.success();
    if (mounted) showPosSnack(context, tr('Printer saved'), kind: PosSnackKind.success);
  }

  Future<void> _clear() async {
    await context.read<RuntimeConfig>().clearBluetoothPrinter();
    if (mounted) showPosSnack(context, tr('Printer cleared'));
  }

  Future<void> _testPrint() async {
    final mac = context.read<RuntimeConfig>().bluetoothPrinterMac?.trim() ?? '';
    if (mac.isEmpty) {
      showPosSnack(context, tr('Select a printer first'), kind: PosSnackKind.error);
      return;
    }
    setState(() => _busy = true);
    try {
      await ItemSlips.printTest(mac: mac);
      PosFeedback.success();
      if (mounted) showPosSnack(context, tr('Test print sent'), kind: PosSnackKind.success);
    } catch (e) {
      if (mounted) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final rc = context.watch<RuntimeConfig>();
    final selected = rc.bluetoothPrinterMac;

    return Scaffold(
      appBar: PosAppBar(
        title: tr('Printer'),
        eyebrow: tr('Hardware'),
        actions: [
          IconButton(
            tooltip: tr('Refresh'),
            onPressed: _loading || _busy ? null : _refresh,
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: ListView(
        padding: centeredPadding(context, top: PosSpacing.md),
        children: [
          Text(
            tr('Pair the thermal printer in Android Bluetooth settings, then pick it here. Same ESC/POS over Bluetooth SPP as the SUN IFORCE app.'),
            style: PosType.caption.copyWith(color: c.textMuted),
          ),
          const SizedBox(height: PosSpacing.lg),
          SectionLabel(tr('Selected printer')),
          PosCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  rc.hasBluetoothPrinter
                      ? (rc.bluetoothPrinterName ?? tr('Printer'))
                      : tr('None'),
                  style: PosType.bodyStrong.copyWith(color: c.text),
                ),
                if (rc.hasBluetoothPrinter) ...[
                  const SizedBox(height: 2),
                  Text(rc.bluetoothPrinterMac!, style: PosType.caption.copyWith(color: c.textMuted)),
                ],
                const SizedBox(height: PosSpacing.md),
                Row(
                  children: [
                    Expanded(
                      child: PosButton(
                        label: tr('Test print'),
                        icon: Icons.print_outlined,
                        loading: _busy,
                        onPressed: rc.hasBluetoothPrinter && !_busy ? _testPrint : null,
                      ),
                    ),
                    if (rc.hasBluetoothPrinter) ...[
                      const SizedBox(width: PosSpacing.sm),
                      PosButton(
                        label: tr('Clear'),
                        variant: PosButtonVariant.outline,
                        expand: false,
                        onPressed: _busy ? null : _clear,
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: PosSpacing.lg),
          SectionLabel(tr('Paired devices')),
          if (_loading)
            const Padding(padding: EdgeInsets.symmetric(vertical: 40), child: LoadingView())
          else if (_devices.isEmpty)
            ErrorView(message: _error ?? tr('No paired devices'), onRetry: _refresh)
          else
            PosCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  for (final (i, d) in _devices.indexed) ...[
                    if (i > 0) Divider(height: 1, indent: 56, color: c.border.withValues(alpha: 0.6)),
                    ListTile(
                      leading: Icon(
                        Icons.print_rounded,
                        color: d.address == selected ? c.brand : c.textMuted,
                      ),
                      title: Text(d.name, style: PosType.bodyStrong.copyWith(color: c.text)),
                      subtitle: Text(d.address, style: PosType.caption.copyWith(color: c.textMuted)),
                      trailing: d.address == selected
                          ? Icon(Icons.check_circle_rounded, color: c.successText)
                          : Icon(Icons.radio_button_off_rounded, color: c.textSoft),
                      onTap: _busy ? null : () => _select(d),
                    ),
                  ],
                ],
              ),
            ),
          if (_error != null && _devices.isNotEmpty) ...[
            const SizedBox(height: PosSpacing.md),
            Text(_error!, style: PosType.caption.copyWith(color: c.dangerText)),
          ],
        ],
      ),
    );
  }
}
