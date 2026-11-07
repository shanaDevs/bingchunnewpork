import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:latlong2/latlong.dart';
import 'package:url_launcher/url_launcher.dart';

import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';
import 'app_map_tiles.dart';
import 'bc_map_pin.dart';
import 'design/bc_app_design.dart';

enum _StoreFilter { openNow, nearest, readySoon }
enum _ViewMode { map, list }

/// Figma-style pickup store selector (map + nearby list + confirm bar).
class PickupStorePicker extends StatefulWidget {
  final List<Map<String, dynamic>> stores;
  final bool isLoading;
  final String? selectedStoreId;
  final ValueChanged<Map<String, dynamic>> onSelect;
  final VoidCallback onConfirm;
  final VoidCallback onBack;
  final VoidCallback onChangeMethod;
  final VoidCallback? onRetry;

  const PickupStorePicker({
    super.key,
    required this.stores,
    required this.isLoading,
    required this.selectedStoreId,
    required this.onSelect,
    required this.onConfirm,
    required this.onBack,
    required this.onChangeMethod,
    this.onRetry,
  });

  @override
  State<PickupStorePicker> createState() => _PickupStorePickerState();
}

class _PickupStorePickerState extends State<PickupStorePicker> {
  final _searchController = TextEditingController();
  final _mapController = MapController();
  late final PageController _pageController;
  _StoreFilter _filter = _StoreFilter.nearest;
  _ViewMode _viewMode = _ViewMode.map;
  LatLng _userLatLng = const LatLng(6.9271, 79.8612);
  LatLng _mapCenter = const LatLng(6.9271, 79.8612);
  double _zoom = 12;
  String _query = '';
  bool _locating = false;
  bool _hasUserLocation = false;
  bool _syncingPage = false;
  List<Map<String, dynamic>> _localStores = [];

