import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../providers/auth_provider.dart';
import '../providers/fulfillment_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';
import '../widgets/app_map_tiles.dart';
import '../widgets/design/bc_app_design.dart';

class StoreLocatorScreen extends ConsumerStatefulWidget {
  const StoreLocatorScreen({super.key});

  @override
  ConsumerState<StoreLocatorScreen> createState() => _StoreLocatorScreenState();
}

class _StoreLocatorScreenState extends ConsumerState<StoreLocatorScreen> {
  final _searchController = TextEditingController();
  final MapController _mapController = MapController();

  List<dynamic> _stores = [];
  List<dynamic> _filteredStores = [];
  String? _selectedStoreId;
  bool _isLoading = false;
  LatLng _mapCenter = const LatLng(7.8731, 80.7718);
  double _zoom = 7.5;

  @override
  void initState() {
    super.initState();
    final fulfillment = ref.read(fulfillmentProvider);
    _selectedStoreId = fulfillment.storeId;
    Future.microtask(_loadStores);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Future<void> _loadStores() async {
    setState(() => _isLoading = true);
    final api = ref.read(apiClientProvider);
    try {
      Position? position;
      try {
        final permission = await Geolocator.checkPermission();
        if (permission == LocationPermission.denied) {
          await Geolocator.requestPermission();
        }
        if (await Geolocator.isLocationServiceEnabled()) {
          position = await Geolocator.getCurrentPosition();
        }
      } catch (_) {}

      final data = await api.get<List<dynamic>>(
        '/stores',
        requireAuth: false,
        listParser: (list) => list,
      );

      final stores = List<dynamic>.from(data);
      if (position != null) {
        for (final store in stores) {
          final lat = (store['lat'] as num?)?.toDouble();
          final lng = (store['lng'] as num?)?.toDouble();
          if (lat != null && lng != null) {
            final meters = Geolocator.distanceBetween(position.latitude, position.longitude, lat, lng);
            store['distanceKm'] = meters / 1000;
          }
        }
        stores.sort((a, b) {
          final da = (a['distanceKm'] as double?) ?? 99999.0;
          final db = (b['distanceKm'] as double?) ?? 99999.0;
          return da.compareTo(db);
        });
        _mapCenter = LatLng(position.latitude, position.longitude);
        _zoom = 12;
      } else if (stores.isNotEmpty) {
        final lat = (stores.first['lat'] as num?)?.toDouble();
        final lng = (stores.first['lng'] as num?)?.toDouble();
        if (lat != null && lng != null) {
          _mapCenter = LatLng(lat, lng);
          _zoom = 11;
        }
      }

      if (!mounted) return;
      setState(() {
        _stores = stores;
        _filteredStores = stores;
        _isLoading = false;
      });
      try {
        _mapController.move(_mapCenter, _zoom);
      } catch (_) {}
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);
        showAppToast(context, 'Failed to load stores', isError: true);
      }
    }
  }

  void _filterStores(String query) {
    final q = query.trim().toLowerCase();
    setState(() {
      _filteredStores = q.isEmpty
          ? _stores
          : _stores.where((s) {
              final name = (s['name'] as String? ?? '').toLowerCase();
              final address = (s['addressLine'] as String? ?? '').toLowerCase();
              final city = (s['city'] as String? ?? '').toLowerCase();
              return name.contains(q) || address.contains(q) || city.contains(q);
            }).toList();
    });
  }

  Future<void> _selectStore(Map<String, dynamic> store) async {
    setState(() => _selectedStoreId = store['id'] as String?);
    // Do not navigate away — user confirms pickup separately / stays browsing.
  }

  Future<void> _confirmPickup() async {
    if (_selectedStoreId == null) return;
    Map<String, dynamic>? store;
    for (final s in _filteredStores) {
      if (s is Map && s['id'] == _selectedStoreId) {
        store = Map<String, dynamic>.from(s);
        break;
      }
    }
    final name = store?['name'] as String?;
    if (name == null) return;
    await ref.read(fulfillmentProvider.notifier).setTakeaway(_selectedStoreId!, name);
    if (!mounted) return;
    showAppToast(context, 'Pickup from $name', isError: false);
    context.go('/home');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: BcDesign.pageBg,
      body: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            color: Colors.white,
            padding: EdgeInsets.fromLTRB(16, MediaQuery.paddingOf(context).top + 8, 16, 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Store Locator',
                  style: TextStyle(color: BcDesign.cardNavy, fontSize: 22, fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _searchController,
                  onChanged: _filterStores,
                  decoration: InputDecoration(
                    hintText: 'Search stores near you',
                    prefixIcon: const Icon(Icons.search, color: BcDesign.muted),
                    filled: true,
                    fillColor: const Color(0xFFF3F6FB),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
                    contentPadding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ],
            ),
          ),
          SizedBox(
            height: MediaQuery.sizeOf(context).height * 0.34,
            child: _isLoading
                ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
                : FlutterMap(
                    mapController: _mapController,
                    options: MapOptions(
                      initialCenter: _mapCenter,
                      initialZoom: _zoom,
                    ),
                    children: [
                      const AppMapTiles(),
                      MarkerLayer(
                        markers: [
                          for (final store in _filteredStores)
                            if (store['lat'] != null && store['lng'] != null)
                              Marker(
                                point: LatLng(
                                  (store['lat'] as num).toDouble(),
                                  (store['lng'] as num).toDouble(),
                                ),
                                width: 36,
                                height: 36,
                                child: Icon(
                                  Icons.location_on,
                                  color: _selectedStoreId == store['id'] ? BcColors.brand : BcDesign.muted,
                                  size: 36,
                                ),
                              ),
                        ],
                      ),
                    ],
                  ),
          ),
          Expanded(
            child: _isLoading
                ? const SizedBox.shrink()
                : ListView(
                    padding: EdgeInsets.fromLTRB(16, 16, 16, 12),
                    children: [
                      const Text(
                        'Nearby stores',
                        style: TextStyle(color: BcDesign.cardNavy, fontSize: 16, fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(height: 12),
                      if (_filteredStores.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(24),
                          child: Center(child: Text('No stores found', style: TextStyle(color: BcDesign.muted))),
                        )
                      else
                        for (final store in _filteredStores)
                          BcStoreLocatorCard(
                            name: store['name'] as String? ?? 'Store',
                            address: '${store['addressLine'] ?? ''}, ${store['city'] ?? ''}',
                            distanceLabel: store['distanceKm'] != null
                                ? '${(store['distanceKm'] as double).toStringAsFixed(1)} km away'
                                : null,
                            isSelected: _selectedStoreId == store['id'],
                            onPickUp: () => _selectStore(Map<String, dynamic>.from(store as Map)),
                          ),
                    ],
                  ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: ElevatedButton(
                onPressed: _selectedStoreId == null ? null : _confirmPickup,
                child: const Text('Pickup here'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
