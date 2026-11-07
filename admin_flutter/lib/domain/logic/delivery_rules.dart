import '../entities/delivery.dart';

/// Port of the web lib/adminDeliveryQueries.ts.

/// Statuses on the Active tab (jobs with real orders, not past-due incomplete).
const activeDeliveryStatuses = {'SCHEDULED', 'ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING'};

/// Statuses where a rider is on the road and the live map is worth showing.
const liveRunStatuses = {'ASSIGNED', 'QUEUED', 'IN_PROGRESS', 'RETURNING'};

bool isActiveDeliveryJob(DeliveryJob j) =>
    activeDeliveryStatuses.contains(j.status) && j.orderCount > 0 && j.displayStatus == null;

enum DeliveryJobsTab { active, completed, incomplete }

/// Query for `/admin/delivery-jobs`. Cashiers always see today's schedules
/// (web effectiveScheduleDates): Active / Incomplete filter by schedule time,
/// Complete by completion date.
Map<String, String> deliveryJobsQuery({
  required DeliveryJobsTab tab,
  required String storeId,
  required String today,
  String? driverId,
  String? from,
  String? to,
}) {
  // Cashiers always see today; branch admins can pick a range (web effectiveScheduleDates).
  final f = from ?? today;
  final t = to ?? today;
  return {
    'storeId': storeId,
    'driverId': ?driverId,
    ...switch (tab) {
      DeliveryJobsTab.active => {'scheduledAtFrom': f, 'scheduledAtTo': t},
      DeliveryJobsTab.completed => {'status': 'COMPLETED', 'dateFrom': f, 'dateTo': t},
      DeliveryJobsTab.incomplete => {'status': 'INCOMPLETE', 'scheduledAtFrom': f, 'scheduledAtTo': t},
    },
  };
}
