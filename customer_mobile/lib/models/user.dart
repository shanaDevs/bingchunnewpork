class CustomerUser {
  final String id;
  final String name;
  final String? email;
  final String phone;
  // Loyalty program not live yet — kept for API compatibility
  final int loyaltyPoints;
  final bool notifyEmail;
  final bool notifySms;
  final bool notifyPush;

  CustomerUser({
    required this.id,
    required this.name,
    this.email,
    required this.phone,
    required this.loyaltyPoints,
    required this.notifyEmail,
    required this.notifySms,
    required this.notifyPush,
  });

  factory CustomerUser.fromJson(Map<String, dynamic> json) {
    return CustomerUser(
      id: json['id'] as String,
      name: json['name'] as String,
      email: json['email'] as String?,
      phone: json['phone'] as String,
      loyaltyPoints: json['loyaltyPoints'] as int? ?? 0,
      notifyEmail: json['notifyEmail'] as bool? ?? true,
      notifySms: json['notifySms'] as bool? ?? true,
      notifyPush: json['notifyPush'] as bool? ?? true,
    );
  }

  bool get isProfileComplete => name.trim().isNotEmpty;

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'phone': phone,
      'loyaltyPoints': loyaltyPoints,
      'notifyEmail': notifyEmail,
      'notifySms': notifySms,
      'notifyPush': notifyPush,
    };
  }
}
