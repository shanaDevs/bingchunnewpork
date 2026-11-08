import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';

import '../data/models/delivery_job.dart';
import 'screens/dashboard_screen.dart';
import 'screens/job_detail_screen.dart';
import 'screens/order_detail_screen.dart';
import 'screens/route_map_screen.dart';

/// Navigation helpers — port of the routes in Navigation.kt.
class AppRoutes {
  AppRoutes._();

  static final navigatorKey = GlobalKey<NavigatorState>();

  static final _tabRequests = StreamController<int>.broadcast();

  /// Tab switches requested from screens pushed above the home shell.
  static Stream<int> get tabRequests => _tabRequests.stream;

  /// Returns to the home shell (dropping every pushed screen) and selects [tab].
  static void goToTab(int tab) {
    // Select the tab first so the shell underneath already shows it while the pushed
    // screens close; popping first would flash the previous tab (Home) for a moment.
    _tabRequests.add(tab);
    navigatorKey.currentState?.popUntil((r) => r.isFirst);
  }

  static const _liveStatuses = {'IN_PROGRESS', 'ASSIGNED', 'RETURNING'};

  /// Live runs open the dashboard; everything else opens the job detail.
  static Future<void> openJob(BuildContext context, JobSummary job) =>
      _liveStatuses.contains(job.status) ? openDashboard(context, job.id) : openJobDetail(context, job.id);

  static Future<void> openJobDetail(BuildContext context, String jobId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => JobDetailScreen(jobId: jobId)));

  /// [legOrderId] opens the run already heading to that order (skips the "Up next" step).
  static Future<void> openDashboard(BuildContext context, String jobId, {bool replace = false, String? legOrderId}) {
    final route = MaterialPageRoute<void>(
      settings: RouteSettings(name: 'dashboard/$jobId'),
      builder: (_) => DashboardScreen(jobId: jobId, legOrderId: legOrderId),
    );
    return replace ? Navigator.of(context).pushReplacement(route) : Navigator.of(context).push(route);
  }

  /// Opens a dashboard from anywhere (incoming-ride accept, notification tap).
  static void openDashboardFromRoot(String jobId) {
    final nav = navigatorKey.currentState;
    if (nav == null) return;
    var already = false;
    nav.popUntil((r) {
      if (r.settings.name == 'dashboard/$jobId') already = true;
      return r.isFirst || already;
    });
    if (!already) {
      nav.push(
        MaterialPageRoute<void>(
          settings: RouteSettings(name: 'dashboard/$jobId'),
          builder: (_) => DashboardScreen(jobId: jobId),
        ),
      );
    }
  }

  static Future<void> openMap(BuildContext context, String jobId) =>
      Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => RouteMapScreen(jobId: jobId)));

  static Future<void> openOrder(BuildContext context, String jobId, String orderId) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      builder: (_) => OrderDetailScreen(jobId: jobId, orderId: orderId),
    ),
  );

  /// Back to the home shell, dropping every pushed screen.
  static void popToHome(BuildContext context) => Navigator.of(context).popUntil((r) => r.isFirst);
}

/// Requests location permission if needed; true when granted.
Future<bool> ensureLocationPermission() async {
  var p = await Geolocator.checkPermission();
  if (p == LocationPermission.denied) p = await Geolocator.requestPermission();
  return p == LocationPermission.always || p == LocationPermission.whileInUse;
}
