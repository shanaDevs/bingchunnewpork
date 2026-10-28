import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../config/dev_config.dart';
import '../providers/auth_provider.dart';
import '../providers/jobs_provider.dart';
import '../theme/bc_theme.dart';
import '../widgets/job_card.dart';

class JobsScreen extends ConsumerStatefulWidget {
  const JobsScreen({super.key});

  @override
  ConsumerState<JobsScreen> createState() => _JobsScreenState();
}

class _JobsScreenState extends ConsumerState<JobsScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(jobsListProvider.notifier).load());
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authProvider);
    final state = ref.watch(jobsListProvider);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Delivery Jobs', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            if (auth.driver?.storeName != null)
              Text(
                auth.driver!.storeName!,
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
            onPressed: state.loading ? null : () => ref.read(jobsListProvider.notifier).load(),
            icon: const Icon(Icons.refresh_rounded),
          ),
          if (!kUiPreviewMode)
            IconButton(
              onPressed: () async {
                await ref.read(authProvider.notifier).logout();
                if (context.mounted) context.go('/login');
              },
              icon: const Icon(Icons.logout_rounded),
            ),
        ],
      ),
      body: RefreshIndicator(
        color: BcColors.brand,
        onRefresh: () => ref.read(jobsListProvider.notifier).load(),
        child: _buildBody(state),
      ),
    );
  }

  Widget _buildBody(JobsListState state) {
    if (state.loading && state.jobs.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        children: const [
          SizedBox(height: 160),
          Center(child: CircularProgressIndicator(color: BcColors.brand)),
        ],
      );
    }

    if (state.error != null && state.jobs.isEmpty) {
      return ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(20),
        children: [
          Text(state.error!, textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFFF87171))),
        ],
      );
    }

    final myJobs = state.jobs.where((j) => j.isMine).toList();
    final available = state.jobs.where((j) => !j.isMine).toList();

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      children: [
        if (myJobs.isNotEmpty) ...[
          const Text('My active job', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 8),
          ...myJobs.map(
            (job) => JobCard(
              job: job,
              onTap: () {
                if (job.status == 'IN_PROGRESS' || job.status == 'ASSIGNED') {
                  context.push('/dashboard/${job.id}');
                } else {
                  context.push('/jobs/${job.id}');
                }
              },
            ),
          ),
          const SizedBox(height: 16),
        ],
        const Text('Scheduled jobs', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
        const SizedBox(height: 4),
        const Text(
          'Tap a job to view details and assign it to yourself.',
          style: TextStyle(color: BcColors.textMuted, fontSize: 12),
        ),
        const SizedBox(height: 10),
        if (available.isEmpty)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                children: [
                  Icon(Icons.delivery_dining_rounded, size: 48, color: BcColors.brand.withValues(alpha: 0.7)),
                  const SizedBox(height: 10),
                  const Text('No scheduled jobs right now', style: TextStyle(fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  const Text(
                    'Pull down to refresh when new jobs are created.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: BcColors.textMuted, fontSize: 13),
                  ),
                ],
              ),
            ),
          )
        else
          ...available.map(
            (job) => JobCard(
              job: job,
              onTap: () => context.push('/jobs/${job.id}'),
            ),
          ),
      ],
    );
  }
}
