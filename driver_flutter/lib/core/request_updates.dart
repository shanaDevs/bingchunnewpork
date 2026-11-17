import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/models/driver.dart';
import '../l10n/l10n.dart';
import 'app_container.dart';
import 'inbox.dart';

/// Inbox types for admin replies; the Notifications screen routes taps on them.
const kComplaintUpdateType = 'COMPLAINT_UPDATE';
const kBranchRequestUpdateType = 'BRANCH_REQUEST_UPDATE';

/// Turns admin decisions on the rider's complaints and branch requests into Notifications
/// inbox entries. The backend sends no push for these, so the app compares the current
/// statuses with the ones it saw last time (kept on the phone) and adds an entry for each
/// change. Runs on app open, on resume and every few minutes while the app is open.
class RequestUpdates {
  RequestUpdates._();

  static const _key = 'bc_request_status_v1';
  static const _initial = {'PENDING', 'OPEN', 'SUBMITTED', 'NEW'};

  static bool _running = false;

  static Future<void> check(AppContainer c, {required String? riderId}) async {
    if (_running || riderId == null || riderId.isEmpty) return;
    _running = true;
    try {
      final complaints = await c.jobsRepository.listComplaints();
      final requests = await c.authRepository.listBranchRequests();

      final prefs = await SharedPreferences.getInstance();
      Map<String, dynamic> saved = const {};
      try {
        saved = jsonDecode(prefs.getString(_key) ?? '{}') as Map<String, dynamic>;
      } catch (_) {}
      // First run for this rider: remember what exists now, announce nothing.
      final firstRun = saved['owner'] != riderId;
      final seen = firstRun ? <String, dynamic>{} : Map<String, dynamic>.from(saved['status'] as Map? ?? const {});

      final next = <String, String>{};
      final inbox = NotificationInbox.instance;

      for (final x in complaints) {
        final k = 'c:${x.id}';
        final status = x.status.toUpperCase();
        next[k] = status;
        if (!firstRun && seen[k] != status && !(seen[k] == null && _initial.contains(status))) {
          await inbox.add(
            type: kComplaintUpdateType,
            title: tr('Complaint update'),
            body: tr('Your complaint "{category}" is now {status}.', {
              'category': x.category,
              'status': _complaintStatus(status),
            }),
          );
        }
      }

      for (final x in requests) {
        final k = 'b:${x.id}';
        final status = x.status.toUpperCase();
        next[k] = status;
        if (!firstRun && seen[k] != status && !(seen[k] == null && _initial.contains(status))) {
          await inbox.add(type: kBranchRequestUpdateType, title: tr('Branch request update'), body: _branchBody(x, status));
        }
      }

      await prefs.setString(_key, jsonEncode({'owner': riderId, 'status': next}));
    } catch (e) {
      // Offline or signed out — try again on the next check.
      debugPrint('Request update check skipped: $e');
    } finally {
      _running = false;
    }
  }

  static String _complaintStatus(String s) => switch (s) {
    'RESOLVED' || 'CLOSED' => tr('resolved'),
    'DISMISSED' || 'REJECTED' => tr('dismissed'),
    'CONFIRMED' || 'UNDER_REVIEW' || 'IN_REVIEW' => tr('under review'),
    _ => s.toLowerCase().replaceAll('_', ' '),
  };

  static String _branchBody(DriverBranchRequest r, String status) {
    final branch = r.toStoreName?.trim().isNotEmpty == true ? r.toStoreName!.trim() : tr('the branch');
    final note = r.reviewNote?.trim();
    final head = switch (status) {
      'APPROVED' => tr('Your branch request for {branch} was approved.', {'branch': branch}),
      'REJECTED' => tr('Your branch request for {branch} was rejected.', {'branch': branch}),
      _ => tr('Your branch request for {branch} was updated.', {'branch': branch}),
    };
    return note == null || note.isEmpty ? head : '$head $note';
  }
}
