import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../providers/fulfillment_provider.dart';
import '../providers/auth_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';
import '../widgets/app_map_tiles.dart';
import '../widgets/delivery_location_picker.dart';
import '../widgets/bc_map_pin.dart';
import '../widgets/pickup_store_picker.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';
import 'package:geolocator/geolocator.dart';

class FulfillmentSetupScreen extends ConsumerStatefulWidget {
  final String? initialMode;
  /// First-launch gate: user must finish method + branch before leaving.
  final bool isRequired;

  const FulfillmentSetupScreen({
    super.key,
    this.initialMode,
    this.isRequired = false,
  });

  @override
  ConsumerState<FulfillmentSetupScreen> createState() => _FulfillmentSetupScreenState();
}

class _FulfillmentSetupScreenState extends ConsumerState<FulfillmentSetupScreen> {
  late String _step; // 'choose' or 'setup'
  late String _mode; // 'TAKEAWAY' or 'DELIVERY'

  // Forms & Map state
  final _searchController = TextEditingController();
  final MapController _mapController = MapController();
  
  LatLng _selectedLatLng = const LatLng(7.8731, 80.7718); // Default to Sri Lanka center
  double _zoomLevel = 7.5; // Sri Lanka view zoom level
  bool _isDetectingLocation = false;
  String _resolvedAddress = 'Select location on map';
  bool _isResolvingAddress = false;
  Map<String, dynamic>? _deliveryValidation;

  List<dynamic> _stores = [];
  List<dynamic> _filteredStores = [];
  String? _selectedStoreId;
  String? _selectedStoreName;
  bool _isLoadingStores = false;
  bool _isValidatingDelivery = false;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialMode;
    if (initial == 'DELIVERY' || initial == 'TAKEAWAY') {
      _mode = initial!;
      _step = 'setup';
    } else {
      _mode = 'TAKEAWAY';
      _step = 'choose';
    }

    final fulfillment = ref.read(fulfillmentProvider);
    if (fulfillment.orderMode == 'DELIVERY' && fulfillment.lat != null && fulfillment.lng != null) {
      _selectedLatLng = LatLng(fulfillment.lat!, fulfillment.lng!);
      _resolvedAddress = fulfillment.deliveryAddress ?? '';
      _zoomLevel = 15.0;
      _validateDelivery(_selectedLatLng, _resolvedAddress);
    } else {
      _detectCurrentLocation(showErrors: false);
    }

    if (_step == 'setup' && _mode == 'TAKEAWAY') {
      _loadStores();
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _setToSriLanka() {
    setState(() {
      _selectedLatLng = const LatLng(7.8731, 80.7718);
      _zoomLevel = 7.5;
      _resolvedAddress = 'Select location on map';
      _deliveryValidation = null;
    });
    try {
      _mapController.move(const LatLng(7.8731, 80.7718), 7.5);
    } catch (_) {}
  }

  Future<void> _reverseGeocode(LatLng latLng) async {
    setState(() {
      _isResolvingAddress = true;
      _deliveryValidation = null;
    });

    final api = ref.read(apiClientProvider);
    try {
      final data = await api.get<Map<String, dynamic>>(
        '/stores/address/reverse?lat=${latLng.latitude}&lng=${latLng.longitude}',
        requireAuth: false,
      );
      setState(() {
        _resolvedAddress = data['address'] as String? ??
            "${latLng.latitude.toStringAsFixed(4)}, ${latLng.longitude.toStringAsFixed(4)}";
        _isResolvingAddress = false;
      });
      _validateDelivery(latLng, _resolvedAddress);
    } catch (_) {
      setState(() {
        _resolvedAddress = "${latLng.latitude.toStringAsFixed(4)}, ${latLng.longitude.toStringAsFixed(4)}";
        _isResolvingAddress = false;
      });
    }
  }

  Future<void> _detectCurrentLocation({bool showErrors = true}) async {
    setState(() {
      _isDetectingLocation = true;
    });

    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        if (showErrors && mounted) {
          showAppToast(context, 'Location services are disabled. Please enable them in settings.', isError: true);
        }
        _setToSriLanka();
        return;
      }

      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
        if (permission == LocationPermission.denied) {
          if (showErrors && mounted) {
            showAppToast(context, 'Location permissions are denied.', isError: true);
          }
          _setToSriLanka();
          return;
        }
      }

