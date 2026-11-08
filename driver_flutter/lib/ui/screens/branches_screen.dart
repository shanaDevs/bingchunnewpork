import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../data/models/driver.dart';
import '../../l10n/l10n.dart';
import '../../state/auth_controller.dart';
import '../../state/jobs_controller.dart';
import '../components/profile_kit.dart';
import '../components/qd_kit.dart';
import '../theme/bc_theme.dart';
import 'job_sheets.dart';

/// Branch management (QuickDrop branches/index.tsx): assigned branches, the request
/// button and the request history.
class BranchesScreen extends StatefulWidget {
  const BranchesScreen({super.key});

  @override
  State<BranchesScreen> createState() => _BranchesScreenState();
}

class _BranchesScreenState extends State<BranchesScreen> with WidgetsBindingObserver {
  List<DriverBranchRequest> _requests = const [];
  bool _loading = true;
  // Admin review sends no socket/push event, so poll while a request is pending.
  static const _pendingPollInterval = Duration(seconds: 20);
  Timer? _pendingPoll;
  // Guards against repeated taps while the branch list loads or the sheet is open.
  bool _busy = false;

  static bool _isPending(DriverBranchRequest r) => r.status.toUpperCase() == 'PENDING';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadRequests();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pendingPoll?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _loadRequests();
    } else if (state == AppLifecycleState.paused) {
      _pendingPoll?.cancel();
    }
  }

  Future<void> _loadRequests() async {
    final vm = context.read<JobsController>();
    try {
      final list = await vm.listMyBranchRequests();
      if (!mounted) return;
      final wasPending = _requests.where(_isPending).map((r) => r.id).toSet();
      final reviewed = list.any((r) => wasPending.contains(r.id) && !_isPending(r));
      setState(() {
        _requests = list;
        _loading = false;
      });
      // An approval changes the rider's branches/home, so refresh the profile too.
      if (reviewed) vm.load();
      _pendingPoll?.cancel();
      if (list.any(_isPending)) _pendingPoll = Timer(_pendingPollInterval, _loadRequests);
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _requestChange(JobsController vm, AuthController auth) async {
    if (_busy) return;
    _busy = true;
    try {
      final messenger = ScaffoldMessenger.of(context);
      final branches = riderBranches(vm, auth);
      List<BranchOption> stores;
      try {
        final fromApi = await vm.listStoresForBranchRequest();
        final known = branches.map((b) => BranchOption(id: b.id, name: b.name, city: b.city));
        final seen = <String>{};
        stores = [...fromApi, ...known].where((s) => s.id.trim().isNotEmpty && seen.add(s.id)).toList();
      } catch (e) {
        BcFeedback.error();
        messenger.showSnackBar(SnackBar(content: Text('$e'.isEmpty ? tr('Could not load branches') : '$e')));
        return;
      }
      if (!mounted) return;
      final submitted = await showBranchRequestSheet(
        context,
        stores: stores,
        accessibleStoreIds: branches.map((b) => b.id).where((id) => id.trim().isNotEmpty).toSet(),
        homeStoreId: vm.profile?.storeId ?? auth.driver?.storeId,
        onSubmit: (type, toStoreId, reason) => vm.createBranchRequest(type, toStoreId, reason),
      );
      if (submitted) {
        BcFeedback.success();
        _loadRequests();
      }
    } finally {
      _busy = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final vm = context.watch<JobsController>();
    final auth = context.watch<AuthController>();
    final branches = riderBranches(vm, auth);
    final homeId = vm.profile?.storeId ?? auth.driver?.storeId;
    final pending = _requests.any(_isPending);

    return QdPage(
      title: tr('Branch management'),
      onRefresh: () => Future.wait([vm.load(), _loadRequests()]),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.info_outline_rounded, size: 20, color: c.primary),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                tr('You only receive jobs from these branches.'),
                style: TextStyle(fontSize: 14, color: c.mutedForeground, height: 1.4),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        for (var i = 0; i < branches.length; i++) ...[
          _BranchCard(branch: branches[i], primary: branches[i].id.isNotEmpty ? branches[i].id == homeId : i == 0),
          const SizedBox(height: 12),
        ],
        if (branches.isEmpty)
          QdEmpty(icon: Icons.storefront_outlined, title: tr('No branches assigned yet')),
        const SizedBox(height: 4),
        QdPillButton(
          label: tr('Request branch change'),
          icon: Icons.swap_horiz_rounded,
          onPressed: pending ? null : () => _requestChange(vm, auth),
        ),
        if (pending)
          Padding(
            padding: const EdgeInsets.only(top: 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.schedule_rounded, size: 16, color: c.warningStrong),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    tr('You have a branch change request waiting for a decision.'),
                    style: TextStyle(fontSize: 13, color: c.warningStrong),
                  ),
                ),
              ],
            ),
          ),
        QdSectionTitle(tr('Request history')),
        if (_loading)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator(color: c.primary)),
          )
        else if (_requests.isEmpty)
          Text(tr('No branch change requests yet.'), style: TextStyle(fontSize: 14, color: c.mutedForeground))
        else
          for (final r in _requests) ...[_RequestCard(r), const SizedBox(height: 10)],
      ],
    );
  }
}

class _BranchCard extends StatelessWidget {
  const _BranchCard({required this.branch, required this.primary});
  final StoreRef branch;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    return QdCard(
      child: Row(
        children: [
          const QdIconTile(Icons.storefront_outlined),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  Format.shortBranchName(branch.name),
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: c.foreground),
                ),
                if (nonBlank(branch.city) != null) ...[
                  const SizedBox(height: 2),
                  Text(branch.city!, style: TextStyle(fontSize: 13, color: c.mutedForeground)),
                ],
                if (primary) ...[
                  const SizedBox(height: 8),
                  QdBadge(tr('Primary'), tone: QdTone.primary),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RequestCard extends StatelessWidget {
  const _RequestCard(this.req);
  final DriverBranchRequest req;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final s = req.status.toUpperCase();
    final (label, tone) = switch (s) {
      'APPROVED' => (tr('Approved'), QdTone.success),
      'REJECTED' => (tr('Rejected'), QdTone.error),
      'PENDING' => (tr('Pending'), QdTone.warning),
      _ => (s.isEmpty ? s : s[0] + s.substring(1).toLowerCase(), QdTone.neutral),
    };
    final note = req.reviewNote?.trim();
    final rejectionReason = s == 'REJECTED' && note != null && note.isNotEmpty ? note : null;
    return QdCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${req.type} · ${req.toStoreName ?? req.toStoreId}',
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground),
                ),
              ),
              const SizedBox(width: 8),
              QdBadge(label, tone: tone, dot: true),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            tr('Submitted {time}', {'time': Format.jobDateTime(req.createdAt)}),
            style: TextStyle(fontSize: 13, color: c.mutedForeground),
          ),
          if (rejectionReason != null) ...[
            const SizedBox(height: 8),
            Text(
              tr('Reason: {reason}', {'reason': rejectionReason}),
              style: TextStyle(fontSize: 13, height: 1.35, color: c.errorStrong),
            ),
          ],
        ],
      ),
    );
  }
}
