import '../../core/runtime_config.dart';
import '../../domain/entities/admin.dart';
import '../json.dart';

/// JSON → admin entity mappers. Every field is read tolerantly (see json.dart).

const _empty = <String, dynamic>{};

List<NamedValue> _named(Object? v, {String label = 'label', String value = 'amount', String? count}) => listFrom(
  v,
  (j) => NamedValue(
    str(j, label, str(j, 'month', str(j, 'name'))),
    dbl(j, value),
    count: count == null ? null : intOrNull(j, count),
  ),
);

BranchChannelRow branchChannelFromJson(Json j) => BranchChannelRow(
  label: str(j, 'label', str(j, 'branchName')),
  delivery: dbl(j, 'delivery'),
  pickupCash: dbl(j, 'pickupCash'),
  pickupOnline: dbl(j, 'pickupOnline'),
  pickupCard: dbl(j, 'pickupCard'),
  orderCount: intOrNull(j, 'orderCount'),
  grossSales: dblOrNull(j, 'grossSales'),
);

ChannelBreakdown channelsFromJson(Json j) => ChannelBreakdown(
  pickupCashTotal: dbl(j, 'pickupCashTotal'),
  pickupCashCount: intOf(j, 'pickupCashCount'),
  pickupCardTotal: dbl(j, 'pickupCardTotal'),
  pickupCardCount: intOf(j, 'pickupCardCount'),
  pickupOnlineTotal: dbl(j, 'pickupOnlineTotal'),
  pickupOnlineCount: intOf(j, 'pickupOnlineCount'),
  deliveryOnlineTotal: dbl(j, 'deliveryOnlineTotal'),
  deliveryOnlineCount: intOf(j, 'deliveryOnlineCount'),
);

ProductSale productSaleFromJson(Json j) => ProductSale(
  name: str(j, 'productName', str(j, 'name')),
  quantity: intOf(j, 'quantity'),
  revenue: dbl(j, 'revenue'),
  imageUrl: AppConfig.resolveAssetUrl(strOrNull(j, 'imageUrl')),
);

TopCustomer topCustomerFromJson(Json j) => TopCustomer(
  rank: intOf(j, 'rank'),
  name: str(j, 'name', '—'),
  phone: strOrNull(j, 'phone'),
  orders: intOf(j, 'orders'),
  totalSpend: dbl(j, 'totalSpend'),
  homeBranch: strOrNull(j, 'homeBranch'),
);

BranchPerformance branchPerformanceFromJson(Json j) => BranchPerformance(
  storeId: str(j, 'storeId'),
  branchName: str(j, 'branchName'),
  totalOrders: intOf(j, 'totalOrders'),
  grossSales: dbl(j, 'grossSales'),
  tier: strOrNull(j, 'tier'),
  deliveryEnabled: boolOrNull(j, 'deliveryEnabled'),
  growthPercent: dblOrNull(j, 'growthPercent'),
  deliveryPercent: dblOrNull(j, 'deliveryPercent'),
  netTakeHome: dblOrNull(j, 'netTakeHome'),
  commission: dblOrNull(j, 'commission'),
);

RiderRank riderRankFromJson(Json j) => RiderRank(
  name: str(j, 'riderName', str(j, 'name', '—')),
  orders: intOf(j, 'distinctOrders', intOf(j, 'orderCount')),
  jobs: intOf(j, 'completedJobs', intOf(j, 'jobCount')),
  distanceKm: dbl(j, 'totalDistanceKm'),
  onlineMinutes: intOf(j, 'onlineTimeMinutes'),
  photoUrl: AppConfig.resolveAssetUrl(strOrNull(j, 'profilePhotoUrl')),
);

