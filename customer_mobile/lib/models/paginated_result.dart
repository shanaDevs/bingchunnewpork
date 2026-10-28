class PaginatedResult<T> {
  final List<T> items;
  final int total;
  final int page;
  final int limit;
  final int pages;

  const PaginatedResult({
    required this.items,
    required this.total,
    required this.page,
    required this.limit,
    required this.pages,
  });

  bool get hasMore => page < pages;

  factory PaginatedResult.fromJson(
    Map<String, dynamic> payload,
    T Function(Map<String, dynamic> json) itemParser,
  ) {
    final data = payload['data'];
    final meta = payload['meta'] as Map<String, dynamic>? ?? {};
    final rawItems = data is List<dynamic> ? data : const <dynamic>[];

    return PaginatedResult(
      items: rawItems
          .map((e) => itemParser(e as Map<String, dynamic>))
          .toList(),
      total: meta['total'] as int? ?? rawItems.length,
      page: meta['page'] as int? ?? 1,
      limit: meta['limit'] as int? ?? rawItems.length,
      pages: meta['pages'] as int? ?? 1,
    );
  }
}
