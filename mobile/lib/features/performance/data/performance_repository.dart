import '../../../core/network/dio_client.dart';
import '../domain/performance_models.dart';

class PerformanceRepository {
  PerformanceRepository({DioClient? client}) : _client = client ?? DioClient.delivery();

  final DioClient _client;

  Future<RiderStats> getStats(String period) => _client.get<RiderStats>(
        '/me/stats',
        query: {'period': period},
        parser: RiderStats.fromJson,
      );

  Future<List<CompletionRecord>> getHistory() async {
    final data = await _client.get<List<dynamic>>('/me/history');
    return data.whereType<Map<String, dynamic>>().map(CompletionRecord.fromJson).toList();
  }

  Future<List<RiderRating>> getRatings() async {
    final data = await _client.get<Map<String, dynamic>>('/me/ratings');
    return ((data['ratings'] as List?) ?? const [])
        .whereType<Map<String, dynamic>>()
        .map(RiderRating.fromJson)
        .toList();
  }
}
