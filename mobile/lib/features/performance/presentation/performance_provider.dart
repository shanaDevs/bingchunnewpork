import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/dev_config.dart';
import '../data/performance_repository.dart';
import '../domain/performance_models.dart';

final performanceRepositoryProvider = Provider<PerformanceRepository>((ref) => PerformanceRepository());
final performancePeriodProvider = StateProvider<String>((ref) => 'today');

final riderStatsProvider = FutureProvider<RiderStats>((ref) async {
  final period = ref.watch(performancePeriodProvider);
  if (kUiPreviewMode) return previewStats(period);
  return ref.watch(performanceRepositoryProvider).getStats(period);
});

final completionHistoryProvider = FutureProvider<List<CompletionRecord>>((ref) async {
  if (kUiPreviewMode) return previewHistory;
  return ref.watch(performanceRepositoryProvider).getHistory();
});

final ratingsProvider = FutureProvider<List<RiderRating>>((ref) async {
  if (kUiPreviewMode) return previewRatings;
  return ref.watch(performanceRepositoryProvider).getRatings();
});

final previewRatings = <RiderRating>[
  RiderRating(id: '1', orderNumber: 'BC-24061', stars: 5, comment: 'Fast and friendly delivery!', createdAt: DateTime.now()),
  RiderRating(id: '2', orderNumber: 'BC-24057', stars: 4, comment: 'Arrived safely and on time.', createdAt: DateTime.now().subtract(const Duration(days: 1))),
];

final previewHistory = <CompletionRecord>[
  CompletionRecord(id: '1', title: 'Nugegoda evening run', storeName: 'Bing Chun - Nugegoda', storeCity: 'Nugegoda', completedAt: DateTime.now().subtract(const Duration(hours: 1)), orderCount: 5, totalDistanceKm: 8.4, totalDeliveryFees: 1450, ratingAverage: 4.8),
  CompletionRecord(id: '2', title: 'Lunch delivery run', storeName: 'Bing Chun - Nugegoda', storeCity: 'Nugegoda', completedAt: DateTime.now().subtract(const Duration(days: 1, hours: 2)), orderCount: 4, totalDistanceKm: 6.1, totalDeliveryFees: 1100, ratingAverage: 5),
];

RiderStats previewStats(String period) => RiderStats(
      period: period,
      completedRuns: period == 'today' ? 3 : 18,
      deliveredStops: period == 'today' ? 12 : 67,
      totalDistanceKm: period == 'today' ? 24.6 : 132.8,
      earningsLkr: period == 'today' ? 3450 : 18400,
      onlineMinutes: period == 'today' ? 382 : 2210,
      attendanceDays: period == 'today' ? 1 : 6,
      averagePickupMinutes: 8,
      averageDeliveryMinutes: 24,
      ratingAverage: 4.8,
      ratingCount: 42,
      recentRatings: previewRatings,
      meritPoints: 126,
      meritStatus: 'EXCELLENT',
    );
