/// Signed-in staff member — mirrors the web `AdminSession` (lib/adminAuth.ts).
class AdminSession {
  const AdminSession({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.storeId,
    this.storeName,
    this.storeCity,
    this.deliveryEnabled,
  });

  final String id;
  final String name;
  final String email;

  /// SYSTEM_ADMIN | STORE_MANAGER | CASHIER | DELIVERY_ADMIN | REPORT_VIEWER
  final String role;
  final String? storeId;
  final String? storeName;
  final String? storeCity;

  /// Store delivery flag for branch-scoped accounts; null for HQ roles.
  final bool? deliveryEnabled;

  bool get isSuperAdmin => role == 'SYSTEM_ADMIN';
  bool get isBranchAdmin => role == 'STORE_MANAGER';
  bool get isCashier => role == 'CASHIER';
  bool get isDeliveryAdmin => role == 'DELIVERY_ADMIN';
  bool get isBranchScoped => isBranchAdmin || isCashier;

  /// HQ roles see every branch and need the store shown on each order.
  bool get isAllBranchView => isSuperAdmin || isDeliveryAdmin;

  /// Only an explicit `false` means pickup-only (unknown is not pickup-only).
  bool get isPickupOnly => isBranchScoped && deliveryEnabled == false;

  /// "Bing Chun - Nugegoda" → "Nugegoda".
  String? get branchLabel => storeName?.replaceFirst('Bing Chun - ', '');
}
