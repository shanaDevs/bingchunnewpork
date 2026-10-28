class RiderStats {
  const RiderStats({
    required this.period,
    required this.completedRuns,
    required this.deliveredStops,
    required this.totalDistanceKm,
    required this.earningsLkr,
    required this.onlineMinutes,
    required this.attendanceDays,
    required this.averagePickupMinutes,
    required this.averageDeliveryMinutes,
    required this.ratingAverage,
    required this.ratingCount,
    required this.recentRatings,
    required this.meritPoints,
    required this.meritStatus,
  });

  final String period;
  final int completedRuns;
  final int deliveredStops;
  final double totalDistanceKm;
  final double earningsLkr;
  final int onlineMinutes;
  final int attendanceDays;
  final int? averagePickupMinutes;
  final int? averageDeliveryMinutes;
  final double? ratingAverage;
  final int ratingCount;
  final List<RiderRating> recentRatings;
  final int meritPoints;
  final String meritStatus;

  factory RiderStats.fromJson(Map<String, dynamic> json) {
    final totals = json['totals'] as Map<String, dynamic>? ?? const {};
    final rating = json['rating'] as Map<String, dynamic>? ?? const {};
    final merit = json['merit'] as Map<String, dynamic>? ?? const {};
    final period = json['period'] as Map<String, dynamic>? ?? const {};
    return RiderStats(
      period: period['key'] as String? ?? 'today',
      completedRuns: (totals['completedRuns'] as num?)?.toInt() ?? 0,
      deliveredStops: (totals['deliveredStops'] as num?)?.toInt() ?? 0,
      totalDistanceKm: (totals['totalDistanceKm'] as num?)?.toDouble() ?? 0,
      earningsLkr: (totals['earningsLkr'] as num?)?.toDouble() ?? 0,
      onlineMinutes: (totals['onlineMinutes'] as num?)?.toInt() ?? 0,
      attendanceDays: (totals['attendanceDays'] as num?)?.toInt() ?? 0,
      averagePickupMinutes: (totals['averagePickupMinutes'] as num?)?.toInt(),
      averageDeliveryMinutes: (totals['averageDeliveryMinutes'] as num?)?.toInt(),
      ratingAverage: (rating['average'] as num?)?.toDouble(),
      ratingCount: (rating['count'] as num?)?.toInt() ?? 0,
      recentRatings: ((rating['recent'] as List?) ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(RiderRating.fromJson)
          .toList(),
      meritPoints: (merit['points'] as num?)?.toInt() ?? 0,
      meritStatus: merit['status'] as String? ?? 'STARTER',
    );
  }
}

class RiderRating {
  const RiderRating({
    required this.id,
    required this.stars,
    required this.createdAt,
    this.orderNumber,
    this.comment,
  });

  final String id;
  final String? orderNumber;
  final int stars;
  final String? comment;
  final DateTime createdAt;

  factory RiderRating.fromJson(Map<String, dynamic> json) => RiderRating(
        id: json['id'] as String? ?? '',
        orderNumber: json['orderNumber'] as String?,
        stars: (json['stars'] as num?)?.toInt() ?? 0,
        comment: json['comment'] as String?,
        createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ?? DateTime.now(),
      );
}

class CompletionRecord {
  const CompletionRecord({
    required this.id,
    required this.title,
    required this.storeName,
    required this.completedAt,
    required this.orderCount,
    required this.totalDistanceKm,
    required this.totalDeliveryFees,
    this.storeCity,
    this.ratingAverage,
  });

  final String id;
  final String title;
  final String storeName;
  final String? storeCity;
  final DateTime completedAt;
  final int orderCount;
  final double totalDistanceKm;
  final double totalDeliveryFees;
  final double? ratingAverage;

  factory CompletionRecord.fromJson(Map<String, dynamic> json) => CompletionRecord(
        id: json['id'] as String? ?? '',
        title: json['title'] as String? ?? 'Delivery run',
        storeName: json['storeName'] as String? ?? 'Bing Chun',
        storeCity: json['storeCity'] as String?,
        completedAt: DateTime.tryParse(json['completedAt'] as String? ?? '') ?? DateTime.now(),
        orderCount: (json['orderCount'] as num?)?.toInt() ?? 0,
        totalDistanceKm: (json['totalDistanceKm'] as num?)?.toDouble() ?? 0,
        totalDeliveryFees: (json['totalDeliveryFees'] as num?)?.toDouble() ?? 0,
        ratingAverage: (json['riderRatingAvg'] as num?)?.toDouble(),
      );
}
