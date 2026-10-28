import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/delivery_route.dart';
import '../providers/jobs_provider.dart';
import '../theme/bc_theme.dart';
import '../widgets/route_map.dart';

class RouteMapScreen extends ConsumerWidget {
  final String jobId;

  const RouteMapScreen({super.key, required this.jobId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dash = ref.watch(dashboardProvider(jobId));
    final detail = ref.watch(jobDetailProvider(jobId));
    final state = ref.watch(jobRouteProvider(jobId));
    final route = dash.route ?? detail.route ?? state.route;
    final loading = route == null && (state.loading || dash.loading || detail.loading);

    return Scaffold(
      body: loading
          ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
          : route == null
              ? _ErrorBody(message: state.error ?? 'Route not available', onBack: () => context.pop())
              : Stack(
                  fit: StackFit.expand,
                  children: [
                    RouteMap(
                      route: route,
                      activeStopSequence: route.stops.isNotEmpty ? route.stops.first.sequence : null,
                      headingToStore: (dash.job ?? detail.job)?.headingToStore == true,
                    ),
                    SafeArea(
                      child: Padding(
                        padding: const EdgeInsets.fromLTRB(8, 8, 8, 0),
                        child: Align(
                          alignment: Alignment.topLeft,
                          child: _MapIconButton(
                            icon: Icons.arrow_back_rounded,
                            onPressed: () => context.pop(),
                          ),
                        ),
                      ),
                    ),
                    SafeArea(
                      child: Align(
                        alignment: Alignment.bottomCenter,
                        child: _RouteSummaryPanel(route: route),
                      ),
                    ),
                  ],
                ),
    );
  }
}

class _ErrorBody extends StatelessWidget {
  final String message;
  final VoidCallback onBack;

  const _ErrorBody({required this.message, required this.onBack});

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Column(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              icon: const Icon(Icons.arrow_back_rounded),
              onPressed: onBack,
            ),
          ),
          Expanded(
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Text(message, textAlign: TextAlign.center, style: const TextStyle(color: BcColors.textMuted)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _MapIconButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onPressed;

  const _MapIconButton({required this.icon, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: BcColors.navyCard.withValues(alpha: 0.92),
      shape: const CircleBorder(),
      clipBehavior: Clip.antiAlias,
      child: IconButton(
        icon: Icon(icon, color: Colors.white),
        onPressed: onPressed,
      ),
    );
  }
}

class _RouteSummaryPanel extends StatelessWidget {
  final DeliveryRoute route;

  const _RouteSummaryPanel({required this.route});

  @override
  Widget build(BuildContext context) {
    final summary = route.summary;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: BcColors.navyCard.withValues(alpha: 0.94),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: BcColors.navyBorder),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withValues(alpha: 0.25),
              blurRadius: 16,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(route.store.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
              const SizedBox(height: 10),
              Row(
                children: [
                  _StatChip(icon: Icons.pin_drop_outlined, label: '${summary.stopCount} stops'),
                  const SizedBox(width: 8),
                  _StatChip(icon: Icons.route_rounded, label: '${summary.totalDistanceKm.toStringAsFixed(1)} km'),
                  const SizedBox(width: 8),
                  _StatChip(icon: Icons.schedule_rounded, label: '${summary.estimatedMinutes} min'),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  final IconData icon;
  final String label;

  const _StatChip({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        decoration: BoxDecoration(
          color: BcColors.brandSubtle,
          borderRadius: BorderRadius.circular(10),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 14, color: BcColors.brandLight),
            const SizedBox(width: 4),
            Flexible(
              child: Text(
                label,
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: BcColors.brandLight),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
