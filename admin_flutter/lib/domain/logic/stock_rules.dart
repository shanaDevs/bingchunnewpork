import '../entities/stock.dart';

/// Prefill when weekly target is not configured — port of web `DEFAULT_WEEKLY_TARGET_QTY`.
const defaultWeeklyTargetQty = 200;

/// Stock classification — port of the web lib/stockApi.ts helpers.

enum StockLevel { newProducts, inStock, lowStock, outOfStock, inactive }

enum StockStatus { branchInactive, franchiserInactive, comingSoon, outOfStock, lowStock, inStock }

bool isBranchInactive(StockItem i) => i.isBranchDeactivated || i.frozenBatchCount > 0;

bool isFranchiserInactive(StockItem i) {
  if (i.catalogAvailable) return false;
  if (isBranchInactive(i)) return false;
  return !isNewProduct(i);
}

bool isStockInactive(StockItem i) => isBranchInactive(i) || isFranchiserInactive(i);

/// Never stocked at this branch yet ("Coming soon").
bool isNewProduct(StockItem i) {
  if (isBranchInactive(i)) return false;
  if (i.isNewProduct != null) return i.isNewProduct!;
  return i.onHandQty == 0 &&
      i.weeklyTargetQty == 0 &&
      i.weeklyReceivedQty == 0 &&
      (i.totalBatchCount ?? i.batchCount) == 0;
}

StockStatus stockStatus(StockItem i) {
  if (isBranchInactive(i)) return StockStatus.branchInactive;
  if (isFranchiserInactive(i)) return StockStatus.franchiserInactive;
  if (isNewProduct(i)) return StockStatus.comingSoon;
  if (i.isOutOfStock) return StockStatus.outOfStock;
  if (i.isLowStock) return StockStatus.lowStock;
  return StockStatus.inStock;
}

bool matchesLevel(StockItem i, StockLevel level) {
  if (level == StockLevel.inactive) return isStockInactive(i);
  if (isStockInactive(i)) return false;
  return switch (level) {
    StockLevel.newProducts => isNewProduct(i),
    StockLevel.inStock => !isNewProduct(i) && !i.isLowStock && !i.isOutOfStock,
    StockLevel.lowStock => !isNewProduct(i) && i.isLowStock && !i.isOutOfStock,
    StockLevel.outOfStock => !isNewProduct(i) && i.isOutOfStock,
    StockLevel.inactive => false,
  };
}

/// Web Stock Table KPI cards.
class StockKpis {
  StockKpis(List<StockItem> items)
    : active = items.where((i) => i.isAvailable && !i.isOutOfStock && !isStockInactive(i)).length,
      inactive = items.where(isStockInactive).length,
      lowStock = items.where((i) => matchesLevel(i, StockLevel.lowStock)).length,
      outOfStock = items.where((i) => matchesLevel(i, StockLevel.outOfStock)).length,
      all = items.length,
      levelCounts = {for (final l in StockLevel.values) l: items.where((i) => matchesLevel(i, l)).length};

  final int active;
  final int inactive;
  final int lowStock;
  final int outOfStock;
  final int all;
  final Map<StockLevel, int> levelCounts;
}

/// Items for a level tab, ordered like the web table. A search shows every level.
List<StockItem> stockTableRows(List<StockItem> items, StockLevel level, {required bool searching}) {
  final rows = items.where((i) => searching || matchesLevel(i, level)).toList();
  if (!searching && level == StockLevel.newProducts) {
    rows.sort((a, b) => (b.productCreatedAt ?? DateTime(0)).compareTo(a.productCreatedAt ?? DateTime(0)));
  } else {
    rows.sort((a, b) => a.isOutOfStock == b.isOutOfStock ? 0 : (a.isOutOfStock ? -1 : 1));
  }
  return rows;
}

/// Under 10% of the received quantity left.
bool isLowRemaining(StockBatch b) => b.status == 'ACTIVE' && b.receivedQty > 0 && b.remainingQty / b.receivedQty <= 0.1;

enum BatchStatusFilter { all, active, depleted, writtenOff }

enum BatchTypeFilter { all, reset, emergency }

extension BatchStatusFilterApi on BatchStatusFilter {
  String? get apiValue => switch (this) {
    BatchStatusFilter.all => null,
    BatchStatusFilter.active => 'ACTIVE',
    BatchStatusFilter.depleted => 'DEPLETED',
    BatchStatusFilter.writtenOff => 'WRITTEN_OFF',
  };
}

/// Branch batch list filtered and sorted like the web Batches tab.
List<StockBatch> filterBatches(
  List<StockBatch> batches, {
  required String search,
  required BatchStatusFilter status,
  required BatchTypeFilter type,
  required String? productId,
  required bool oldestFirst,
}) {
  final term = search.trim().toLowerCase();
  final rows = batches.where((b) {
    final s = status.apiValue;
    if (s != null && b.status != s) return false;
    if (type == BatchTypeFilter.reset && b.batchType != 'RESET') return false;
    if (type == BatchTypeFilter.emergency && b.batchType != 'EMERGENCY') return false;
    if (productId != null && b.productId != productId) return false;
    return term.isEmpty ||
        (b.productName ?? '').toLowerCase().contains(term) ||
        b.batchNumber.toLowerCase().contains(term) ||
        (b.batchGroupNumber ?? '').toLowerCase().contains(term);
  }).toList();
  rows.sort((a, b) => oldestFirst ? a.receivedAt.compareTo(b.receivedAt) : b.receivedAt.compareTo(a.receivedAt));
  return rows;
}
