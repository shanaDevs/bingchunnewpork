class Category {
  final String id;
  final String name;
  final String slug;
  final String? icon;
  final int sortOrder;
  final bool isActive;

  Category({
    required this.id,
    required this.name,
    required this.slug,
    this.icon,
    required this.sortOrder,
    required this.isActive,
  });

  factory Category.fromJson(Map<String, dynamic> json) {
    return Category(
      id: json['id'] as String,
      name: json['name'] as String,
      slug: json['slug'] as String,
      icon: json['icon'] as String?,
      sortOrder: json['sortOrder'] as int? ?? 0,
      isActive: json['isActive'] as bool? ?? true,
    );
  }
}
