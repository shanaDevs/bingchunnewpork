import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../providers/jobs_provider.dart';
import '../theme/bc_theme.dart';
import '../widgets/bc_button.dart';
import '../widgets/job_status_chip.dart';
import '../widgets/route_map.dart';

class JobDetailScreen extends ConsumerWidget {
  final String jobId;

  const JobDetailScreen({super.key, required this.jobId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(jobDetailProvider(jobId));
    final job = state.job;

    return Scaffold(
      appBar: AppBar(title: const Text('Job details')),
      body: state.loading && job == null
          ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
          : job == null
              ? Center(child: Text(state.error ?? 'Job not found'))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(job.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                                ),
                                JobStatusChip(status: job.status),
                              ],
                            ),
                            const SizedBox(height: 12),
                            _row(Icons.storefront_rounded, job.store.name),
                            _row(Icons.schedule, DateFormat('EEE, MMM d · HH:mm').format(job.scheduledAt)),
                            _row(Icons.shopping_bag_outlined, '${job.orderCount} orders'),
                            if (job.assignedAt != null)
                              _row(Icons.person_pin_circle_outlined, 'Assigned ${DateFormat('HH:mm').format(job.assignedAt!)}'),
                          ],
                        ),
                      ),
                    ),
                    if (job.canAssign || job.isActive) ...[
                      const SizedBox(height: 16),
                      const Text('Route preview', style: TextStyle(fontWeight: FontWeight.w700)),
                      const SizedBox(height: 8),
                      if (state.routeLoading)
                        const SizedBox(
                          height: MiniRouteMap.height,
                          child: Center(child: CircularProgressIndicator(color: BcColors.brand)),
                        )
                      else if (state.route != null) ...[
                        _RouteSummary(summary: state.route!.summary),
                        const SizedBox(height: 12),
                        MiniRouteMap(
                          route: state.route!,
                          activeStopSequence: state.route!.stops.isNotEmpty ? state.route!.stops.first.sequence : null,
                          headingToStore: job.headingToStore,
                          onTap: () => context.push('/jobs/$jobId/map'),
                        ),
                      ],
                    ],
                    const SizedBox(height: 16),
                    const Text('Orders in this job', style: TextStyle(fontWeight: FontWeight.w700)),
                    const SizedBox(height: 8),
                    ...job.orders.map(
                      (o) => Card(
                        margin: const EdgeInsets.only(bottom: 8),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: BcColors.brandSubtle,
                            child: Text('${o.sequence}', style: const TextStyle(color: BcColors.brand, fontWeight: FontWeight.w700)),
                          ),
                          title: Text(o.orderNumber, style: const TextStyle(fontWeight: FontWeight.w600)),
                          subtitle: Text('${o.customerName} · ${o.fullAddress}'),
                          trailing: Text('LKR ${o.total}', style: const TextStyle(fontWeight: FontWeight.w600, color: BcColors.brandLight)),
                        ),
                      ),
                    ),
                    if (state.error != null) ...[
                      const SizedBox(height: 8),
                      Text(state.error!, style: const TextStyle(color: Color(0xFFF87171))),
                    ],
                    const SizedBox(height: 16),
                    if (job.canAssign)
                      BcButton(
                        label: state.acting ? 'Assigning…' : 'Assign job to me',
                        loading: state.acting,
                        onPressed: () async {
                          final assigned = await ref.read(jobDetailProvider(jobId).notifier).assign();
                          if (assigned != null && context.mounted) {
                            context.go('/dashboard/$jobId');
                          }
                        },
                      ),
                    if (job.needsPickup)
                      BcButton(
                        label: state.acting ? 'Confirming…' : 'Confirm pickup at outlet',
                        loading: state.acting,
                        onPressed: () async {
                          await ref.read(jobDetailProvider(jobId).notifier).pickup();
                        },
                      ),
                    if (job.canStart)
                      BcButton(
                        label: state.acting ? 'Starting…' : 'Start delivery run',
                        loading: state.acting,
                        onPressed: () async {
                          final started = await ref.read(jobDetailProvider(jobId).notifier).start();
                          if (started != null && context.mounted) {
                            context.go('/dashboard/$jobId');
                          }
                        },
                      ),
                    if (job.isActive)
                      Padding(
                        padding: EdgeInsets.only(top: job.needsPickup || job.canStart || job.canAssign ? 8 : 0),
                        child: BcButton(
                          label: 'Open dashboard',
                          onPressed: () => context.go('/dashboard/$jobId'),
                        ),
                      ),
                  ],
                ),
    );
  }

  Widget _row(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Icon(icon, size: 16, color: BcColors.textMuted),
          const SizedBox(width: 8),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13))),
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
