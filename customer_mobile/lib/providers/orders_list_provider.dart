import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/order.dart';
import '../models/paginated_result.dart';
import '../services/api_client.dart';
import 'auth_provider.dart';

/// Status buckets for Order history tabs.
enum OrdersListFilter { all, active, completed, cancelled }

enum OrdersListSort { newest, oldest }

enum OrdersModeFilter { all, delivery, takeaway }

extension OrdersListFilterApi on OrdersListFilter {
  /// Backend only supports all | ongoing | completed (delivered+cancelled).
  String get apiValue {
    switch (this) {
      case OrdersListFilter.all:
        return 'all';
      case OrdersListFilter.active:
        return 'ongoing';
      case OrdersListFilter.completed:
      case OrdersListFilter.cancelled:
        return 'completed';
    }
  }
}

extension OrdersListSortApi on OrdersListSort {
  String get apiValue => name;
}

class OrdersListState {
  final List<Order> orders;
  final OrdersListFilter filter;
  final OrdersListSort sort;
  final OrdersModeFilter modeFilter;
  final String searchQuery;
  final int page;
  final int limit;
  final int total;
  final int pages;
  final bool isLoading;
  final bool isLoadingMore;
  final String? errorMessage;
  /// Counts from last full refresh (approximate when paginated).
  final int countAll;
  final int countActive;
  final int countCompleted;
  final int countCancelled;

  const OrdersListState({
    this.orders = const [],
    this.filter = OrdersListFilter.active,
    this.sort = OrdersListSort.newest,
    this.modeFilter = OrdersModeFilter.all,
    this.searchQuery = '',
    this.page = 1,
    this.limit = 20,
    this.total = 0,
    this.pages = 1,
    this.isLoading = false,
    this.isLoadingMore = false,
    this.errorMessage,
    this.countAll = 0,
    this.countActive = 0,
    this.countCompleted = 0,
    this.countCancelled = 0,
  });

  bool get hasMore => page < pages;
  bool get isEmpty => orders.isEmpty && !isLoading;

  List<Order> get visibleOrders {
    final q = searchQuery.trim().toLowerCase();
    return orders.where((order) {
      if (filter == OrdersListFilter.active && !order.isActive) return false;
      if (filter == OrdersListFilter.completed && order.status != 'DELIVERED') {
        return false;
      }
      if (filter == OrdersListFilter.cancelled && order.status != 'CANCELLED') {
        return false;
      }
      if (modeFilter == OrdersModeFilter.delivery && order.orderMode != 'DELIVERY') {
        return false;
      }
      if (modeFilter == OrdersModeFilter.takeaway && order.orderMode != 'TAKEAWAY') {
        return false;
      }
      if (q.isNotEmpty) {
        final inNumber = order.orderNumber.toLowerCase().contains(q);
        final inStore = (order.storeName ?? '').toLowerCase().contains(q);
        final inItems = order.items.any(
          (i) => i.productName.toLowerCase().contains(q),
        );
        if (!inNumber && !inStore && !inItems) return false;
      }
      return true;
    }).toList();
  }

  OrdersListState copyWith({
    List<Order>? orders,
    OrdersListFilter? filter,
    OrdersListSort? sort,
    OrdersModeFilter? modeFilter,
    String? searchQuery,
    int? page,
    int? limit,
    int? total,
    int? pages,
    bool? isLoading,
    bool? isLoadingMore,
    String? errorMessage,
    bool clearError = false,
    int? countAll,
    int? countActive,
    int? countCompleted,
    int? countCancelled,
  }) {
    return OrdersListState(
      orders: orders ?? this.orders,
      filter: filter ?? this.filter,
      sort: sort ?? this.sort,
      modeFilter: modeFilter ?? this.modeFilter,
      searchQuery: searchQuery ?? this.searchQuery,
      page: page ?? this.page,
      limit: limit ?? this.limit,
      total: total ?? this.total,
      pages: pages ?? this.pages,
      isLoading: isLoading ?? this.isLoading,
      isLoadingMore: isLoadingMore ?? this.isLoadingMore,
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
      countAll: countAll ?? this.countAll,
      countActive: countActive ?? this.countActive,
      countCompleted: countCompleted ?? this.countCompleted,
      countCancelled: countCancelled ?? this.countCancelled,
    );
  }
}

final ordersListProvider =
    StateNotifierProvider<OrdersListNotifier, OrdersListState>((ref) {
  final api = ref.watch(apiClientProvider);
  final notifier = OrdersListNotifier(api);

  ref.listen<AuthState>(authProvider, (previous, next) {
    if (next.status == AuthStatus.authenticated) {
      notifier.refresh();
    } else if (next.status == AuthStatus.unauthenticated) {
      notifier.reset();
    }
  });

  return notifier;
});