SuperDashboard superDashboardFromJson(Json j) {
  final channels = objOrNull(j, 'revenueChannels') ?? _empty;
  final delivery = objOrNull(j, 'delivery') ?? _empty;
  final takeaway = objOrNull(j, 'takeaway') ?? _empty;
  final party = objOrNull(j, 'discountsByParty');
  return SuperDashboard(
    periodRevenue: dbl(j, 'periodRevenue'),
    periodRefundAmount: dbl(j, 'periodRefundAmount'),
    jasonInvestedAmount: dbl(j, 'jasonInvestedAmount'),
    periodOrders: intOf(j, 'periodOrders'),
    cancelledOrders: intOf(j, 'cancelledOrders'),
    onlineWalletBalance: dbl(j, 'onlineWalletBalance') / 100,
    totalPayable: dbl(j, 'totalPayable') / 100,
    pickupCash: dbl(channels, 'pickupCash'),
    pickupCard: dbl(channels, 'pickupCard'),
    pickupOnline: dbl(channels, 'pickupOnline'),
    deliveryOnline: dbl(delivery, 'revenue', dbl(channels, 'deliveryCard')),
    deliveryOrders: intOf(delivery, 'orders'),
    takeawayOrders: intOf(takeaway, 'orders'),
    monthly: listOf(
      j,
      'monthlyOverview',
      (m) => (month: str(m, 'month'), revenue: dbl(m, 'revenue'), outflow: dbl(m, 'outflow'), orders: intOf(m, 'orders')),
    ),
    outflowByMethod: _named(j['outflowByMethod']),
    topRefundBranches: _named(j['topRefundBranches'], label: 'branchName', count: 'count'),
    topRiders: listOf(j, 'topDeliveryRiders', riderRankFromJson),
    topProducts: listOf(
      j,
      'topProducts',
      (p) => (
        name: str(p, 'productName'),
        quantity: intOf(p, 'quantity'),
        revenue: dbl(p, 'revenue'),
        imageUrl: AppConfig.resolveAssetUrl(strOrNull(p, 'imageUrl')),
      ),
    ),
    discountsByParty: party == null
        ? null
        : DiscountsByParty(
            total: dbl(party, 'total'),
            slices: [
              NamedValue('Branch', dbl(party, 'branch')),
              NamedValue('JASON', dbl(party, 'jason')),
              NamedValue('Platform', dbl(party, 'platform')),
            ],
          ),
  );
}

KpiChange _change(Json j) =>
    KpiChange(current: dbl(j, 'current'), previous: dbl(j, 'previous'), changePercent: dbl(j, 'changePercent'));

BrandAnalytics brandAnalyticsFromJson(Json j) {
  final kpi = objOrNull(j, 'kpiCards') ?? _empty;
  final cmp = objOrNull(j, 'kpiComparison') ?? _empty;
  final rev = objOrNull(j, 'revenueBreakdown') ?? _empty;
  final status = objOrNull(j, 'orderStatus') ?? _empty;
  final platform = objOrNull(j, 'orderPlatform') ?? _empty;
  final behavior = objOrNull(j, 'customerBehavior') ?? _empty;
  return BrandAnalytics(
    grossSales: dbl(kpi, 'grossSales'),
    totalOrders: intOf(kpi, 'totalOrders'),
    totalCups: intOf(kpi, 'totalCups'),
    deliveryRevenue: dbl(kpi, 'totalDeliveryRevenue'),
    convenienceRevenue: dbl(kpi, 'totalConvenienceRevenue'),
    netRevenue: dblOrNull(kpi, 'netRevenue'),
    deliveryOrders: intOf(kpi, 'deliveryOrders'),
    pickupOrders: intOf(kpi, 'pickupOrders'),
    comparison: {
      for (final e in cmp.entries)
        if (e.value is Map) e.key: _change(asJson(e.value)),
    },
    revenueDelivery: dbl(rev, 'delivery'),
    revenuePickup: dbl(rev, 'pickup'),
    statusCompleted: intOf(status, 'completed'),
    statusPreparing: intOf(status, 'preparing'),
    statusPending: intOf(status, 'pending'),
    statusCancelled: intOf(status, 'cancelled'),
    salesOverview: _named(j['salesOverview'], label: 'period', value: 'revenue', count: 'orders'),
    branchPerformance: listOf(j, 'branchPerformance', branchPerformanceFromJson),
    leastPerforming: listOf(j, 'leastPerformingBranches', branchPerformanceFromJson),
    channels: channelsFromJson(objOrNull(j, 'paymentChannelBreakdown') ?? _empty),
    topProducts: listOf(j, 'topProducts', productSaleFromJson),
    leastProducts: listOf(j, 'leastProducts', productSaleFromJson),
    topCustomers: listOf(j, 'topCustomers', topCustomerFromJson),
    hourly: _named(j['hourlyPeakTimes'], value: 'orders'),
    stores: listOf(
      j,
      'stores',
      (s) => StoreRef(
        id: str(s, 'id'),
        name: str(s, 'name'),
        deliveryEnabled: boolOrNull(s, 'deliveryEnabled'),
        tier: strOrNull(s, 'tier'),
      ),
    ),
    webOrders: intOf(platform, 'webCount'),
    mobileOrders: intOf(platform, 'mobileCount'),
    firstTimeBuyers: intOf(behavior, 'firstTimeBuyers'),
    loyalCustomers: intOf(behavior, 'loyalCustomers'),
    orderSummaryByBranch: listOf(j, 'orderSummaryByBranch', branchChannelFromJson),
  );
}

