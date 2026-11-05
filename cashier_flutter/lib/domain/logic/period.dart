import '../../core/format.dart';

/// Date filter shared by the dashboard and orders — port of the web DashboardPeriodFilter.
enum PeriodPreset { today, month, year, custom }

class PeriodFilter {
  const PeriodFilter(this.preset, {this.from, this.to});
  const PeriodFilter.today() : this(PeriodPreset.today);
  const PeriodFilter.month() : this(PeriodPreset.month);

  final PeriodPreset preset;
  final DateTime? from;
  final DateTime? to;

  /// A custom period is usable only once both ends are picked.
  bool get ready => preset != PeriodPreset.custom || (from != null && to != null);

  /// `startDate` / `endDate` for `/orders`.
  ({String? startDate, String? endDate}) get orderRange {
    final today = colomboToday();
    switch (preset) {
      case PeriodPreset.custom:
        if (from == null || to == null) return (startDate: null, endDate: null);
        return (startDate: formatYmd(from!), endDate: formatYmd(to!));
      case PeriodPreset.today:
        return (startDate: today, endDate: today);
      case PeriodPreset.month:
        return (startDate: '${today.substring(0, 7)}-01', endDate: today);
      case PeriodPreset.year:
        return (startDate: '${today.substring(0, 4)}-01-01', endDate: today);
    }
  }

  /// Query string for `/admin/dashboard`.
  Map<String, String> get dashboardQuery {
    if (preset == PeriodPreset.custom && from != null && to != null) {
      return {'period': 'custom', 'from': formatYmd(from!), 'to': formatYmd(to!)};
    }
    final name = preset == PeriodPreset.custom ? 'month' : preset.name;
    return {'period': name};
  }

  @override
  bool operator ==(Object other) =>
      other is PeriodFilter && other.preset == preset && other.from == from && other.to == to;

  @override
  int get hashCode => Object.hash(preset, from, to);
}
