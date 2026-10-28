class DriverSession {
  final String id;
  final String name;
  final String role;
  final String? storeId;
  final String? storeName;
  final String? storeCity;

  const DriverSession({
    required this.id,
    required this.name,
    required this.role,
    this.storeId,
    this.storeName,
    this.storeCity,
  });

  factory DriverSession.fromJson(Map<String, dynamic> json) {
    return DriverSession(
      id: json['id'] as String,
      name: json['name'] as String,
      role: json['role'] as String,
      storeId: json['storeId'] as String?,
      storeName: json['storeName'] as String?,
      storeCity: json['storeCity'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'role': role,
        'storeId': storeId,
        'storeName': storeName,
        'storeCity': storeCity,
      };
}