      if (permission == LocationPermission.deniedForever) {
        if (showErrors && mounted) {
          showAppToast(context, 'Location permissions are permanently denied. Please enable them in settings.', isError: true);
        }
        _setToSriLanka();
        return;
      }

      final position = await Geolocator.getCurrentPosition();
      final newLatLng = LatLng(position.latitude, position.longitude);

      setState(() {
        _selectedLatLng = newLatLng;
        _zoomLevel = 15.0;
      });

      try {
        _mapController.move(newLatLng, 15.0);
      } catch (_) {}
      await _reverseGeocode(newLatLng);
    } catch (e) {
      if (showErrors && mounted) {
        showAppToast(context, 'Error detecting location: $e', isError: true);
      }
      _setToSriLanka();
    } finally {
      if (mounted) {
        setState(() {
          _isDetectingLocation = false;
        });
      }
    }
  }

  Future<void> _validateDelivery(LatLng latLng, String address) async {
    setState(() {
      _isValidatingDelivery = true;
    });
    final api = ref.read(apiClientProvider);
    try {
      final data = await api.post<Map<String, dynamic>>(
        '/stores/validate-delivery',
        {
          'lat': latLng.latitude,
          'lng': latLng.longitude,
          'address': address,
        },
        requireAuth: false,
      );
      setState(() {
        _deliveryValidation = data;
        _isValidatingDelivery = false;
      });
    } catch (_) {
      setState(() {
        _isValidatingDelivery = false;
      });
    }
  }

  Future<void> _loadStores() async {
    setState(() {
      _isLoadingStores = true;
    });

    LatLng? userLoc;
    try {
      bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (serviceEnabled) {
        LocationPermission permission = await Geolocator.checkPermission();
        if (permission == LocationPermission.denied) {
          permission = await Geolocator.requestPermission();
        }
        if (permission == LocationPermission.whileInUse || permission == LocationPermission.always) {
          final position = await Geolocator.getCurrentPosition();
          userLoc = LatLng(position.latitude, position.longitude);
        }
      }
    } catch (_) {}

    final api = ref.read(apiClientProvider);
    try {
      final data = await api.get<List<dynamic>>(
        '/stores',
        requireAuth: false,
        listParser: (list) => list,
      );

      final processedData = List<Map<String, dynamic>>.from(data);

      if (userLoc != null) {
        for (var store in processedData) {
          final sLat = (store['lat'] as num?)?.toDouble() ?? (store['latitude'] as num?)?.toDouble();
          final sLng = (store['lng'] as num?)?.toDouble() ?? (store['longitude'] as num?)?.toDouble();
          if (sLat != null && sLng != null) {
            final distMeters = const Distance().as(
              LengthUnit.Meter,
              userLoc,
              LatLng(sLat, sLng),
            );
            store['distanceKm'] = distMeters / 1000.0;
          } else {
            store['distanceKm'] = 99999.0;
          }
        }
        processedData.sort((a, b) => (a['distanceKm'] as double).compareTo(b['distanceKm'] as double));
      }

      setState(() {
        _stores = processedData;
        _filteredStores = processedData;
        if (processedData.isNotEmpty) {
          _selectedStoreId = processedData[0]['id'] as String;
          _selectedStoreName = processedData[0]['name'] as String;
        }
        _isLoadingStores = false;
      });
    } catch (_) {
      setState(() {
        _isLoadingStores = false;
      });
    }
  }

  void _filterStores(String query) {
    final q = query.trim().toLowerCase();
    setState(() {
      if (q.isEmpty) {
        _filteredStores = _stores;
      } else {
        _filteredStores = _stores.where((s) {
          final name = (s['name'] as String? ?? '').toLowerCase();
          final addr = (s['addressLine'] as String? ?? '').toLowerCase();
          final city = (s['city'] as String? ?? '').toLowerCase();
          return name.contains(q) || addr.contains(q) || city.contains(q);
        }).toList();
      }
    });
  }

  Future<void> _handleDeliverySubmit() async {
    if (_resolvedAddress.isEmpty) return;

    setState(() {
      _isValidatingDelivery = true;
    });

    final result = await ref.read(fulfillmentProvider.notifier).validateAndSetDelivery(
      address: _resolvedAddress,
      lat: _selectedLatLng.latitude,
      lng: _selectedLatLng.longitude,
    );

    setState(() {
      _isValidatingDelivery = false;
    });

    if (result != null && result['eligible'] == true) {
      if (mounted) goHome(context);
    } else {
      if (mounted) {
        final msg = result?['message'] ?? 'Delivery is not available to this address.';
        showAppToast(context, msg);
      }
    }
  }

  Future<void> _handleTakeawaySubmit() async {
    if (_selectedStoreId == null || _selectedStoreName == null) return;

    await ref.read(fulfillmentProvider.notifier).setTakeaway(_selectedStoreId!, _selectedStoreName!);

    if (mounted) goHome(context);
  }

  @override
  Widget build(BuildContext context) {
    Widget child;
    if (_step == 'setup' && _mode == 'TAKEAWAY') {
      final stores = _stores
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
      child = PickupStorePicker(
        stores: stores,
        isLoading: _isLoadingStores,
        selectedStoreId: _selectedStoreId,
        onBack: () {
          if (widget.initialMode == 'TAKEAWAY' && !widget.isRequired) {
            context.canPop() ? context.pop() : context.go('/home');
          } else {
            setState(() => _step = 'choose');
          }
        },
        onChangeMethod: () => setState(() => _step = 'choose'),
        onSelect: (store) {
          setState(() {
            _selectedStoreId = store['id'] as String?;
            _selectedStoreName = store['name'] as String?;
          });
        },
        onConfirm: _handleTakeawaySubmit,
        onRetry: _loadStores,
      );
    } else if (_step == 'setup' && _mode == 'DELIVERY') {
      child = DeliveryLocationPicker(
        onBack: () {
          if (widget.initialMode == 'DELIVERY' && !widget.isRequired) {
            context.canPop() ? context.pop() : context.go('/home');
          } else {
            setState(() => _step = 'choose');
          }
        },
        onChangeMethod: () => setState(() => _step = 'choose'),
        onDone: () {
          if (mounted) goHome(context);
        },
      );
    } else {
      child = Scaffold(
        backgroundColor: _step == 'choose' ? Colors.white : null,
        appBar: AppBar(
          backgroundColor: _step == 'choose' ? Colors.white : null,
          elevation: 0,
          scrolledUnderElevation: 0,
          centerTitle: true,
          title: Text(
            _step == 'choose' ? 'Order method' : 'Delivery Setup',
            style: _step == 'choose'
                ? GoogleFonts.poppins(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: const Color(0xFF0F172A),
                  )
                : null,
          ),
          leading: widget.isRequired && _step == 'choose'
              ? const SizedBox.shrink()
              : IconButton(
                  icon: Icon(
                    Icons.arrow_back_rounded,
                    size: 22,
                    color: _step == 'choose' ? const Color(0xFF0F172A) : null,
                  ),
                  onPressed: () {
                    if (_step == 'setup') {
                      setState(() => _step = 'choose');
                      return;
                    }
                    if (widget.isRequired) return;
                    context.canPop() ? context.pop() : context.go('/home');
                  },
                ),
          automaticallyImplyLeading: !(widget.isRequired && _step == 'choose'),
        ),
        body: _step == 'choose'
            ? SafeArea(top: false, child: _buildChooseStep())
            : Container(
                decoration: BoxDecoration(
                  gradient: BcTheme.heroGradientFor(Theme.of(context).brightness),
                ),
                child: SafeArea(
                  child: Center(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.all(24.0),
                      child: _buildSetupStep(),
                    ),
                  ),
                ),
              ),
      );
    }

    return PopScope(
      canPop: !widget.isRequired || _step != 'choose',
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (widget.isRequired && _step == 'setup') {
          setState(() => _step = 'choose');
        }
      },
      child: child,
    );
  }

  Widget _buildChooseStep() {
    const navy = Color(0xFF0F172A);

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _OrderMethodStepper(activeStep: 1),
          const SizedBox(height: 20),
          Text(
            'How would you like to\nget your order?',
            textAlign: TextAlign.center,
            style: GoogleFonts.poppins(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              height: 1.22,
              letterSpacing: -0.5,
              color: navy,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            'Choose a method to see the right menu and availability.',
            textAlign: TextAlign.center,
            style: GoogleFonts.poppins(
              fontSize: 13,
              fontWeight: FontWeight.w500,
              height: 1.35,
              color: const Color(0xFF64748B),
            ),
          ),
          const SizedBox(height: 18),
          Expanded(
            child: _MethodChoiceCard(
              title: 'Delivery',
              subtitle: 'Delivered to your door',
              imageAsset: 'assets/brand/order-method-delivery.png',
              fallbackIcon: Icons.delivery_dining_outlined,
              onTap: () {
                setState(() {
                  _mode = 'DELIVERY';
                  _step = 'setup';
                });
                _detectCurrentLocation(showErrors: false);
              },
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: _MethodChoiceCard(
              title: 'Pickup',
              subtitle: 'Collect from a nearby store',
              imageAsset: 'assets/brand/order-method-pickup.png',
              fallbackIcon: Icons.storefront_outlined,
              onTap: () {
                setState(() {
                  _mode = 'TAKEAWAY';
                  _step = 'setup';
                });
                _loadStores();
              },
            ),
          ),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.verified_user_rounded, size: 16, color: BcColors.brand.withValues(alpha: 0.9)),
              const SizedBox(width: 6),
              Text(
                'You can change this anytime',
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: BcColors.brand,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSetupStep() {
    final title = _mode == 'DELIVERY' ? 'Where should we deliver?' : 'Choose your pickup store';
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        // Back link
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () {
              setState(() {
                _step = 'choose';
              });
            },
            icon: const Icon(Icons.arrow_back, size: 16, color: BcColors.brand),
            label: const Text('Change order type', style: TextStyle(color: BcColors.brand, fontWeight: FontWeight.bold)),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          title,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
                color: onSurface,
              ),
        ),
        const SizedBox(height: 20),

        if (_mode == 'DELIVERY') ...[
          // Delivery Map Picker
          Card(
            color: bc.cardBg,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(20),
              side: BorderSide(color: bc.border),
            ),
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                    'Tap the map or drag to place your pin. We deliver from your nearest branch.',
                    style: TextStyle(color: bc.mutedText, fontSize: 13),
                  ),
                  const SizedBox(height: 16),
                  Container(
                    height: 240,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: bc.border, width: 1.5),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: FlutterMap(
                        mapController: _mapController,
                        options: MapOptions(
                          initialCenter: _selectedLatLng,
                          initialZoom: _zoomLevel,
                          onTap: (tapPosition, latLng) {
                            setState(() {
                              _selectedLatLng = latLng;
                            });
                            if (_zoomLevel < 10.0) {
                              setState(() {
                                _zoomLevel = 15.0;
                              });
                              try {
                                _mapController.move(latLng, 15.0);
                              } catch (_) {}
                            }
                            _reverseGeocode(latLng);
                          },
                        ),
                        children: [
                          const AppMapTiles(),
                          MarkerLayer(
                            markers: [
                              Marker(
                                point: _selectedLatLng,
                                width: 56,
                                height: 68,
                                alignment: Alignment.bottomCenter,
                                child: const BcLogoMapPin(selected: true, size: 44),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Address Box
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                    decoration: BoxDecoration(
                      color: bc.secondaryBg,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: bc.border),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.map, color: BcColors.brand, size: 20),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            _isResolvingAddress
                                ? 'Resolving address...'
                                : _resolvedAddress.isNotEmpty
                                    ? _resolvedAddress
                                    : 'Tap map to choose address',
                            style: TextStyle(
                              color: onSurface,
                              fontSize: 13,
                              height: 1.4,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 10),
                  TextButton.icon(
                    onPressed: _isDetectingLocation || _isResolvingAddress ? null : _detectCurrentLocation,
                    icon: _isDetectingLocation
                        ? const SizedBox(
                            width: 14,
                            height: 14,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(BcColors.brand),
                            ),
                          )
                        : const Icon(Icons.navigation, size: 14, color: BcColors.brand),
                    label: Text(
                      _isDetectingLocation ? 'Finding location...' : 'Use my current location',
                      style: const TextStyle(
                        color: BcColors.brand,
                        fontWeight: FontWeight.bold,
                        fontSize: 14,
                      ),
                    ),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Validation card
                  if (_isValidatingDelivery)
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: BcColors.brandSubtle,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: BcColors.brand.withOpacity(0.3)),
                      ),
                      child: const Row(
                        children: [
                          SizedBox(
                            height: 16,
                            width: 16,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(BcColors.brand),
                            ),
                          ),
                          SizedBox(width: 12),
                          Text(
                            'Finding your nearest branch...',
                            style: TextStyle(color: BcColors.brand, fontSize: 13),
                          ),
                        ],
                      ),
                    )
                  else if (_deliveryValidation != null) ...[
                    if (_deliveryValidation!['eligible'] == true) ...[
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: BcColors.success.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: BcColors.success.withOpacity(0.3)),
                        ),
                        child: Row(
                          children: [
                            Container(
                              padding: const EdgeInsets.all(8),
                              decoration: BoxDecoration(
                                color: bc.secondaryBg,
                                shape: BoxShape.circle,
                              ),
                              child: const Icon(Icons.storefront, color: BcColors.brand, size: 20),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text(
                                    'Nearest branch',
                                    style: TextStyle(
                                      color: BcColors.brand,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 10,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    _deliveryValidation!['store']['name'] as String,
                                    style: TextStyle(
                                      color: onSurface,
                                      fontWeight: FontWeight.bold,
                                      fontSize: 14,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Text(
                                    'Fee LKR ${_deliveryValidation!['zone']['fee']}  ·  ~${_deliveryValidation!['estimatedMinutes']} min  ·  ${_deliveryValidation!['distanceKm']} km away',
                                    style: TextStyle(
                                      color: bc.mutedText,
                                      fontSize: 12,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const Icon(Icons.check_circle, color: BcColors.success, size: 20),
                          ],
                        ),
                      ),
                    ] else ...[
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: BcColors.error.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: BcColors.error.withOpacity(0.3)),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.error_outline, color: BcColors.error, size: 20),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Text(
                                _deliveryValidation!['message'] as String? ?? 'Delivery is not available here.',
                                style: const TextStyle(color: BcColors.error, fontSize: 13),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ],
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed: (_deliveryValidation != null && _deliveryValidation!['eligible'] == true && !_isValidatingDelivery)
                        ? _handleDeliverySubmit
                        : null,
                    child: _isValidatingDelivery
                        ? const SizedBox(
                            height: 20,
                            width: 20,
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                            ),
                          )
                        : const Text('Done'),
                  ),
                ],
              ),
            ),
          ),
        ] else ...[
          // Takeaway branch select
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(
                    controller: _searchController,
                    onChanged: _filterStores,
                    style: TextStyle(color: Theme.of(context).colorScheme.onSurface),
                    decoration: InputDecoration(
                      hintText: 'Search branches...',
                      prefixIcon: Icon(Icons.search, color: bc.mutedText),
                    ),
                  ),
                  const SizedBox(height: 16),
                  _isLoadingStores
                      ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
                      : SizedBox(
                          height: 260,
                          child: ListView.builder(
                            itemCount: _filteredStores.length,
                            itemBuilder: (context, idx) {
                                final store = _filteredStores[idx];
                                final isSelected = _selectedStoreId == store['id'];
                                final distanceStr = store['distanceKm'] != null && store['distanceKm'] < 99999.0
                                    ? '${(store['distanceKm'] as double).toStringAsFixed(1)} km'
                                    : '';
                                return ListTile(
                                  leading: Icon(Icons.storefront, color: isSelected ? BcColors.brand : bc.mutedText),
                                  title: Text(store['name'] as String, style: TextStyle(color: onSurface, fontWeight: FontWeight.bold)),
                                  subtitle: Text(
                                    "${store['addressLine']}, ${store['city']}${distanceStr.isNotEmpty ? '  ·  $distanceStr' : ''}",
                                    style: TextStyle(color: bc.mutedText, fontSize: 12),
                                  ),
                                  trailing: isSelected ? const Icon(Icons.check_circle, color: BcColors.brand) : null,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                  tileColor: isSelected ? BcColors.brandSubtle : Colors.transparent,
                                  onTap: () {
                                    setState(() {
                                      _selectedStoreId = store['id'] as String;
                                      _selectedStoreName = store['name'] as String;
                                    });
                                  },
                                );
                            },
                          ),
                        ),
                  const SizedBox(height: 20),
                  ElevatedButton(
                    onPressed: _selectedStoreId == null ? null : _handleTakeawaySubmit,
                    child: const Text('Done'),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }
}