BranchAnalytics branchAnalyticsFromJson(Json j) {
  final kpi = objOrNull(j, 'kpiCards') ?? _empty;
  final dc = objOrNull(j, 'dartcodesPayments') ?? _empty;
  return BranchAnalytics(
    grossSales: dbl(kpi, 'grossSales'),
    totalOrders: intOf(kpi, 'totalOrders'),
    deliveryRevenue: dbl(kpi, 'totalDeliveryRevenue'),
    convenienceRevenue: dbl(kpi, 'totalConvenienceRevenue'),
    avgOrderValue: dbl(kpi, 'avgOrderValue'),
    gatewayFee: dbl(kpi, 'gatewayFee'),
    commissionFee: dbl(kpi, 'commissionFee'),
    grossAfterFees: dbl(kpi, 'grossAfterFees'),
    periodCommission: dbl(dc, 'periodCommission'),
    totalOwed: dbl(dc, 'totalOwed'),
    effectiveSlabRate: dbl(dc, 'effectiveSlabRate'),
    orderSummary: listOf(j, 'orderSummaryChart', branchChannelFromJson),
    orderMode: listOf(
      j,
      'orderModeChart',
      (m) => (label: str(m, 'label'), delivery: dbl(m, 'delivery'), pickup: dbl(m, 'pickup')),
    ),
    channels: channelsFromJson(objOrNull(j, 'paymentChannelBreakdown') ?? _empty),
    hourly: _named(j['hourlyPeakTimes'], value: 'orders'),
    topProducts: listOf(j, 'topProducts', productSaleFromJson),
    topCustomers: listOf(j, 'topCustomers', topCustomerFromJson),
    discountsByMonth: _named(j['discountsByMonth'], label: 'month', value: 'totalDiscount'),
    refundByMonth: _named(j['refundByMonth'], label: 'month', value: 'amountLkr', count: 'count'),
    outflowByMethod: _named(j['outflowByMethod']),
  );
}

// ---------------------------------------------------------------- Refunds

String? _customerName(Json order) {
  final user = objOrNull(order, 'user') ?? _empty;
  return strOrNull(user, 'name') ?? strOrNull(order, 'guestName');
}