class OrdersListNotifier extends StateNotifier<OrdersListState> {
  final ApiClient _api;

  OrdersListNotifier(this._api) : super(const OrdersListState());

  void reset() {
    state = const OrdersListState();
  }

  Future<void> refresh() => _fetch(page: 1, append: false);

  Future<void> setFilter(OrdersListFilter filter) async {
    if (state.filter == filter) return;
    state = state.copyWith(filter: filter, clearError: true);
    // Status tabs filter client-side against the full loaded set (fetched as `all`).
    if (state.orders.isEmpty && !state.isLoading) {
      await _fetch(page: 1, append: false);
    }
  }

  Future<void> setSort(OrdersListSort sort) async {
    if (state.sort == sort) return;
    state = state.copyWith(sort: sort, clearError: true);
    await _fetch(page: 1, append: false);
  }

  void setModeFilter(OrdersModeFilter mode) {
    if (state.modeFilter == mode) return;
    state = state.copyWith(modeFilter: mode);
  }

  void setSearchQuery(String query) {
    if (state.searchQuery == query) return;
    state = state.copyWith(searchQuery: query);
  }

  Future<void> setLimit(int limit) async {
    if (state.limit == limit) return;
    state = state.copyWith(limit: limit, clearError: true);
    await _fetch(page: 1, append: false);
  }

  Future<void> loadMore() async {
    if (state.isLoading || state.isLoadingMore || !state.hasMore) return;
    await _fetch(page: state.page + 1, append: true);
  }

  Future<PaginatedResult<Order>> _fetchPage({
    required String filter,
    required int page,
  }) async {
    final path =
        '/orders/my?page=$page&limit=${state.limit}&filter=$filter&sort=${state.sort.apiValue}';

    return _api.get<PaginatedResult<Order>>(
      path,
      fullParser: (payload) => PaginatedResult.fromJson(
        payload,
        (json) => Order.fromJson(json),
      ),
    );
  }

  void _applyCountsFromLoaded(List<Order> orders, {required int apiTotal}) {
    var active = 0;
    var completed = 0;
    var cancelled = 0;
    for (final o in orders) {
      if (o.status == 'CANCELLED') {
        cancelled++;
      } else if (o.status == 'DELIVERED') {
        completed++;
      } else {
        active++;
      }
    }
    // Prefer API totals when the full set is loaded; otherwise keep loaded splits.
    final fullyLoaded = orders.length >= apiTotal;
    state = state.copyWith(
      countAll: apiTotal,
      countActive: fullyLoaded ? active : (active > state.countActive ? active : state.countActive),
      countCompleted:
          fullyLoaded ? completed : (completed > state.countCompleted ? completed : state.countCompleted),
      countCancelled:
          fullyLoaded ? cancelled : (cancelled > state.countCancelled ? cancelled : state.countCancelled),
    );
  }

  Future<void> _refreshTabCounts() async {
    try {
      final ongoing = await _api.get<PaginatedResult<Order>>(
        '/orders/my?page=1&limit=1&filter=ongoing&sort=newest',
        fullParser: (payload) => PaginatedResult.fromJson(
          payload,
          (json) => Order.fromJson(json),
        ),
      );
      final completedBucket = await _api.get<PaginatedResult<Order>>(
        '/orders/my?page=1&limit=50&filter=completed&sort=newest',
        fullParser: (payload) => PaginatedResult.fromJson(
          payload,
          (json) => Order.fromJson(json),
        ),
      );
      var delivered = 0;
      var cancelled = 0;
      for (final o in completedBucket.items) {
        if (o.status == 'CANCELLED') {
          cancelled++;
        } else if (o.status == 'DELIVERED') {
          delivered++;
        }
      }

      state = state.copyWith(
        countActive: ongoing.total,
        countCompleted: delivered,
        countCancelled: cancelled,
        countAll: ongoing.total + completedBucket.total,
      );
    } catch (_) {
      /* keep existing counts */
    }
  }

  Future<void> _fetch({required int page, required bool append}) async {
    state = state.copyWith(
      isLoading: !append,
      isLoadingMore: append,
      clearError: true,
    );

    try {
      // Always load `all` so tabs / counts can filter client-side.
      final result = await _fetchPage(filter: 'all', page: page);
      final merged = append ? [...state.orders, ...result.items] : result.items;

      state = state.copyWith(
        orders: merged,
        page: result.page,
        total: result.total,
        pages: result.pages,
        isLoading: false,
        isLoadingMore: false,
        countAll: result.total,
      );
      _applyCountsFromLoaded(merged, apiTotal: result.total);
      if (!append) {
        await _refreshTabCounts();
      }
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        isLoadingMore: false,
        errorMessage: e.toString(),
      );
    }
  }
}
