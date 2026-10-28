import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/delivery_job.dart';
import '../providers/jobs_provider.dart';
import '../theme/bc_theme.dart';
import '../widgets/bc_button.dart';
import '../widgets/job_status_chip.dart';
import '../widgets/route_map.dart';

class DashboardScreen extends ConsumerWidget {
  final String jobId;

  const DashboardScreen({super.key, required this.jobId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(dashboardProvider(jobId));
    final job = state.job;
    final route = state.route;

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Delivery Dashboard', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            if (job != null)
              Text(job.title, style: const TextStyle(fontSize: 12, color: BcColors.textMuted)),
          ],
        ),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_rounded),
          onPressed: () => context.go('/jobs'),
        ),
        actions: [
          if (job != null) JobStatusChip(status: job.status),
          const SizedBox(width: 8),
        ],
      ),
      body: state.loading && job == null
          ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
          : job == null
              ? Center(child: Text(state.error ?? 'Job not found'))
              : RefreshIndicator(
                  color: BcColors.brand,
                  onRefresh: () => ref.read(dashboardProvider(jobId).notifier).load(),
                  child: ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                    children: [
                      _ProgressCard(job: job),
                      const SizedBox(height: 14),
                      if (job.needsPickup) ...[
                        BcButton(
                          label: state.acting ? 'Confirming…' : 'Confirm pickup at outlet',
                          loading: state.acting,
                          onPressed: () => ref.read(dashboardProvider(jobId).notifier).pickup(),
                        ),
                        const SizedBox(height: 14),
                      ],
                      if (job.canStart) ...[
                        BcButton(
                          label: state.acting ? 'Starting…' : 'Start delivery run',
                          loading: state.acting,
                          onPressed: () => ref.read(dashboardProvider(jobId).notifier).start(),
                        ),
                        const SizedBox(height: 14),
                      ],
                      if (route != null && job.isActive) ...[
                        _RouteSummary(summary: route.summary),
                        const SizedBox(height: 12),
                        MiniRouteMap(
                          route: route,
                          activeStopSequence: route.stops.isNotEmpty ? route.stops.first.sequence : null,
                          headingToStore: job.headingToStore,
                          onTap: () => context.push('/dashboard/$jobId/map'),
                        ),
                        const SizedBox(height: 16),
                      ],
                      Row(
                        children: [
                          const Text('Orders', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                          const Spacer(),
                          Text(
                            '${job.deliveredCount}/${job.orderCount} delivered',
                            style: const TextStyle(color: BcColors.textMuted, fontSize: 13),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      ...job.orders.map((order) => _OrderTile(
                            order: order,
                            onTap: () => context.push('/jobs/$jobId/orders/${order.orderId}'),
                          )),
                      if (state.error != null) ...[
                        const SizedBox(height: 10),
                        Text(state.error!, style: const TextStyle(color: Color(0xFFF87171))),
                      ],
                      if (job.canComplete) ...[
                        const SizedBox(height: 16),
                        BcButton(
                          label: state.acting ? 'Completing…' : 'Complete job',
                          loading: state.acting,
                          onPressed: () async {
                            final ok = await ref.read(dashboardProvider(jobId).notifier).complete();
                            if (ok && context.mounted) {
                              ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(content: Text('Job completed! Pick another job.')),
                              );
                              context.go('/jobs');
                            }
                          },
                        ),
                      ],
                    ],
                  ),
                ),
    );
  }
}

class _ProgressCard extends StatelessWidget {
  final DeliveryJobDetail job;

  const _ProgressCard({required this.job});

  @override
  Widget build(BuildContext context) {
    final progress = job.orderCount == 0 ? 0.0 : job.deliveredCount / job.orderCount;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: BcTheme.brandGradient,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(job.store.name, style: const TextStyle(fontWeight: FontWeight.w700, color: Colors.white)),
          const SizedBox(height: 10),
          ClipRRect(
            borderRadius: BorderRadius.circular(999),
            child: LinearProgressIndicator(
              value: progress,
              minHeight: 8,
              backgroundColor: Colors.white24,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            '${job.deliveredCount} of ${job.orderCount} orders delivered',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.9), fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _RouteSummary extends StatelessWidget {
  final dynamic summary;

  const _RouteSummary({required this.summary});

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        _chip('${summary.stopCount} stops'),
        const SizedBox(width: 8),
        _chip('${summary.totalDistanceKm.toStringAsFixed(1)} km'),
        const SizedBox(width: 8),
        _chip('${summary.estimatedMinutes} min ETA'),
      ],
    );
  }

  Widget _chip(String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: BcColors.brandSubtle,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: BcColors.brandLight)),
    );
  }
}

class _OrderTile extends StatelessWidget {
  final JobOrder order;
  final VoidCallback onTap;

  const _OrderTile({required this.order, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final done = order.isDelivered;
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        onTap: onTap,
        leading: CircleAvatar(
          backgroundColor: done ? BcColors.success.withValues(alpha: 0.2) : BcColors.brandSubtle,
          child: Icon(
            done ? Icons.check_rounded : Icons.local_shipping_outlined,
            color: done ? BcColors.success : BcColors.brand,
            size: 20,
          ),
        ),
        title: Text(order.orderNumber, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('${order.customerName} · ${order.status.replaceAll('_', ' ')}'),
        trailing: const Icon(Icons.chevron_right_rounded, color: BcColors.textMuted),
      ),
    );
  }
}