RefundRow refundFromJson(Json j) {
  final order = objOrNull(j, 'order') ?? _empty;
  final user = objOrNull(order, 'user') ?? _empty;
  final store = objOrNull(order, 'store') ?? _empty;
  final events = listOf(order, 'statusEvents', (e) => str(e, 'status'));
  // Web cancelledAtStatusOf: the stored status, else the last status before CANCELLED.
  final beforeCancel = events.where((s) => s != 'CANCELLED').toList();
  return RefundRow(
    id: str(j, 'id'),
    status: str(j, 'status', RefundStatus.received),
    createdAt: dateOrNull(j, 'createdAt') ?? DateTime.now(),
    orderNumber: str(order, 'orderNumber'),
    orderKey: str(order, 'orderNumber', str(j, 'orderId')),
    orderTotal: dbl(j, 'orderTotal', dbl(order, 'total')),
    salesTotal: dbl(j, 'salesTotal'),
    deliveryFee: dbl(j, 'deliveryFee', dbl(order, 'deliveryFee')),
    convenienceFee: dbl(j, 'convenienceFee', dbl(order, 'convenientFee')),
    cancellationReason: str(j, 'cancellationReason'),
    cancelledWithinWindow: boolOf(j, 'cancelledWithinWindow'),
    orderMode: str(order, 'orderMode', 'TAKEAWAY'),
    paymentMethod: str(order, 'paymentMethod'),
    paymentStatus: str(order, 'paymentStatus'),
    customerName: strOrNull(j, 'customerName') ?? _customerName(order),
    customerPhone: strOrNull(user, 'phone') ?? strOrNull(order, 'guestPhone'),
    customReasonText: strOrNull(j, 'customReasonText'),
    refundPercentage: dblOrNull(j, 'refundPercentage'),
    configuredStatusRefundPercentage: dblOrNull(j, 'configuredStatusRefundPercentage'),
    refundAmount: dblOrNull(j, 'refundAmount'),
    additionalGatewayFee: dblOrNull(j, 'additionalGatewayFee'),
    cancelledAtStatus: strOrNull(j, 'cancelledAtStatus') ?? (beforeCancel.isEmpty ? null : beforeCancel.last),
    submittedBy: strOrNull(j, 'submittedBy'),
    adminNotes: strOrNull(j, 'adminNotes'),
    storeName: strOrNull(store, 'name'),
  );
}

RefundSummary refundSummaryFromJson(Json j) => RefundSummary(
  count: intOf(j, 'count'),
  customer: dbl(j, 'customerReceiveTotalLkr'),
  branch: dbl(j, 'branchReceiveTotalLkr'),
  delivery: dbl(j, 'deliveryReceiveTotalLkr'),
  platform: dbl(j, 'platformReceiveTotalLkr'),
);

AppSettingsInfo appSettingsFromJson(Json j) => AppSettingsInfo(
  pickupAllowAddItemsPaidOnline: boolOf(j, 'pickupAllowAddItemsPaidOnline'),
  pickupAllowEditCashUnpaid: boolOf(j, 'pickupAllowEditCashUnpaid'),
  weeklyResetDay: intOrNull(j, 'weeklyResetDay'),
  maxCupsPerRider: intOf(j, 'maxCupsPerRider', 20),
  cancelWindowMinutes: intOf(j, 'cancelWindowMinutes', 10),
);

// ---------------------------------------------------------------- JASON, menu

JasonLedger jasonFromJson(Json j) {
  final summary = objOrNull(j, 'summary') ?? _empty;
  return JasonLedger(
    entries: listOf(
      j,
      'entries',
      (e) => JasonEntry(
        id: str(e, 'id'),
        type: str(e, 'type', 'EXPENSE'),
        // `amount` is stored cents (a string); `amountLkr` is the display value.
        amount: dblOrNull(e, 'amountLkr') ?? dbl(e, 'amount') / 100,
        description: str(e, 'description'),
        occurredAt: dateOrNull(e, 'occurredAt'),
        isActive: boolOf(e, 'isActive', true),
        storeWithdrawalId: strOrNull(e, 'storeWithdrawalId'),
      ),
    ),
    totalInvestments: dbl(summary, 'totalInvestments'),
    totalExpenses: dbl(summary, 'totalExpenses'),
    net: dbl(summary, 'net'),
  );
}

