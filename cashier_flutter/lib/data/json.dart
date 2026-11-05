/// Tolerant JSON readers — every field defaulted so an older server that omits
/// one does not break parsing.
typedef Json = Map<String, dynamic>;

String str(Json j, String key, [String fallback = '']) {
  final v = j[key];
  if (v == null) return fallback;
  return v is String ? v : v.toString();
}

String? strOrNull(Json j, String key) {
  final v = j[key];
  if (v == null) return null;
  final s = v is String ? v : v.toString();
  return s.isEmpty ? null : s;
}

int intOf(Json j, String key, [int fallback = 0]) => intOrNull(j, key) ?? fallback;

int? intOrNull(Json j, String key) {
  final v = j[key];
  if (v is int) return v;
  if (v is num) return v.round();
  if (v is String) return int.tryParse(v) ?? double.tryParse(v)?.round();
  return null;
}

double dbl(Json j, String key, [double fallback = 0]) => dblOrNull(j, key) ?? fallback;

double? dblOrNull(Json j, String key) {
  final v = j[key];
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
}

bool boolOf(Json j, String key, [bool fallback = false]) => boolOrNull(j, key) ?? fallback;

bool? boolOrNull(Json j, String key) {
  final v = j[key];
  if (v is bool) return v;
  if (v is String) return v == 'true';
  if (v is num) return v != 0;
  return null;
}

DateTime? dateOrNull(Json j, String key) {
  final v = j[key];
  if (v is! String || v.isEmpty) return null;
  return DateTime.tryParse(v);
}

Json? objOrNull(Json j, String key) {
  final v = j[key];
  return v is Map ? Map<String, dynamic>.from(v) : null;
}

List<T> listOf<T>(Json j, String key, T Function(Json) parse) => listFrom(j[key], parse);

List<T> listFrom<T>(Object? v, T Function(Json) parse) {
  if (v is! List) return const [];
  return v.whereType<Map>().map((e) => parse(Map<String, dynamic>.from(e))).toList();
}

Json asJson(Object? v) => v is Map ? Map<String, dynamic>.from(v) : <String, dynamic>{};

/// Drops null values so request bodies only carry fields that are set.
Json compact(Json j) => {
  for (final e in j.entries)
    if (e.value != null) e.key: e.value,
};
