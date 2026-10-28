class UserAddress {
  final String id;
  final String label;
  final String addressLine;
  final String city;
  final String district;
  final double? lat;
  final double? lng;
  final bool isDefault;

  UserAddress({
    required this.id,
    required this.label,
    required this.addressLine,
    required this.city,
    required this.district,
    this.lat,
    this.lng,
    required this.isDefault,
  });

  factory UserAddress.fromJson(Map<String, dynamic> json) {
    return UserAddress(
      id: json['id'] as String,
      label: json['label'] as String? ?? 'Home',
      addressLine: json['addressLine'] as String,
      city: json['city'] as String,
      district: json['district'] as String,
      lat: (json['lat'] as num?)?.toDouble(),
      lng: (json['lng'] as num?)?.toDouble(),
      isDefault: json['isDefault'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'label': label,
      'addressLine': addressLine,
      'city': city,
      'district': district,
      if (lat != null) 'lat': lat,
      if (lng != null) 'lng': lng,
      'isDefault': isDefault,
    };
  }
}