AdminProduct adminProductFromJson(Json j) {
  final urls = (j['imageUrls'] is List ? (j['imageUrls'] as List) : const [])
      .whereType<String>()
      .where((u) => u.isNotEmpty)
      .toList();
  final cover = strOrNull(j, 'imageUrl');
  return AdminProduct(
    id: str(j, 'id'),
    name: str(j, 'name'),
    categoryId: str(j, 'categoryId'),
    categoryName: str(objOrNull(j, 'category') ?? _empty, 'name'),
    basePrice: dbl(j, 'basePrice'),
    cost: dbl(j, 'cost'),
    isAvailable: boolOf(j, 'isAvailable'),
    isDeliveryAvailable: boolOf(j, 'isDeliveryAvailable', true),
    toppingIds: [
      for (final pt in listOf(j, 'toppings', (t) => t))
        ?(strOrNull(pt, 'toppingId') ?? strOrNull(objOrNull(pt, 'topping') ?? _empty, 'id')),
    ],
    imageUrls: urls.isNotEmpty ? urls : [?cover],
    description: strOrNull(j, 'description'),
    ingredients: strOrNull(j, 'ingredients'),
    tag: strOrNull(j, 'tag'),
  );
}

AdminTopping adminToppingFromJson(Json j) => AdminTopping(
  id: str(j, 'id'),
  name: str(j, 'name'),
  extraPrice: dbl(j, 'extraPrice'),
  isAvailable: boolOf(j, 'isAvailable', true),
);

// ---------------------------------------------------------------- Wallet

WalletOverview walletOverviewFromJson(Json j) {
  final dash = objOrNull(j, 'dashboard');
  final sum = objOrNull(j, 'summary');
  return WalletOverview(
    wallets: listOf(j, 'wallets', (w) {
      final store = objOrNull(w, 'store') ?? _empty;
      final count = objOrNull(w, '_count') ?? _empty;
      return StoreWallet(
        storeId: str(w, 'storeId'),
        storeName: str(store, 'name'),
        city: str(store, 'city'),
        isActive: boolOf(store, 'isActive', true),
        balanceCents: dblOrNull(w, 'allTimeAvailableBalanceCents') ?? dbl(w, 'balance'),
        transactionCount: intOf(count, 'transactions'),
      );
    }),
    dashboard: dash == null
        ? null
        : () {
            final earn = objOrNull(dash, 'allTimeEarnings') ?? _empty;
            final pay = objOrNull(dash, 'allTimePayments') ?? _empty;
            return WalletDashboard(
              earningsTotalCents: dbl(earn, 'total'),
              pickupOnlineInCents: dbl(earn, 'pickupOnlineIn'),
              deliveryOnlineInCents: dbl(earn, 'deliveryOnlineIn'),
              toBranchCents: dbl(pay, 'toBranchCents'),
              toPlatformCents: dbl(pay, 'toPlatformCents'),
              toDeliveryLkr: dbl(pay, 'toDeliveryLkr'),
              liveEarningsCents: dbl(dash, 'liveEarningsCents'),
              refundsLkr: dbl(dash, 'refundsLkr'),
            );
          }(),
    summary: sum == null
        ? null
        : WalletSummary(
            currentBalanceCents: dbl(sum, 'currentBalance'),
            totalEarningsCents: dbl(sum, 'totalEarnings'),
            totalWithdrawnCents: dbl(sum, 'totalWithdrawn'),
            pendingWithdrawalCents: dbl(sum, 'pendingWithdrawalTotal'),
            availableBalanceCents: dbl(sum, 'availableBalance'),
          ),
  );
}

