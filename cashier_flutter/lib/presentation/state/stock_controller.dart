import 'dart:async';

import 'package:flutter/foundation.dart';

import '../../core/format.dart';
import '../../domain/entities/admin_session.dart';
import '../../domain/entities/menu.dart';
import '../../domain/entities/stock.dart';
import '../../domain/logic/stock_rules.dart';
import '../../domain/repositories/repositories.dart';

enum StockTab { table, batches, movement }

enum MovementTab { productWise, allProducts }

/// Branch Stock — port of the web `/admin/stock` page as a cashier sees it
/// (read-only: Stock Table, Batches, Stock Movement).
class StockController extends ChangeNotifier {
  StockController(this._stock, this._menu, this.session) {
    _init();
    _timer = Timer.periodic(const Duration(seconds: 60), (_) {
      if (tab == StockTab.table) loadTable(silent: true);
    });
  }

  final StockRepository _stock;
  final MenuRepository _menu;
  final AdminSession session;
  late final Timer _timer;

  StockTab tab = StockTab.table;

  // Branch
  List<StoreOption> stores = const [];
  String? storeId;
  String storeName = '';

  // ---------------- Stock table
  List<MenuCategory> categories = const [];
  List<StockItem> items = const [];
  bool tableLoading = true;
  String? tableError;
  String search = '';
  String? categorySlug;
  StockLevel level = StockLevel.lowStock;
  String? expandedProductId;
  final Map<String, List<StockBatch>> _productBatches = {};
  bool productBatchesLoading = false;

  // ---------------- Batches
  List<StockBatch>? batches;
  bool batchesLoading = false;
  String? batchesError;
  String batchSearch = '';
  BatchStatusFilter batchStatus = BatchStatusFilter.active;
  BatchTypeFilter batchType = BatchTypeFilter.all;
  String? batchProductId;
  bool batchOldestFirst = true;

  // ---------------- Movement
  MovementTab movementTab = MovementTab.productWise;
  late DateTime from = _monthStart();
  late DateTime to = DateTime.now();
  String? ledgerProductId;
  StockLedger? ledger;
  StockPricing? pricing;
  bool ledgerLoading = false;
  String? ledgerError;
  int _ledgerRequest = 0;

  static DateTime _monthStart() {
    final now = DateTime.now();
    return DateTime(now.year, now.month);
  }

  bool get pickStore => session.isSuperAdmin;

  StockKpis get kpis => StockKpis(items);

  List<StockItem> get tableRows => stockTableRows(items, level, searching: search.isNotEmpty);

  List<StockBatch>? batchesFor(String productId) => _productBatches[productId];

  List<StockBatch> get visibleBatches => filterBatches(
    batches ?? const [],
    search: batchSearch,
    status: batchStatus,
    type: batchType,
    productId: batchProductId,
    oldestFirst: batchOldestFirst,
  );

  StockItem? get ledgerProduct => items.where((i) => i.productId == ledgerProductId).firstOrNull;

  Future<void> _init() async {
    try {
      categories = await _menu.categories();
      if (pickStore) {
        stores = await _menu.stores();
        storeId = stores.isEmpty ? null : stores.first.id;
      } else {
        storeId = session.storeId;
      }
    } catch (e) {
      tableError = e.toString();
    }
    storeName = session.branchLabel ?? '';
    await loadTable();
  }

  Future<void> loadTable({bool silent = false}) async {
    final id = storeId;
    if (id == null) {
      tableLoading = false;
      notifyListeners();
      return;
    }
    if (!silent) {
      tableLoading = true;
      tableError = null;
      notifyListeners();
    }
    try {
      final res = await _stock.stock(id, search: search, category: categorySlug);
      items = res.items;
      storeName = res.storeName.replaceFirst('Bing Chun - ', '');
      tableError = null;
    } catch (e) {
      if (!silent || items.isEmpty) tableError = e.toString();
    }
    tableLoading = false;
    notifyListeners();
  }

