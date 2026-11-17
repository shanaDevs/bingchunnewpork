import '../../core/runtime_config.dart';
import '../../domain/entities/stock.dart';
import '../json.dart';

StockItem stockItemFromJson(Json j) {
  final category = objOrNull(j, 'category') ?? const <String, dynamic>{};
  return StockItem(
    productId: str(j, 'productId'),
    name: str(j, 'name'),
    imageUrl: AppConfig.resolveAssetUrl(strOrNull(j, 'imageUrl')),
    tag: strOrNull(j, 'tag'),
    categoryName: str(category, 'name'),
    categorySlug: str(category, 'slug'),
    basePrice: dbl(j, 'basePrice'),
    cost: dbl(j, 'cost'),
    isAvailable: boolOf(j, 'isAvailable'),
    weeklyTargetQty: intOf(j, 'weeklyTargetQty'),
    weeklyReceivedQty: intOf(j, 'weeklyReceivedQty'),
    onHandQty: intOf(j, 'onHandQty'),
    onlineAvailableQty: intOf(j, 'onlineAvailableQty'),
    batchCount: intOf(j, 'batchCount'),
    totalBatchCount: intOrNull(j, 'totalBatchCount'),
    frozenBatchCount: intOf(j, 'frozenBatchCount'),
    frozenQty: intOf(j, 'frozenQty'),
    isBranchDeactivated: boolOf(j, 'isBranchDeactivated'),
    catalogAvailable: boolOf(j, 'catalogAvailable', true),
    isLowStock: boolOf(j, 'isLowStock'),
    isOutOfStock: boolOf(j, 'isOutOfStock'),
    isNewProduct: boolOrNull(j, 'isNewProduct'),
    productCreatedAt: dateOrNull(j, 'productCreatedAt'),
    lowStockThreshold: intOf(j, 'lowStockThreshold', 25),
  );
}

StockBatch stockBatchFromJson(Json j) {
  final product = objOrNull(j, 'product') ?? const <String, dynamic>{};
  return StockBatch(
    id: str(j, 'id'),
    batchNumber: str(j, 'batchNumber'),
    batchType: strOrNull(j, 'batchType'),
    batchGroupNumber: strOrNull(j, 'batchGroupNumber'),
    receivedQty: intOf(j, 'receivedQty'),
    remainingQty: intOf(j, 'remainingQty'),
    receivedAt: dateOrNull(j, 'receivedAt') ?? DateTime.now(),
    status: str(j, 'status', 'ACTIVE'),
    unitCost: dblOrNull(j, 'unitCost'),
    note: strOrNull(j, 'note'),
    productId: strOrNull(j, 'productId') ?? strOrNull(product, 'id'),
    productName: strOrNull(j, 'productName') ?? strOrNull(product, 'name'),
    productImageUrl: AppConfig.resolveAssetUrl(strOrNull(product, 'imageUrl')),
  );
}

LedgerBalance _balance(Json j) => LedgerBalance(
  date: str(j, 'date'),
  stock: intOf(j, 'stock'),
  value: dbl(j, 'value'),
  lkrMargin: dblOrNull(j, 'lkrMargin'),
);

StockLedger stockLedgerFromJson(Json j) {
  final product = objOrNull(j, 'product') ?? const <String, dynamic>{};
  return StockLedger(
    productName: str(product, 'name'),
    productCost: dbl(product, 'cost'),
    from: str(j, 'from'),
    to: str(j, 'to'),
    opening: _balance(objOrNull(j, 'opening') ?? const {}),
    broughtForward: _balance(objOrNull(j, 'broughtForward') ?? const {}),
    rows: listOf(
      j,
      'rows',
      (r) => LedgerRow(
        date: str(r, 'date'),
        openStock: intOrNull(r, 'openStock'),
        stockValue: dblOrNull(r, 'stockValue'),
        stockIn: intOrNull(r, 'stockIn'),
        stockOut: intOrNull(r, 'stockOut'),
        lkrIn: dblOrNull(r, 'lkrIn'),
        lkrOut: dblOrNull(r, 'lkrOut'),
        stockMargin: intOf(r, 'stockMargin'),
        closingValue: dbl(r, 'closingValue'),
        lkrMargin: dblOrNull(r, 'lkrMargin'),
        discountTotal: dblOrNull(r, 'discountTotal'),
        batchNumbers: strOrNull(r, 'batchNumbers'),
        batches: listOf(r, 'batches', stockBatchFromJson),
      ),
    ),
  );
}

StockPricing stockPricingFromJson(Json j) => StockPricing(
  unitCost: dbl(j, 'unitCost'),
  sellingPrice: dbl(j, 'sellingPrice'),
  batchesInRange: intOf(j, 'batchesInRange'),
  receivedQtyInRange: intOf(j, 'receivedQtyInRange'),
);
