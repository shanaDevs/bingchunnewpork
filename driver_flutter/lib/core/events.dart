import 'dart:async';

/// Fan-out when the current rider JWT is no longer valid — another device
/// signed in ([sessionSuperseded]) or the token was rejected with 401.
/// Port of SessionInvalidator.kt.
class SessionInvalidator {
  static const sessionSuperseded = 'SESSION_SUPERSEDED';

  final _events = StreamController<String>.broadcast();
  Stream<String> get events => _events.stream;

  void notify(String reason) => _events.add(reason);
}

/// App-wide "this job changed" signal — port of JobRefreshBus.kt.
///
/// Screens sitting lower in the navigation stack subscribe here and force-reload
/// when the job they show is emitted.
class JobRefreshBus {
  JobRefreshBus._();

  static final _events = StreamController<String>.broadcast();
  static final _droppedRides = StreamController<String>.broadcast();

  static Stream<String> get events => _events.stream;
  static Stream<String> get droppedRides => _droppedRides.stream;

  static void refresh(String jobId) {
    if (jobId.trim().isNotEmpty) _events.add(jobId);
  }

  static void dropRide(String jobId) {
    if (jobId.trim().isNotEmpty) _droppedRides.add(jobId);
  }
}

/// Breakdown handover changes for the stranded rider, from the socket: admin assigned a
/// replacement (`handoverRiderAssigned`) or the breakdown was cleared
/// (`vehicleBreakdownCleared`). Emits the failed ride's job id.
class BreakdownBus {
  BreakdownBus._();

  static final _events = StreamController<String>.broadcast();

  static Stream<String> get events => _events.stream;

  static void changed(String jobId) {
    if (jobId.trim().isNotEmpty) _events.add(jobId);
  }
}