  @override
  void initState() {
    super.initState();
    _pageController = PageController(viewportFraction: 0.88);
    _localStores = widget.stores.map((e) => Map<String, dynamic>.from(e)).toList();
    _locateUser(promptIfNeeded: false);
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncPageToSelection(animate: false));
  }

  @override
  void didUpdateWidget(covariant PickupStorePicker oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.stores != widget.stores) {
      _localStores = widget.stores.map((e) => Map<String, dynamic>.from(e)).toList();
      if (_hasUserLocation) _recomputeDistances(_userLatLng);
    }
    if (oldWidget.selectedStoreId != widget.selectedStoreId) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _syncPageToSelection(animate: true));
      _moveMapToSelected();
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    _pageController.dispose();
    super.dispose();
  }

  void _recomputeDistances(LatLng user) {
    for (final store in _localStores) {
      final ll = storeLatLng(store);
      if (ll == null) {
        store['distanceKm'] = 99999.0;
        continue;
      }
      store['distanceKm'] =
          Geolocator.distanceBetween(user.latitude, user.longitude, ll.latitude, ll.longitude) / 1000.0;
    }
    _localStores.sort(_byDistance);
  }

  Future<bool> _ensureLocationPermission({required bool promptIfNeeded}) async {
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        if (!promptIfNeeded || !mounted) return false;
        final goSettings = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Turn on location'),
            content: const Text('Enable GPS to find the nearest Bing Chun store.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Not now')),
              TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Open settings')),
            ],
          ),
        );
        if (goSettings == true) await Geolocator.openLocationSettings();
        return false;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.denied) {
        if (mounted && promptIfNeeded) {
          showAppToast(context, 'Location permission is needed to find nearby stores.');
        }
        return false;
      }
      if (permission == LocationPermission.deniedForever) {
        if (!promptIfNeeded || !mounted) return false;
        final open = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: const Text('Location permission'),
            content: const Text('Location access is blocked. Open app settings to allow it.'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
              TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('App settings')),
            ],
          ),
        );
        if (open == true) await Geolocator.openAppSettings();
        return false;
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<void> _locateUser({required bool promptIfNeeded}) async {
    if (_locating) return;
    setState(() => _locating = true);
    try {
      final ok = await _ensureLocationPermission(promptIfNeeded: promptIfNeeded);
      if (!ok) return;
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );
      if (!mounted) return;
      final user = LatLng(pos.latitude, pos.longitude);
      setState(() {
        _userLatLng = user;
        _mapCenter = user;
        _zoom = 13.5;
        _hasUserLocation = true;
        _recomputeDistances(user);
      });
      try {
        _mapController.move(user, 13.5);
      } catch (_) {}
      if (promptIfNeeded && mounted) {
        showAppToast(context, 'Location updated — stores sorted by nearest', isError: false);
      }
      _syncPageToSelection(animate: true);
    } catch (e) {
      if (mounted && promptIfNeeded) {
        showAppToast(context, 'Could not get your location. Please try again.');
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  void _moveMapToSelected() {
    final store = _selectedStore;
    final latLng = store == null ? null : storeLatLng(store);
    if (latLng == null) return;
    try {
      _mapController.move(latLng, 14.5);
    } catch (_) {}
  }

  void _syncPageToSelection({required bool animate}) {
    final visible = _visibleStores;
    if (visible.isEmpty || !_pageController.hasClients) return;
    final id = widget.selectedStoreId;
    final index = id == null ? 0 : visible.indexWhere((s) => s['id'] == id);
    if (index < 0) return;
    _syncingPage = true;
    if (animate) {
      _pageController
          .animateToPage(index, duration: const Duration(milliseconds: 280), curve: Curves.easeOutCubic)
          .whenComplete(() => _syncingPage = false);
    } else {
      _pageController.jumpToPage(index);
      _syncingPage = false;
    }
  }

  void _onStoreChosen(Map<String, dynamic> store, {bool fromSlider = false}) {
    widget.onSelect(store);
    final ll = storeLatLng(store);
    if (ll != null) {
      try {
        _mapController.move(ll, 14.5);
      } catch (_) {}
    }
    if (!fromSlider) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _syncPageToSelection(animate: true));
    }
  }

  Future<void> _onFilterChanged(_StoreFilter next) async {
    setState(() => _filter = next);
    if (next == _StoreFilter.nearest) {
      await _locateUser(promptIfNeeded: true);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _syncPageToSelection(animate: false));
  }

  Map<String, dynamic>? get _selectedStore {
    final id = widget.selectedStoreId;
    if (id == null) return null;
    for (final s in _localStores) {
      if (s['id'] == id) return s;
    }
    return null;
  }

  List<Map<String, dynamic>> get _visibleStores {
    var list = List<Map<String, dynamic>>.from(_localStores);
    final q = _query.trim().toLowerCase();
    if (q.isNotEmpty) {
      list = list.where((s) {
        final name = (s['name'] as String? ?? '').toLowerCase();
        final addr = (s['addressLine'] as String? ?? '').toLowerCase();
        final city = (s['city'] as String? ?? '').toLowerCase();
        return name.contains(q) || addr.contains(q) || city.contains(q);
      }).toList();
    }

    switch (_filter) {
      case _StoreFilter.openNow:
        final open = list.where(isStoreOpenNow).toList();
        list = open.isEmpty ? list : open;
        list.sort(_byDistance);
        break;
      case _StoreFilter.nearest:
        list.sort(_byDistance);
        break;
      case _StoreFilter.readySoon:
        list.sort((a, b) {
          final ra = readyMinutes(a);
          final rb = readyMinutes(b);
          if (ra != rb) return ra.compareTo(rb);
          return _byDistance(a, b);
        });
        break;
    }
    return list;
  }

  int _byDistance(Map<String, dynamic> a, Map<String, dynamic> b) {
    final da = (a['distanceKm'] as num?)?.toDouble() ?? 99999.0;
    final db = (b['distanceKm'] as num?)?.toDouble() ?? 99999.0;
    return da.compareTo(db);
  }

  String get _selectedShortName {
    final name = _selectedStore?['name'] as String? ?? '';
    final parts = name.split(' - ');
    return parts.length > 1 ? parts.last.trim() : (name.isEmpty ? 'a store' : name);
  }

  Future<void> _openDirections(Map<String, dynamic> store) async {
    final latLng = storeLatLng(store);
    if (latLng == null) return;
    final uri = Uri.parse(
      'https://www.google.com/maps/dir/?api=1&destination=${latLng.latitude},${latLng.longitude}',
    );
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final visible = _visibleStores;
    final top = MediaQuery.paddingOf(context).top;

    return Theme(
      data: BcTheme.light,
      child: Scaffold(
        backgroundColor: const Color(0xFFF5F7FB),
        body: Column(
          children: [
            _PickupHeader(
              topInset: top,
              onBack: widget.onBack,
              onChangeMethod: widget.onChangeMethod,
            ),
            Expanded(
              child: _viewMode == _ViewMode.map
                  ? _buildMapLayout(visible)
                  : _buildListOnlyLayout(visible),
            ),
            _PickupConfirmBar(
              shortName: _selectedShortName,
              enabled: widget.selectedStoreId != null && !widget.isLoading,
              onConfirm: widget.onConfirm,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMapLayout(List<Map<String, dynamic>> visible) {
    return Column(
      children: [
        Expanded(
          child: Stack(
            children: [
              _buildMap(visible),
              Positioned(
                left: 16,
                right: 16,
                top: 12,
                child: _SearchField(
                  controller: _searchController,
                  onChanged: (v) => setState(() => _query = v),
                ),
              ),
              Positioned(
                right: 16,
                bottom: 56,
                child: _RoundMapButton(
                  icon: _locating ? Icons.hourglass_top_rounded : Icons.my_location_rounded,
                  onTap: () => _locateUser(promptIfNeeded: true),
                ),
              ),
              Positioned(
                right: 16,
                bottom: 12,
                child: _MapListToggle(
                  mode: _viewMode,
                  onChanged: (m) => setState(() => _viewMode = m),
                ),
              ),
            ],
          ),
        ),
        Container(
          color: Colors.white,
          padding: const EdgeInsets.fromLTRB(0, 10, 0, 4),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    _FilterChip(
                      label: 'Open now',
                      icon: Icons.check_rounded,
                      selected: _filter == _StoreFilter.openNow,
                      onTap: () => _onFilterChanged(_StoreFilter.openNow),
                    ),
                    const SizedBox(width: 8),
                    _FilterChip(
                      label: 'Nearest',
                      icon: Icons.explore_outlined,
                      selected: _filter == _StoreFilter.nearest,
                      onTap: () => _onFilterChanged(_StoreFilter.nearest),
                    ),
                    const SizedBox(width: 8),
                    _FilterChip(
                      label: 'Ready soon',
                      icon: Icons.schedule_rounded,
                      selected: _filter == _StoreFilter.readySoon,
                      onTap: () => _onFilterChanged(_StoreFilter.readySoon),
                    ),
                  ],
                ),
              ),
              if (widget.isLoading)
                const Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(color: BcColors.brand),
                )
              else if (visible.isEmpty)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 20),
                  child: Column(
                    children: [
                      const Text(
                        'No stores match',
                        style: TextStyle(color: BcDesign.cardNavy, fontWeight: FontWeight.w700),
                      ),
                      if (widget.onRetry != null)
                        TextButton(onPressed: widget.onRetry, child: const Text('Retry')),
                    ],
                  ),
                )
              else
                SizedBox(
                  height: 128,
                  child: PageView.builder(
                    controller: _pageController,
                    itemCount: visible.length,
                    onPageChanged: (i) {
                      if (_syncingPage) return;
                      _onStoreChosen(visible[i], fromSlider: true);
                    },
                    itemBuilder: (context, i) {
                      final store = visible[i];
                      return Padding(
                        padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
                        child: _PickupStoreCard(
                          store: store,
                          selected: store['id'] == widget.selectedStoreId,
                          onTap: () => _onStoreChosen(store),
                          onDirections: () => _openDirections(store),
                          compact: true,
                        ),
                      );
                    },
                  ),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildListOnlyLayout(List<Map<String, dynamic>> visible) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Row(
            children: [
              Expanded(
                child: _SearchField(
                  controller: _searchController,
                  onChanged: (v) => setState(() => _query = v),
                ),
              ),
              const SizedBox(width: 10),
              _MapListToggle(
                mode: _viewMode,
                onChanged: (m) => setState(() => _viewMode = m),
              ),
            ],
          ),
        ),
        Expanded(
          child: _NearbySheet(
            stores: visible,
            totalCount: _localStores.length,
            isLoading: widget.isLoading,
            selectedId: widget.selectedStoreId,
            filter: _filter,
            onFilterChanged: (f) {
              _onFilterChanged(f);
            },
            onSelect: (store) => _onStoreChosen(store),
            onDirections: _openDirections,
            onRetry: widget.onRetry,
            showHandle: false,
          ),
        ),
      ],
    );
  }

  Widget _buildMap(List<Map<String, dynamic>> visible) {
    final markers = <Marker>[
      Marker(
        point: _userLatLng,
        width: 18,
        height: 18,
        child: Container(
          decoration: BoxDecoration(
            color: BcColors.brand,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 3),
            boxShadow: [
              BoxShadow(color: BcColors.brand.withValues(alpha: 0.35), blurRadius: 8),
            ],
          ),
        ),
      ),
      for (final store in visible)
        if (storeLatLng(store) != null)
          Marker(
            point: storeLatLng(store)!,
            width: store['id'] == widget.selectedStoreId ? 110 : 42,
            height: store['id'] == widget.selectedStoreId ? 86 : 54,
            alignment: Alignment.bottomCenter,
            child: _StoreMapPin(
              selected: store['id'] == widget.selectedStoreId,
              distanceLabel: distanceLabel(store),
              open: isStoreOpenNow(store),
              onTap: () => _onStoreChosen(store),
            ),
          ),
    ];

    return FlutterMap(
      mapController: _mapController,
      options: MapOptions(
        initialCenter: _mapCenter,
        initialZoom: _zoom,
        onTap: (_, __) {},
      ),
      children: [
        const AppMapTiles(),
        MarkerLayer(markers: markers),
      ],
    );
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

LatLng? storeLatLng(Map<String, dynamic> store) {
  final lat = (store['lat'] as num?)?.toDouble() ?? (store['latitude'] as num?)?.toDouble();
  final lng = (store['lng'] as num?)?.toDouble() ?? (store['longitude'] as num?)?.toDouble();
  if (lat == null || lng == null) return null;
  return LatLng(lat, lng);
}

bool isStoreOpenNow(Map<String, dynamic> store) {
  final open = _parseHm(store['openTime'] as String? ?? store['onlineOrderStartTime'] as String?);
  final close = _parseHm(store['closeTime'] as String? ?? store['onlineOrderStopTime'] as String?);
  if (open == null || close == null) return true;
  final now = TimeOfDay.now();
  final mins = now.hour * 60 + now.minute;
  if (close > open) return mins >= open && mins < close;
  // Overnight window
  return mins >= open || mins < close;
}

int readyMinutes(Map<String, dynamic> store) {
  final cutoff = (store['pickupCutoffMinutes'] as num?)?.toInt();
  if (cutoff != null && cutoff > 0) return cutoff.clamp(10, 45);
  return 18;
}

String distanceLabel(Map<String, dynamic> store) {
  final km = (store['distanceKm'] as num?)?.toDouble();
  if (km == null || km >= 99999) return '';
  return '${km.toStringAsFixed(1)} km';
}

String openUntilLabel(Map<String, dynamic> store) {
  final close = store['closeTime'] as String? ?? store['onlineOrderStopTime'] as String?;
  if (close == null || close.isEmpty) return isStoreOpenNow(store) ? 'Open now' : 'Closed';
  if (!isStoreOpenNow(store)) return 'Closed';
  return 'Open until $close';
}

String readyLabel(Map<String, dynamic> store) {
  final m = readyMinutes(store);
  final lo = (m - 5).clamp(10, m);
  return 'Ready in $lo–$m min';
}

int? _parseHm(String? raw) {
  if (raw == null || raw.trim().isEmpty) return null;
  final parts = raw.trim().split(':');
  if (parts.length < 2) return null;
  final h = int.tryParse(parts[0]);
  final m = int.tryParse(parts[1].replaceAll(RegExp(r'[^0-9].*'), ''));
  if (h == null || m == null) return null;
  return h * 60 + m;
}

// ─── Header ───────────────────────────────────────────────────────────────────

class _PickupHeader extends StatelessWidget {
  final double topInset;
  final VoidCallback onBack;
  final VoidCallback onChangeMethod;

  const _PickupHeader({
    required this.topInset,
    required this.onBack,
    required this.onChangeMethod,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [Color(0xFF0A1630), Color(0xFF142A5C), Color(0xFF1E3A8A)],
        ),
      ),
      padding: EdgeInsets.fromLTRB(8, topInset + 4, 12, 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconButton(
                onPressed: onBack,
                icon: const Icon(Icons.arrow_back_ios_new_rounded, color: Colors.white, size: 20),
              ),
              const Expanded(
                child: Text(
                  'Pickup store',
                  style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.w800),
                ),
              ),
              TextButton(
                onPressed: onChangeMethod,
                child: const Text(
                  'Change method',
                  style: TextStyle(color: BcColors.brandLight, fontWeight: FontWeight.w700, fontSize: 13),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: const Text(
                  'Step 2 of 2',
                  style: TextStyle(color: BcColors.brandLight, fontWeight: FontWeight.w700, fontSize: 11),
                ),
              ),
              const SizedBox(width: 12),
              const _StepChip(done: true, label: 'Method', index: 1),
              const SizedBox(width: 8),
              Container(width: 18, height: 2, color: Colors.white24),
              const SizedBox(width: 8),
              const _StepChip(done: false, label: 'Location', index: 2, active: true),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'Choose a convenient store',
            style: TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w800, height: 1.2),
          ),
          const SizedBox(height: 6),
          Text(
            'Nearby stores are sorted by distance.',
            style: TextStyle(color: Colors.white.withValues(alpha: 0.7), fontSize: 13),
          ),
        ],
      ),
    );
  }
}

