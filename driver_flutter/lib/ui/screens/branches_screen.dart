import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../data/models/driver.dart';
import '../../l10n/l10n.dart';
import '../../state/auth_controller.dart';
import '../../state/jobs_controller.dart';
import '../components/call_confirm.dart';
import '../components/job_cards.dart';
import '../components/profile_kit.dart';
import '../components/qd_kit.dart';
import '../theme/bc_theme.dart';
import 'branch_request_screen.dart';

/// QuickDrop "Branches": the rider's assigned branches (read-only), the request-change
/// button and the history of requests with support's decisions.
class BranchesScreen extends StatefulWidget {
  const BranchesScreen({super.key});

  @override
  State<BranchesScreen> createState() => _BranchesScreenState();
}

class _BranchesScreenState extends State<BranchesScreen> with WidgetsBindingObserver {
  List<DriverBranchRequest> _requests = const [];
  List<BranchOption> _stores = const [];
  bool _loading = true;
  // Admin review sends no socket/push event, so poll while a request is pending.
  static const _pendingPollInterval = Duration(seconds: 20);
  Timer? _pendingPoll;
  // Guards against repeated taps while the branch list loads or the screen is open.
  bool _busy = false;

  static bool _isPending(DriverBranchRequest r) => r.status.toUpperCase() == 'PENDING';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadRequests();
    _loadStores();
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

  Future<void> _loadStores() async {
    try {
      final list = await context.read<JobsController>().listStoresForBranchRequest();
      if (mounted) setState(() => _stores = list);
    } catch (_) {
      // Cards fall back to the name and city from the profile.
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
      var stores = _stores;
      if (stores.isEmpty) {
        try {
          stores = await vm.listStoresForBranchRequest();
          if (mounted) setState(() => _stores = stores);
        } catch (e) {
          BcFeedback.error();
          messenger.showSnackBar(SnackBar(content: Text('$e'.isEmpty ? tr('Could not load branches') : '$e')));
          return;
        }
      }
      if (!mounted) return;
      final submitted = await BranchRequestScreen.open(
        context,
        assigned: branches,
        stores: stores.where((s) => s.id.trim().isNotEmpty).toList(),
        homeStoreId: vm.profile?.storeId ?? auth.driver?.storeId,
        onSubmit: (type, toStoreId, reason, fromStoreId) =>
            vm.createBranchRequest(type, toStoreId, reason, fromStoreId: fromStoreId),
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

    BranchOption? detail(StoreRef b) {
      for (final s in _stores) {
        if (s.id == b.id) return s;
      }
      return null;
    }

    return QdPage(
      title: tr('Branches'),
      onRefresh: () => Future.wait([vm.load(), _loadRequests(), _loadStores()]),
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
          _BranchCard(
            branch: branches[i],
            detail: detail(branches[i]),
            primary: branches[i].id.isNotEmpty ? branches[i].id == homeId : i == 0,
          ),
          const SizedBox(height: 10),
        ],
        if (branches.isEmpty)
          BcEmptyState(
            compact: true,
            icon: Icons.storefront_outlined,
            title: tr('No branches assigned yet'),
            message: tr('Request a branch below and an admin will review it.'),
          ),
        const SizedBox(height: 10),
        PillButton(
          label: tr('Request branch change'),
          icon: Icons.swap_horiz_rounded,
          height: 56,
          onTap: pending ? null : () => _requestChange(vm, auth),
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
        QdSectionTitle(tr('Request History')),
        if (_loading)
          Padding(
            padding: const EdgeInsets.all(24),
            child: Center(child: CircularProgressIndicator(color: c.primary)),
          )
        else if (_requests.isEmpty)
          BcEmptyState(
            compact: true,
            tone: BcEmptyTone.neutral,
            icon: Icons.swap_horiz_rounded,
            title: tr('No branch change requests yet.'),
          )
        else
          for (final r in _requests) ...[_RequestCard(r), const SizedBox(height: 10)],
      ],
    );
  }
}

/// "Thu, Oct 15 8:54 PM".
String _when(String? iso) {
  if (iso == null || iso.isEmpty) return '';
  try {
    return DateFormat('EEE, MMM d h:mm a').format(DateTime.parse(iso).toLocal());
  } catch (_) {
    return Format.jobDateTime(iso);
  }
}

class _BranchCard extends StatelessWidget {
  const _BranchCard({required this.branch, required this.detail, required this.primary});
  final StoreRef branch;
  final BranchOption? detail;
  final bool primary;