Withdrawal withdrawalFromJson(Json j) => Withdrawal(
  id: str(j, 'id'),
  amountCents: dbl(j, 'amount'),
  status: str(j, 'status', 'PENDING'),
  createdAt: dateOrNull(j, 'createdAt') ?? DateTime.now(),
  periodFrom: dateOrNull(j, 'periodFrom'),
  periodTo: dateOrNull(j, 'periodTo'),
  paymentMethod: strOrNull(j, 'paymentMethod'),
  remarks: strOrNull(j, 'remarks'),
  rejectionReason: strOrNull(j, 'rejectionReason'),
  reviewedAt: dateOrNull(j, 'reviewedAt'),
);

WalletTxn walletTxnFromJson(Json j) => WalletTxn(
  id: str(j, 'id'),
  type: str(j, 'type'),
  direction: str(j, 'direction'),
  amountCents: dbl(j, 'amount').abs(),
  createdAt: dateOrNull(j, 'createdAt') ?? DateTime.now(),
  description: strOrNull(j, 'description'),
  reference: strOrNull(j, 'reference'),
);

WalletTxnSummary walletTxnSummaryFromJson(Json j) => WalletTxnSummary(
  totalIn: dbl(j, 'totalIn'),
  deliveryIn: dbl(j, 'deliveryIn'),
  pickupOnlineIn: dbl(j, 'pickupOnlineIn'),
  pickupStoreIn: dbl(j, 'pickupStoreIn'),
  totalOut: dbl(j, 'totalOut'),
);

// ---------------------------------------------------------------- Promotions

PromoMoney _promoMoney(Json j) => PromoMoney(
  orderSales: dbl(j, 'orderSales'),
  totalDiscount: dbl(j, 'totalDiscount'),
  discountPct: dbl(j, 'discountPct'),
  branchShare: dbl(j, 'branchShare'),
  platformShare: dbl(j, 'platformShare'),
  usageCount: intOf(j, 'usageCount'),
);

PromoBranchLine _promoBranch(Json j) => PromoBranchLine(
  storeId: str(j, 'storeId'),
  storeName: str(j, 'storeName'),
  orderCount: intOf(j, 'orderCount'),
  grossSales: dbl(j, 'grossSales'),
  money: _promoMoney(j),
  promos: listOf(j, 'promos', _promoLine),
);

PromoLine _promoLine(Json j) => PromoLine(
  code: str(j, 'promoCode'),
  title: strOrNull(j, 'title'),
  ownership: str(j, 'ownership', 'PLATFORM'),
  money: _promoMoney(j),
  children: listOf(j, 'branches', _promoBranch),
);

PromoReport promoReportFromJson(Json j) {
  final totals = objOrNull(j, 'totals') ?? _empty;
  return PromoReport(
    from: str(j, 'from'),
    to: str(j, 'to'),
    orderCount: intOf(totals, 'orderCount'),
    grossSales: dbl(totals, 'grossSales'),
    totals: _promoMoney(totals),
    byBranch: listOf(j, 'byBranch', _promoBranch),
    byPromo: listOf(j, 'byPromo', _promoLine),
  );
}

// ---------------------------------------------------------------- Staff & delivery ops

CashierAccount cashierAccountFromJson(Json j) => CashierAccount(
  id: str(j, 'id'),
  name: str(j, 'name'),
  email: str(j, 'email'),
  isActive: boolOf(j, 'isActive', true),
  lastLoginAt: dateOrNull(j, 'lastLoginAt'),
);

DriverRow driverFromJson(Json j) => DriverRow(
  id: str(j, 'id'),
  name: str(j, 'name'),
  isActive: boolOf(j, 'isActive', true),
  dutyStatus: str(j, 'dutyStatus', 'OFF_DUTY'),
  completedJobs: intOf(j, 'completedJobCount'),
  totalDeliveryFees: dbl(j, 'totalDeliveryFees'),
  phone: strOrNull(j, 'phone'),
  vehicleType: strOrNull(j, 'vehicleType'),
  vehicleNumber: strOrNull(j, 'vehicleNumber'),
  photoUrl: AppConfig.resolveAssetUrl(strOrNull(j, 'profilePhotoUrl')),
  rating: dblOrNull(j, 'avgRiderRating'),
  ratingCount: intOf(j, 'riderRatingCount'),
  homeBranch: strOrNull(objOrNull(j, 'store') ?? _empty, 'name'),
  meritStatus: strOrNull(j, 'meritStatus'),
  lastLoginAt: dateOrNull(j, 'lastLoginAt'),
);