class _StepChip extends StatelessWidget {
  final bool done;
  final bool active;
  final String label;
  final int index;

  const _StepChip({
    required this.done,
    required this.label,
    required this.index,
    this.active = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 22,
          height: 22,
          decoration: BoxDecoration(
            color: done || active ? BcColors.brand : Colors.white24,
            shape: BoxShape.circle,
          ),
          alignment: Alignment.center,
          child: done
              ? const Icon(Icons.check_rounded, color: Colors.white, size: 14)
              : Text(
                  '$index',
                  style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w800),
                ),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withValues(alpha: active || done ? 0.95 : 0.55),
            fontSize: 12,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

// ─── Search / toggles ─────────────────────────────────────────────────────────

class _SearchField extends StatelessWidget {
  final TextEditingController controller;
  final ValueChanged<String> onChanged;

  const _SearchField({required this.controller, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Material(
      elevation: 3,
      shadowColor: Colors.black26,
      borderRadius: BorderRadius.circular(28),
      child: TextField(
        controller: controller,
        onChanged: onChanged,
        style: const TextStyle(color: BcDesign.cardNavy, fontSize: 14),
        decoration: InputDecoration(
          hintText: 'Search area or branch',
          hintStyle: const TextStyle(color: BcDesign.muted, fontSize: 14),
          prefixIcon: const Icon(Icons.search_rounded, color: BcDesign.muted),
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(28),
            borderSide: BorderSide.none,
          ),
        ),
      ),
    );
  }
}

class _MapListToggle extends StatelessWidget {
  final _ViewMode mode;
  final ValueChanged<_ViewMode> onChanged;

  const _MapListToggle({required this.mode, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(3),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(22),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 10)],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _TogglePill(
            label: 'Map',
            selected: mode == _ViewMode.map,
            onTap: () => onChanged(_ViewMode.map),
          ),
          _TogglePill(
            label: 'List',
            selected: mode == _ViewMode.list,
            onTap: () => onChanged(_ViewMode.list),
          ),
        ],
      ),
    );
  }
}

