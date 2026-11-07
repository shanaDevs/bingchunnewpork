// Branch stock shapes from `/admin/stock*` — field names follow the web
// `StockItem` / `StockBatchRow` / `StockLedgerResponse` (lib/stockApi.ts).

class StockItem {
  const StockItem({
    required this.productId,
    required this.name,
    required this.categoryName,
    required this.categorySlug,
    required this.basePrice,
    required this.cost,
    required this.isAvailable,
    required this.weeklyTargetQty,
    required this.weeklyReceivedQty,
    required this.onHandQty,
    required this.onlineAvailableQty,
    required this.batchCount,
    required this.isLowStock,
    required this.isOutOfStock,
    this.imageUrl,
    this.tag,
    this.totalBatchCount,
    this.frozenBatchCount = 0,
    this.frozenQty = 0,
    this.isBranchDeactivated = false,
    this.isNewProduct,
    this.productCreatedAt,
    this.lowStockThreshold = 25,
    this.onlineOutOfStockThreshold = 0,
  });

  final String productId;
  final String name;
  final String? imageUrl;
  final String? tag;
  final String categoryName;
  final String categorySlug;
  final double basePrice;
  final double cost;
  final bool isAvailable;
  final int weeklyTargetQty;
  final int weeklyReceivedQty;
  final int onHandQty;
  final int onlineAvailableQty;
  final int batchCount;
  final int? totalBatchCount;
  final int frozenBatchCount;
  final int frozenQty;
  final bool isBranchDeactivated;
  final bool isLowStock;
  final bool isOutOfStock;
  final bool? isNewProduct;
  final DateTime? productCreatedAt;
  final int lowStockThreshold;

  /// Units held back from online orders (web `onlineOutOfStockThreshold`).
  final int onlineOutOfStockThreshold;
}

class StockBatch {
  const StockBatch({
    required this.id,
    required this.batchNumber,
    required this.receivedQty,
    required this.remainingQty,
    required this.receivedAt,
    required this.status,
    this.batchType,
    this.batchGroupNumber,
    this.unitCost,
    this.note,
    this.productId,
    this.productName,
    this.productImageUrl,
  });

  final String id;
  final String batchNumber;

  /// RESET | EMERGENCY
  final String? batchType;
  final String? batchGroupNumber;
  final int receivedQty;
  final int remainingQty;
  final DateTime receivedAt;

  /// ACTIVE | DEPLETED | WRITTEN_OFF
  final String status;
  final double? unitCost;
  final String? note;
  final String? productId;
  final String? productName;
  final String? productImageUrl;
}

class LedgerBalance {
  const LedgerBalance({required this.date, required this.stock, required this.value, this.lkrMargin});
  final String date;
  final int stock;
  final double value;
  final double? lkrMargin;
}

/// One day of the stock movement ledger.
class LedgerRow {
  const LedgerRow({
    required this.date,
    required this.stockMargin,
    required this.closingValue,
    this.openStock,
    this.stockValue,
    this.stockIn,
    this.stockOut,
    this.lkrIn,
    this.lkrOut,
    this.lkrMargin,
    this.discountTotal,
    this.batchNumbers,
    this.batches = const [],
  });

  /// `yyyy-MM-dd`.
  final String date;
  final int? openStock;
  final double? stockValue;
  final int? stockIn;
  final int? stockOut;
  final double? lkrIn;
  final double? lkrOut;
  final int stockMargin;
  final double closingValue;
  final double? lkrMargin;
  final double? discountTotal;
  final String? batchNumbers;
  final List<StockBatch> batches;

  bool get hasMovement => (stockIn ?? 0) > 0 || (stockOut ?? 0) > 0 || batches.isNotEmpty;
}

class StockLedger {
  const StockLedger({
    required this.productName,
    required this.productCost,
    required this.from,
    required this.to,
    required this.opening,
    required this.broughtForward,
    required this.rows,
  });

  final String productName;
  final double productCost;
  final String from;
  final String to;
  final LedgerBalance opening;
  final LedgerBalance broughtForward;
  final List<LedgerRow> rows;
}

/// Unit cost / selling price for the product-wise ledger header.
class StockPricing {
  const StockPricing({
    required this.unitCost,
    required this.sellingPrice,
    required this.batchesInRange,
    required this.receivedQtyInRange,
  });
  final double unitCost;
  final double sellingPrice;
  final int batchesInRange;
  final int receivedQtyInRange;
}
