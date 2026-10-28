import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/delivery_route.dart';
import '../theme/bc_theme.dart';
import 'bc_button.dart';

class StopCard extends StatelessWidget {
  final RouteStop stop;
  final bool isActive;

  const StopCard({super.key, required this.stop, this.isActive = false});

  Future<void> _openMaps() async {
    final uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}',
    );
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  Future<void> _callCustomer() async {
    if (stop.customerPhone.isEmpty) return;
    final uri = Uri.parse('tel:${stop.customerPhone}');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    }
  }

  @override
  Widget build(BuildContext context) {
    final currency = NumberFormat.currency(symbol: 'LKR ', decimalDigits: 0);

    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(
          color: isActive ? BcColors.brand : BcColors.navyBorder,
          width: isActive ? 1.5 : 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    gradient: isActive ? BcTheme.brandGradient : null,
                    color: isActive ? null : BcColors.brandSubtle,
                    shape: BoxShape.circle,
                  ),
                  alignment: Alignment.center,
                  child: Text(
                    '${stop.sequence}',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: isActive ? Colors.white : BcColors.brand,
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        stop.orderNumber,
                        style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                      ),
                      Text(
                        stop.customerName,
                        style: const TextStyle(color: BcColors.textMuted, fontSize: 13),
                      ),
                    ],
                  ),
                ),
                _StatusChip(status: stop.status),
              ],
            ),
            const SizedBox(height: 10),
            Text(
              stop.fullAddress,
              style: const TextStyle(fontSize: 13, height: 1.4),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                _Meta(icon: Icons.shopping_bag_outlined, label: '${stop.itemCount} items'),
                const SizedBox(width: 12),
                _Meta(icon: Icons.payments_outlined, label: currency.format(stop.total)),
                const Spacer(),
                if (stop.distanceFromPreviousKm > 0)
                  _Meta(
                    icon: Icons.route_outlined,
                    label: '${stop.distanceFromPreviousKm.toStringAsFixed(1)} km · ${stop.etaMinutesFromPrevious} min',
                  ),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: BcOutlineButton(label: 'Navigate', icon: Icons.navigation_rounded, onPressed: _openMaps),
                ),
                const SizedBox(width: 8),
                if (stop.customerPhone.isNotEmpty)
                  IconButton.filledTonal(
                    onPressed: _callCustomer,
                    icon: const Icon(Icons.phone_rounded, size: 20),
                    style: IconButton.styleFrom(
                      backgroundColor: BcColors.brandSubtle,
                      foregroundColor: BcColors.brand,
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final color = status == 'OUT_FOR_DELIVERY' ? BcColors.accent : BcColors.brandLight;
    final label = status == 'OUT_FOR_DELIVERY' ? 'On route' : 'Ready';

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: color),
      ),
    );
  }
}

class _Meta extends StatelessWidget {
  final IconData icon;
  final String label;

  const _Meta({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 14, color: BcColors.textMuted),
        const SizedBox(width: 4),
        Text(label, style: const TextStyle(fontSize: 12, color: BcColors.textMuted)),
      ],
    );
  }
}