class _TogglePill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _TogglePill({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: selected ? BcColors.brand : Colors.transparent,
          borderRadius: BorderRadius.circular(18),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : BcDesign.muted,
            fontWeight: FontWeight.w700,
            fontSize: 12,
          ),
        ),
      ),
    );
  }
}

class _RoundMapButton extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;

  const _RoundMapButton({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: const CircleBorder(),
      elevation: 3,
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 42,
          height: 42,
          child: Icon(icon, color: BcColors.brand, size: 22),
        ),
      ),
    );
  }
}

class _StoreMapPin extends StatelessWidget {
  final bool selected;
  final String distanceLabel;
  final bool open;
  final VoidCallback onTap;

  const _StoreMapPin({
    required this.selected,
    required this.distanceLabel,
    required this.open,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    Widget? label;
    if (selected && distanceLabel.isNotEmpty) {
      label = Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(10),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.12), blurRadius: 6)],
        ),
        child: Text.rich(
          TextSpan(
            style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: BcDesign.cardNavy),
            children: [
              TextSpan(text: distanceLabel),
              const TextSpan(text: ' • '),
              TextSpan(
                text: open ? 'Open' : 'Closed',
                style: TextStyle(color: open ? BcColors.success : BcColors.error),
              ),
            ],
          ),
        ),
      );
    }

    return BcLogoMapPin(
      selected: selected,
      size: selected ? 44 : 34,
      onTap: onTap,
      label: label,
    );
  }
}