  void setTab(StockTab t) {
    tab = t;
    notifyListeners();
    if (t == StockTab.batches && batches == null) loadBatches();
    if (t == StockTab.movement && ledger == null) loadLedger();
  }

  void selectStore(String id) {
    if (id == storeId) return;
    storeId = id;
    items = const [];
    batches = null;
    ledger = null;
    ledgerProductId = null;
    _productBatches.clear();
    expandedProductId = null;
    loadTable();
    if (tab == StockTab.batches) loadBatches();
    if (tab == StockTab.movement) loadLedger();
  }

  // ---------------- Table actions

  void setSearch(String text) {
    search = text.trim();
    loadTable();
  }

  void setCategory(String? slug) {
    categorySlug = slug;
    loadTable();
  }

  void setLevel(StockLevel l) {
    level = l;
    notifyListeners();
  }

  /// Tap a row to show its batches (web expandable row).
  Future<void> toggleExpanded(StockItem item) async {
    if (expandedProductId == item.productId) {
      expandedProductId = null;
      notifyListeners();
      return;
    }
    expandedProductId = item.productId;
    notifyListeners();
    if (_productBatches.containsKey(item.productId) || storeId == null) return;
    productBatchesLoading = true;
    notifyListeners();
    try {
      _productBatches[item.productId] = await _stock.productBatches(item.productId, storeId!);
    } catch (_) {
      _productBatches[item.productId] = const [];
    }
    productBatchesLoading = false;
    notifyListeners();
  }

  // ---------------- Batches

  Future<void> loadBatches() async {
    final id = storeId;
    if (id == null) return;
    batchesLoading = true;
    batchesError = null;
    notifyListeners();
    try {
      batches = await _stock.branchBatches(id);
    } catch (e) {
      batchesError = e.toString();
    }
    batchesLoading = false;
    notifyListeners();
  }

  void setBatchFilters({
    String? search,
    BatchStatusFilter? status,
    BatchTypeFilter? type,
    String? productId,
    bool clearProduct = false,
    bool? oldestFirst,
  }) {
    batchSearch = search ?? batchSearch;
    batchStatus = status ?? batchStatus;
    batchType = type ?? batchType;
    batchProductId = clearProduct ? null : (productId ?? batchProductId);
    batchOldestFirst = oldestFirst ?? batchOldestFirst;
    notifyListeners();
  }

  void resetBatchFilters() {
    batchSearch = '';
    batchStatus = BatchStatusFilter.active;
    batchType = BatchTypeFilter.all;
    batchProductId = null;
    batchOldestFirst = true;
    notifyListeners();
  }

  // ---------------- Movement

  void setMovementTab(MovementTab t) {
    movementTab = t;
    ledger = null;
    pricing = null;
    loadLedger();
  }

  void setRange(DateTime f, DateTime t) {
    from = f;
    to = t;
    loadLedger();
  }

  void setLedgerProduct(String id) {
    ledgerProductId = id;
    loadLedger();
  }

  Future<void> loadLedger() async {
    final id = storeId;
    final productWise = movementTab == MovementTab.productWise;
    if (id == null || (productWise && ledgerProductId == null)) {
      ledger = null;
      notifyListeners();
      return;
    }
    final request = ++_ledgerRequest;
    ledgerLoading = true;
    ledgerError = null;
    notifyListeners();
    final f = formatYmd(from);
    final t = formatYmd(to);
    try {
      final results = await Future.wait([
        _stock.ledger(storeId: id, from: f, to: t, productId: productWise ? ledgerProductId : null),
        if (productWise) _stock.pricing(storeId: id, productId: ledgerProductId!, from: f, to: t),
      ]);
      if (request != _ledgerRequest) return;
      ledger = results[0] as StockLedger;
      pricing = productWise ? results[1] as StockPricing? : null;
    } catch (e) {
      if (request != _ledgerRequest) return;
      ledgerError = e.toString();
      ledger = null;
    }
    ledgerLoading = false;
    notifyListeners();
  }

  @override
  void dispose() {
    _timer.cancel();
    super.dispose();
  }
}
