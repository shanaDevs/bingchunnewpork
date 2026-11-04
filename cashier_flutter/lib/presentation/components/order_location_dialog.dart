import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../domain/entities/delivery.dart';
import '../../l10n/l10n.dart';
import '../theme/pos_theme.dart';
import 'buttons.dart';
import 'delivery_map.dart';

/// Whether a delivery order can be shown on a map (web hasDeliveryMapLocation).
bool hasMapLocation(GeoPoint? at, String address) => at != null || address.trim().isNotEmpty;

/// Delivery spot for one order — web AdminDeliveryLocationModal. Pins the
/// coordinates on OpenStreetMap; address-only orders open in Google Maps.
Future<void> showOrderLocation(
  BuildContext context, {
  required String orderNumber,
  required String address,
  GeoPoint? at,
}) {
  return showDialog<void>(
    context: context,
    builder: (ctx) {
      final c = ctx.pos;
      final size = MediaQuery.sizeOf(ctx);
      final query = at != null ? '${at.lat},${at.lng}' : address;
      return Dialog(
        backgroundColor: c.card,
        surfaceTintColor: Colors.transparent,
        insetPadding: const EdgeInsets.all(PosSpacing.lg),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        clipBehavior: Clip.antiAlias,
        child: ConstrainedBox(
          constraints: BoxConstraints(maxWidth: 560, maxHeight: size.height * 0.8),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(PosSpacing.lg, PosSpacing.md, PosSpacing.sm, PosSpacing.sm),
                child: Row(
                  children: [
                    Icon(Icons.place_outlined, color: c.brand, size: 20),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(orderNumber, style: PosType.section.copyWith(color: c.text)),
                          if (address.isNotEmpty) Text(address, style: PosType.caption.copyWith(color: c.textMuted)),
                        ],
                      ),
                    ),
                    IconButton(
                      tooltip: tr('Close'),
                      onPressed: () => Navigator.pop(ctx),
                      icon: Icon(Icons.close_rounded, color: c.textMuted),
                    ),
                  ],
                ),
              ),
              if (at != null)
                SizedBox(
                  height: (size.height * 0.45).clamp(240.0, 420.0),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: PosSpacing.md),
                    child: DeliveryMap(
                      pins: [MapPin(at: at, kind: MapPinKind.stop, label: '•')],
                    ),
                  ),
                ),
              Padding(
                padding: const EdgeInsets.all(PosSpacing.md),
                child: PosButton(
                  label: tr('Open in Google Maps'),
                  icon: Icons.map_outlined,
                  variant: PosButtonVariant.outline,
                  onPressed: () => launchUrl(
                    Uri.https('www.google.com', '/maps/search/', {'api': '1', 'query': query}),
                    mode: LaunchMode.externalApplication,
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    },
  );
}