// ─── Nearby sheet ─────────────────────────────────────────────────────────────

class _NearbySheet extends StatelessWidget {
  final List<Map<String, dynamic>> stores;
  final int totalCount;
  final bool isLoading;
  final String? selectedId;
  final _StoreFilter filter;
  final ValueChanged<_StoreFilter> onFilterChanged;
  final ValueChanged<Map<String, dynamic>> onSelect;
  final Future<void> Function(Map<String, dynamic>) onDirections;
  final VoidCallback? onRetry;
  final bool showHandle;

  const _NearbySheet({
    required this.stores,
    required this.totalCount,
    required this.isLoading,
    required this.selectedId,
    required this.filter,
    required this.onFilterChanged,
    required this.onSelect,
    required this.onDirections,
    required this.showHandle,
    this.onRetry,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
        boxShadow: [BoxShadow(color: Color(0x1A000000), blurRadius: 16, offset: Offset(0, -4))],
      ),
      child: Column(
        children: [
          if (showHandle)
            Container(
              margin: const EdgeInsets.only(top: 10, bottom: 6),
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: const Color(0xFFD5DCE8),
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          Padding(
            padding: EdgeInsets.fromLTRB(16, showHandle ? 4 : 14, 16, 8),
            child: Row(
              children: [
                const Text(
                  'Nearby stores',
                  style: TextStyle(color: BcDesign.cardNavy, fontSize: 17, fontWeight: FontWeight.w800),
                ),
                const SizedBox(width: 8),
                Text(
                  '${stores.length} found',
                  style: const TextStyle(color: BcDesign.muted, fontSize: 12, fontWeight: FontWeight.w600),
                ),
              ],
            ),
          ),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Row(
              children: [
                _FilterChip(
                  label: 'Open now',
                  icon: Icons.check_rounded,
                  selected: filter == _StoreFilter.openNow,
                  onTap: () => onFilterChanged(_StoreFilter.openNow),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Nearest',
                  icon: Icons.explore_outlined,
                  selected: filter == _StoreFilter.nearest,
                  onTap: () => onFilterChanged(_StoreFilter.nearest),
                ),
                const SizedBox(width: 8),
                _FilterChip(
                  label: 'Ready soon',
                  icon: Icons.schedule_rounded,
                  selected: filter == _StoreFilter.readySoon,
                  onTap: () => onFilterChanged(_StoreFilter.readySoon),
                ),
              ],
            ),
          ),
          Expanded(
            child: isLoading
                ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
                : stores.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(24),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.storefront_outlined, size: 40, color: BcDesign.muted),
                              const SizedBox(height: 10),
                              Text(
                                filter == _StoreFilter.openNow
                                    ? 'No open stores nearby'
                                    : 'No stores match your search',
                                style: const TextStyle(color: BcDesign.cardNavy, fontWeight: FontWeight.w700),
                              ),
                              if (onRetry != null) ...[
                                const SizedBox(height: 12),
                                TextButton(onPressed: onRetry, child: const Text('Retry')),
                              ],
                            ],
                          ),
                        ),
                      )
                    : ListView.separated(
                        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                        itemCount: stores.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (context, i) {
                          final store = stores[i];
                          return _PickupStoreCard(
                            store: store,
                            selected: store['id'] == selectedId,
                            onTap: () => onSelect(store),
                            onDirections: () => onDirections(store),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  const _FilterChip({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? BcColors.brand : const Color(0xFFF0F3F8),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: selected ? Colors.white : BcDesign.muted),
            const SizedBox(width: 6),
            Text(
              label,
              style: TextStyle(
                color: selected ? Colors.white : BcDesign.cardNavy,
                fontWeight: FontWeight.w700,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PickupStoreCard extends StatelessWidget {
  final Map<String, dynamic> store;
  final bool selected;
  final VoidCallback onTap;
  final VoidCallback onDirections;
  final bool compact;

  const _PickupStoreCard({
    required this.store,
    required this.selected,
    required this.onTap,
    required this.onDirections,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final name = store['name'] as String? ?? 'Store';
    final address = [
      store['addressLine'] as String? ?? '',
      store['city'] as String? ?? '',
    ].where((e) => e.trim().isNotEmpty).join(', ');
    final open = isStoreOpenNow(store);
    final dist = distanceLabel(store);

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: EdgeInsets.all(compact ? 10 : 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: selected ? BcColors.brand : const Color(0xFFE4EAF3),
              width: selected ? 1.8 : 1,
            ),
            boxShadow: selected
                ? [BoxShadow(color: BcColors.brand.withValues(alpha: 0.18), blurRadius: 10, offset: const Offset(0, 3))]
                : null,
          ),
          child: Column(
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(10),
                    child: Container(
                      width: compact ? 40 : 44,
                      height: compact ? 40 : 44,
                      color: const Color(0xFFE8F1FF),
                      child: Image.asset(
                        'assets/brand/mascot-hover.png',
                        fit: BoxFit.cover,
                        errorBuilder: (_, _, _) =>
                            const Icon(Icons.storefront_rounded, color: BcColors.brand, size: 22),
                      ),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: BcDesign.cardNavy,
                            fontWeight: FontWeight.w800,
                            fontSize: compact ? 13 : 15,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          address,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: BcDesign.muted, fontSize: compact ? 11 : 12),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          [
                            if (dist.isNotEmpty) dist,
                            open ? 'Open' : 'Closed',
                          ].join('  ·  '),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            color: open ? BcColors.success : BcDesign.muted,
                            fontSize: compact ? 11 : 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                  Icon(
                    selected ? Icons.check_circle_rounded : Icons.circle_outlined,
                    color: selected ? BcColors.brand : const Color(0xFFC5CEDC),
                    size: compact ? 18 : 20,
                  ),
                ],
              ),
              if (selected && !compact) ...[
                const SizedBox(height: 10),
                const Divider(height: 1, color: Color(0xFFE8EEF5)),
                const SizedBox(height: 8),
                Row(
                  children: [
                    TextButton.icon(
                      onPressed: onDirections,
                      icon: const Icon(Icons.directions_rounded, size: 14, color: BcColors.brand),
                      label: const Text(
                        'Directions',
                        style: TextStyle(color: BcColors.brand, fontWeight: FontWeight.w700, fontSize: 13),
                      ),
                    ),
                    TextButton.icon(
                      onPressed: () {
                        showModalBottomSheet(
                          context: context,
                          backgroundColor: Colors.white,
                          shape: const RoundedRectangleBorder(
                            borderRadius: BorderRadius.vertical(top: Radius.circular(18)),
                          ),
                          builder: (_) => Padding(
                            padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: BcDesign.cardNavy)),
                                const SizedBox(height: 8),
                                Text(address, style: const TextStyle(color: BcDesign.muted, fontSize: 13)),
                                const SizedBox(height: 8),
                                Text(openUntilLabel(store), style: TextStyle(color: open ? BcColors.success : BcColors.error, fontWeight: FontWeight.w600)),
                                const SizedBox(height: 4),
                                Text(readyLabel(store), style: const TextStyle(color: BcDesign.muted)),
                              ],
                            ),
                          ),
                        );
                      },
                      icon: const Icon(Icons.info_outline_rounded, size: 14, color: BcColors.brand),
                      label: const Text(
                        'Details',
                        style: TextStyle(color: BcColors.brand, fontWeight: FontWeight.w700, fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _PickupConfirmBar extends StatelessWidget {
  final String shortName;
  final bool enabled;
  final VoidCallback onConfirm;

  const _PickupConfirmBar({
    required this.shortName,
    required this.enabled,
    required this.onConfirm,
  });

  @override
  Widget build(BuildContext context) {
    final bottom = MediaQuery.paddingOf(context).bottom;
    return Container(
      padding: EdgeInsets.fromLTRB(16, 12, 16, bottom + 12),
      decoration: BoxDecoration(
        color: Colors.white,
        boxShadow: [
          BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, -3)),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: const Color(0xFFE8F1FF),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.shopping_bag_outlined, color: BcColors.brand, size: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text('Pickup from', style: TextStyle(color: BcDesign.muted, fontSize: 12)),
                Text(
                  shortName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: BcDesign.cardNavy, fontWeight: FontWeight.w800, fontSize: 15),
                ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Material(
            color: enabled ? BcColors.brand : const Color(0xFFB7C4D8),
            borderRadius: BorderRadius.circular(14),
            child: InkWell(
              onTap: enabled ? onConfirm : null,
              borderRadius: BorderRadius.circular(14),
              child: const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Pickup here', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 14)),
                    SizedBox(width: 6),
                    Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 18),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
