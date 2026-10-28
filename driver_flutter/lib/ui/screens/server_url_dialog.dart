import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/endpoints.dart';
import '../../core/runtime_config.dart';
import '../components/bc_dialog.dart';
import '../components/buttons.dart';
import '../components/inputs.dart';
import '../theme/bc_theme.dart';

/// Hidden developer dialog — opened after tapping the login logo 5 times.
/// Lets you point the app at a different LAN / staging host without rebuilding.
/// Port of ServerUrlDialog.kt.
class ServerUrlDialog extends StatefulWidget {
  const ServerUrlDialog({super.key});

  @override
  State<ServerUrlDialog> createState() => _ServerUrlDialogState();
}

class _ServerUrlDialogState extends State<ServerUrlDialog> {
  late final _core = TextEditingController(text: _trim(AppConfig.coreApiBaseUrl));
  late final _delivery = TextEditingController(text: _trim(AppConfig.deliveryApiBaseUrl));
  late final _store = TextEditingController(text: AppConfig.storeId ?? '');
  String? _error;

  static String _trim(String s) => s.endsWith('/') ? s.substring(0, s.length - 1) : s;

  static bool _looksLikeUrl(String v) => v.startsWith('http://') || v.startsWith('https://');

  static String _normalize(String raw, String expectedPath) {
    var v = raw.trim();
    while (v.endsWith('/')) {
      v = v.substring(0, v.length - 1);
    }
    if (expectedPath == 'delivery-api' && v.endsWith('/delivery-ap')) {
      v = '${v.substring(0, v.length - '/delivery-ap'.length)}/delivery-api';
    }
    return v;
  }

  @override
  void dispose() {
    _core.dispose();
    _delivery.dispose();
    _store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final container = context.read<AppContainer>();
    return BcDialog(
      icon: Icons.dns_outlined,
      title: 'Server URLs',
      message: 'Point this debug build at your PC. USB uses 127.0.0.1 through adb reverse. Wi‑Fi only works on the same network.',
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          BcTextField(controller: _core, label: 'Core API', onChanged: (_) => setState(() => _error = null)),
          const SizedBox(height: 10),
          BcTextField(controller: _delivery, label: 'Delivery API', onChanged: (_) => setState(() => _error = null)),
          const SizedBox(height: 10),
          BcTextField(controller: _store, label: 'Store ID (optional)'),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!, style: BcType.caption.copyWith(color: c.danger)),
          ],
          const SizedBox(height: 10),
          // Quick fill from endpoints.dart — Localhost (this PC via adb reverse) or Hosted (production).
          Row(
            children: [
              Expanded(
                child: BcOutlineButton(
                  label: 'Localhost',
                  icon: Icons.computer_rounded,
                  expand: true,
                  onPressed: () => setState(() {
                    _core.text = Endpoints.localCore;
                    _delivery.text = Endpoints.localDelivery;
                    _error = null;
                  }),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: BcOutlineButton(
                  label: 'Hosted',
                  icon: Icons.cloud_outlined,
                  expand: true,
                  onPressed: () => setState(() {
                    _core.text = Endpoints.productionCore;
                    _delivery.text = Endpoints.productionDelivery;
                    _error = null;
                  }),
                ),
              ),
            ],
          ),
        ],
      ),
      extraActions: [
        BcTextButton(
          label: 'Reset',
          onPressed: () async {
            await container.resetServerUrlsToDefaults();
            setState(() {
              _core.text = BuildDefaults.coreApiBaseUrl;
              _delivery.text = BuildDefaults.deliveryApiBaseUrl;
              _store.text = BuildDefaults.storeId;
              _error = null;
            });
          },
        ),
      ],
      secondaryLabel: 'Cancel',
      onSecondary: () => Navigator.of(context).pop(),
      primaryLabel: 'Save',
      onPrimary: () {
        final core = _normalize(_core.text, 'api');
        final delivery = _normalize(_delivery.text, 'delivery-api');
        if (!_looksLikeUrl(core) || !_looksLikeUrl(delivery)) {
          setState(() => _error = 'Enter valid http(s) URLs for both APIs.');
          return;
        }
        final store = _store.text.trim();
        container.applyServerUrls(core, delivery, store.isEmpty ? null : store);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('URLs saved')));
        Navigator.of(context).pop();
      },
    );
  }
}