String? _orderCustomer(Json order) {
  final user = objOrNull(order, 'user') ?? _empty;
  return strOrNull(user, 'name') ?? strOrNull(order, 'guestName');
}

DriverComplaint complaintFromJson(Json j) {
  final order = objOrNull(j, 'order') ?? _empty;
  return DriverComplaint(
    id: str(j, 'id'),
    category: str(j, 'category'),
    description: str(j, 'description'),
    status: str(j, 'status', 'OPEN'),
    createdAt: dateOrNull(j, 'createdAt') ?? DateTime.now(),
    driverName: strOrNull(objOrNull(j, 'driver') ?? _empty, 'name'),
    orderNumber: strOrNull(order, 'orderNumber'),
    customerName: _orderCustomer(order),
    resolvedByName: strOrNull(j, 'resolvedByName'),
  );
}

DeliveryFailure failureFromJson(Json j) {
  final order = objOrNull(j, 'order') ?? _empty;
  return DeliveryFailure(
    id: str(j, 'id'),
    outcome: str(j, 'outcome'),
    attemptNo: intOf(j, 'attemptNo', 1),
    createdAt: dateOrNull(j, 'createdAt') ?? DateTime.now(),
    note: strOrNull(j, 'note'),
    driverName: strOrNull(objOrNull(j, 'driver') ?? _empty, 'name'),
    orderNumber: strOrNull(order, 'orderNumber') ?? strOrNull(j, 'orderNumber'),
    customerName: strOrNull(j, 'customerName') ?? _orderCustomer(order),
    reassignmentStatus: strOrNull(j, 'reassignmentStatus'),
  );
}

DeliveryOpsDashboard deliveryDashboardFromJson(Json j) {
  final live = objOrNull(j, 'live') ?? _empty;
  final riders = objOrNull(live, 'riderStatus') ?? _empty;
  final period = objOrNull(j, 'period') ?? _empty;
  return DeliveryOpsDashboard(
    online: intOf(riders, 'online'),
    onDelivery: intOf(riders, 'onDelivery'),
    offDuty: intOf(riders, 'offDuty'),
    jobsInProgress: intOf(live, 'jobsInProgress'),
    completedJobs: intOf(period, 'completedJobs'),
    distinctOrders: intOf(period, 'distinctOrders'),
    totalDistanceKm: dbl(period, 'totalDistanceKm'),
    onlineMinutes: intOf(period, 'onlineTimeMinutes'),
    avgMinutesPerOrder: dblOrNull(period, 'averageTimePerOrderMinutes'),
    avgStationMinutes: dblOrNull(period, 'averageStationTimeMinutes'),
    topRiders: listOf(period, 'topRiders', riderRankFromJson),
    activeJobs: listOf(
      live,
      'activeJobs',
      (a) => (
        riderName: str(a, 'riderName', '—'),
        status: str(a, 'status'),
        orderCount: intOf(a, 'orderCount'),
        distanceKm: dblOrNull(a, 'totalDistanceKm'),
      ),
    ),
  );
}

BranchHours branchHoursFromJson(Json j) => BranchHours(
  storeName: str(j, 'storeName'),
  openTime: str(j, 'openTime', '09:00'),
  closeTime: str(j, 'closeTime', '23:00'),
  onlineStart: strOrNull(j, 'onlineOrderStartTime'),
  onlineStop: strOrNull(j, 'onlineOrderStopTime'),
  pickupCutoffMinutes: intOf(j, 'pickupCutoffMinutes', 50),
);