class _MethodChoiceCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final String imageAsset;
  final IconData fallbackIcon;
  final VoidCallback onTap;

  const _MethodChoiceCard({
    required this.title,
    required this.subtitle,
    required this.imageAsset,
    required this.fallbackIcon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      clipBehavior: Clip.antiAlias,
      borderRadius: BorderRadius.circular(22),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(22),
        child: Ink(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(22),
            border: Border.all(color: const Color(0xFFD6E4F7), width: 1.5),
            boxShadow: [
              BoxShadow(
                color: BcColors.brand.withValues(alpha: 0.05),
                blurRadius: 14,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(10, 10, 8, 10),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(
                  flex: 11,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: const Color(0xFFF4F8FF),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(8),
                      child: Image.asset(
                        imageAsset,
                        fit: BoxFit.contain,
                        filterQuality: FilterQuality.high,
                        errorBuilder: (_, _, _) => Icon(
                          fallbackIcon,
                          color: BcColors.brand,
                          size: 48,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 10,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w700,
                          fontSize: 18,
                          height: 1.2,
                          color: const Color(0xFF0F172A),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: GoogleFonts.poppins(
                          color: const Color(0xFF64748B),
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          height: 1.3,
                        ),
                      ),
                    ],
                  ),
                ),
                const Center(
                  child: Icon(Icons.chevron_right_rounded, color: BcColors.brand, size: 26),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OrderMethodStepper extends StatelessWidget {
  final int activeStep; // 1 = Method, 2 = Location
  const _OrderMethodStepper({required this.activeStep});

  @override
  Widget build(BuildContext context) {
    final step1Active = activeStep >= 1;
    final step2Active = activeStep >= 2;

    Widget circle(int n, bool active) {
      return Container(
        width: 28,
        height: 28,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: active ? BcColors.brand : Colors.white,
          border: Border.all(
            color: active ? BcColors.brand : const Color(0xFFCBD5E1),
            width: 1.6,
          ),
        ),
        child: Text(
          '$n',
          style: GoogleFonts.poppins(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: active ? Colors.white : const Color(0xFF94A3B8),
          ),
        ),
      );
    }

    Widget label(String text, bool active) {
      return Text(
        text,
        style: GoogleFonts.poppins(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: active ? BcColors.brand : const Color(0xFF64748B),
        ),
      );
    }

    return Row(
      children: [
        circle(1, step1Active),
        const SizedBox(width: 8),
        label('Method', step1Active),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Container(
              height: 2,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(2),
                gradient: const LinearGradient(
                  colors: [BcColors.brand, Color(0xFFD6E4F7)],
                ),
              ),
            ),
          ),
        ),
        circle(2, step2Active),
        const SizedBox(width: 8),
        label('Location', step2Active),
      ],
    );
  }
}