  @override
  Widget build(BuildContext context) {
    final c = context.bc;
    final open = detail?.isActive ?? true;
    final city = nonBlank(detail?.city) ?? nonBlank(branch.city);
    final street = nonBlank(detail?.addressLine);
    final address = [?street, ?city].join(', ');
    final phone = nonBlank(detail?.phone);
    return QdCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: c.primarySoft, borderRadius: BorderRadius.circular(BcRadius.md)),
                child: Icon(Icons.storefront_outlined, color: c.primaryStrong, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      branch.name,
                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: c.foreground),
                    ),
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        if (primary) QdBadge(tr('Primary'), tone: QdTone.primary),
                        QdBadge(open ? tr('Open') : tr('Closed'), tone: open ? QdTone.success : QdTone.neutral, dot: true),
                      ],
                    ),
                  ],
                ),
              ),
              if (phone != null)
                Material(
                  color: c.primarySoft,
                  shape: const CircleBorder(),
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: () => confirmAndCall(context, name: branch.name, phone: phone),
                    child: Tooltip(
                      message: tr('Call branch'),
                      child: SizedBox(width: 44, height: 44, child: Icon(Icons.call_outlined, color: c.primaryStrong, size: 22)),
                    ),
                  ),
                ),
            ],
          ),
          if (address.isNotEmpty || phone != null) const SizedBox(height: 12),
          if (address.isNotEmpty)
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.location_on_outlined, size: 18, color: c.mutedForeground),
                const SizedBox(width: 8),
                Expanded(child: Text(address, style: TextStyle(fontSize: 14, color: c.mutedForeground, height: 1.35))),
              ],
            ),
          if (address.isNotEmpty && phone != null) const SizedBox(height: 6),
          if (phone != null)
            Row(
              children: [
                Icon(Icons.call_outlined, size: 18, color: c.mutedForeground),
                const SizedBox(width: 8),
                Text(Format.lkMobileDisplay(phone), style: TextStyle(fontSize: 14, color: c.mutedForeground)),
              ],
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
    final to = req.toStoreName ?? req.toStoreId;
    final from = nonBlank(req.fromStoreName);
    final title = from == null ? to : '$from → $to';
    final reason = nonBlank(req.reason);
    final decided = s == 'APPROVED' || s == 'REJECTED';
    final note = nonBlank(req.reviewNote) ?? (s == 'APPROVED' ? tr('Approved.') : tr('Rejected.'));
    return QdCard(
      padding: const EdgeInsets.all(14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  title,
                  style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: c.foreground, height: 1.3),
                ),
              ),
              const SizedBox(width: 8),
              QdBadge(label, tone: tone, dot: true),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            tr('Submitted {time}', {'time': _when(req.createdAt)}),
            style: TextStyle(fontSize: 13, color: c.mutedForeground),
          ),
          if (reason != null) ...[
            const SizedBox(height: 8),
            Text(reason, style: TextStyle(fontSize: 15, color: c.foreground, height: 1.4)),
          ],
          if (decided) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: s == 'APPROVED' ? c.successSoft : c.errorSoftBg,
                borderRadius: BorderRadius.circular(BcRadius.md),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(note, style: TextStyle(fontSize: 15, color: c.foreground, height: 1.35)),
                  if (nonBlank(req.reviewedAt) != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 2),
                      child: Text(
                        tr('Decided {time}', {'time': _when(req.reviewedAt)}),
                        style: TextStyle(fontSize: 12, color: c.mutedForeground),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}
