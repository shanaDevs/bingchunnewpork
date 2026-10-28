import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/dev_config.dart';
import '../models/delivery_route.dart';
import '../providers/auth_provider.dart';
import '../providers/route_provider.dart';
import '../theme/bc_theme.dart';
import '../widgets/bc_button.dart';
import '../widgets/route_map.dart';
import '../widgets/stop_card.dart';

class RouteScreen extends ConsumerStatefulWidget {
  const RouteScreen({super.key});

  @override
  ConsumerState<RouteScreen> createState() => _RouteScreenState();
}

class _RouteScreenState extends ConsumerState<RouteScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(routeProvider.notifier).load());
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final routeState = ref.watch(routeProvider);
    final driver = auth.driver;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Today\'s Route', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            if (driver?.storeName != null)
              Text(
                driver!.storeName!,
                style: const TextStyle(fontSize: 12, color: BcColors.textMuted, fontWeight: FontWeight.w500),
              ),
          ],
        ),
        actions: [
          if (kUiPreviewMode)
            const Padding(
              padding: EdgeInsets.only(right: 4),
              child: Chip(
                label: Text('UI Preview', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600)),
                visualDensity: VisualDensity.compact,
                backgroundColor: BcColors.brandSubtle,
                side: BorderSide(color: BcColors.brand),
                labelStyle: TextStyle(color: BcColors.brandLight),
              ),
            ),
          IconButton(
            tooltip: 'Refresh route',
            onPressed: routeState.loading ? null : () => ref.read(routeProvider.notifier).load(),
            icon: routeState.loading
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.refresh_rounded),
          ),
          if (!kUiPreviewMode)
            IconButton(
              tooltip: 'Sign out',
              onPressed: () => ref.read(authProvider.notifier).logout(),
              icon: const Icon(Icons.logout_rounded),
            ),
        ],
      ),
      body: RefreshIndicator(
        color: BcColors.brand,
        onRefresh: () => ref.read(routeProvider.notifier).load(),
        child: _buildBody(routeState),
      ),
    );
  }

  Widget _buildBody(RouteState routeState) {
    if (routeState.loading && routeState.route == null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 180),
          Center(child: CircularProgressIndicator(color: BcColors.brand)),
          SizedBox(height: 12),
          Center(child: Text('Optimizing your delivery route…', style: TextStyle(color: BcColors.textMuted))),
        ],
      );
    }

    if (routeState.error != null && routeState.route == null) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: [
          const SizedBox(height: 80),
          const Icon(Icons.route_rounded, size: 56, color: BcColors.brand),
          const SizedBox(height: 16),
          Text(
            routeState.error!,
            textAlign: TextAlign.center,
            style: const TextStyle(color: Color(0xFFF87171)),
          ),
          const SizedBox(height: 20),
          BcButton(
            label: 'Try again',
            onPressed: () => ref.read(routeProvider.notifier).load(),
          ),
        ],
      );
    }

    final route = routeState.route;
    if (route == null) {
      return const SizedBox.shrink();
    }

    final firstStop = route.stops.isNotEmpty ? route.stops.first.sequence : null;

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        _SummaryBanner(summary: route.summary),
        const SizedBox(height: 14),
        MiniRouteMap(
          route: route,
          activeStopSequence: firstStop,
          onTap: () {},
        ),
        const SizedBox(height: 16),
        Row(
          children: [
            const Text('Stops', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const Spacer(),
            Text(
              '${route.summary.stopCount} deliveries',
              style: const TextStyle(color: BcColors.textMuted, fontSize: 13),
            ),
          ],
        ),
        const SizedBox(height: 10),
        if (route.stops.isEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  const Icon(Icons.local_shipping_outlined, size: 48, color: BcColors.brand),
                  const SizedBox(height: 12),
                  const Text(
                    'No deliveries ready right now',
                    style: TextStyle(fontWeight: FontWeight.w600),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Pull down to refresh when new READY or OUT_FOR_DELIVERY orders appear.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: BcColors.textMuted, fontSize: 13),
                  ),
                ],
              ),
            ),
          )
        else
          ...route.stops.map(
            (stop) => StopCard(
              stop: stop,
              isActive: stop.sequence == firstStop,
            ),
          ),
      ],
    );
  }
}

class _SummaryBanner extends StatelessWidget {
  final RouteSummary summary;

  const _SummaryBanner({required this.summary});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: BcTheme.brandGradient,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: BcColors.brand.withValues(alpha: 0.35),
            blurRadius: 20,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Row(
        children: [
          Expanded(
            child: _Stat(label: 'Stops', value: '${summary.stopCount}'),
          ),
          Expanded(
            child: _Stat(
              label: 'Distance',
              value: '${summary.totalDistanceKm.toStringAsFixed(1)} km',
            ),
          ),
          Expanded(
            child: _Stat(label: 'ETA', value: '${summary.estimatedMinutes} min'),
          ),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  final String label;
  final String value;

  const _Stat({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(
          value,
          style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Colors.white),
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: TextStyle(fontSize: 11, color: Colors.white.withValues(alpha: 0.85)),
        ),
      ],
    );
  }
}
