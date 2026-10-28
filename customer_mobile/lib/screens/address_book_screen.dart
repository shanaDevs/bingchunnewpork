import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../models/address.dart';
import '../providers/auth_provider.dart';
import '../theme/bc_theme.dart';
import '../utils/app_toast.dart';

class AddressBookScreen extends ConsumerStatefulWidget {
  const AddressBookScreen({super.key});

  @override
  ConsumerState<AddressBookScreen> createState() => _AddressBookScreenState();
}

class _AddressBookScreenState extends ConsumerState<AddressBookScreen> {
  List<UserAddress> _addresses = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchAddresses();
  }

  Future<void> _fetchAddresses() async {
    setState(() => _isLoading = true);
    try {
      final api = ref.read(apiClientProvider);
      final list = await api.get<List<UserAddress>>(
        '/addresses',
        listParser: (jsonList) => jsonList.map((item) => UserAddress.fromJson(item as Map<String, dynamic>)).toList(),
      );
      setState(() {
        _addresses = list;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        showAppToast(context, 'Failed to load addresses');
      }
    }
  }

  Future<void> _deleteAddress(String id) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete Address'),
        content: const Text('Are you sure you want to delete this address?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: BcColors.error)),
          ),
        ],
      ),
    );

    if (confirm != true) return;

    try {
      final api = ref.read(apiClientProvider);
      await api.delete('/addresses/$id');
      if (mounted) {
        showAppToast(context, 'Address deleted');
        _fetchAddresses();
      }
    } catch (_) {
      if (mounted) {
        showAppToast(context, 'Failed to delete address');
      }
    }
  }

  void _showAddressForm({UserAddress? address}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (ctx) => _AddressFormSheet(
        address: address,
        makeDefault: address == null && _addresses.isEmpty,
        onSaved: () {
          Navigator.pop(ctx);
          _fetchAddresses();
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Scaffold(
      backgroundColor: bc.pageBg,
      appBar: AppBar(
        title: const Text('Address Book'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded),
          onPressed: () => context.pop(),
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator(color: BcColors.brand))
          : _addresses.isEmpty
              ? _buildEmptyState(bc, onSurface)
              : _buildList(bc, onSurface),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: BcColors.brand,
        foregroundColor: Colors.white,
        onPressed: () => _showAddressForm(),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Add Address'),
      ),
    );
  }

  Widget _buildEmptyState(BcAdaptive bc, Color onSurface) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                color: bc.cardBg,
                shape: BoxShape.circle,
                border: Border.all(color: bc.border),
              ),
              child: const Icon(
                Icons.location_off_outlined,
                size: 48,
                color: BcColors.brand,
              ),
            ),
            const SizedBox(height: 18),
            Text(
              'No Saved Addresses',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: onSurface,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Save your delivery addresses for a faster checkout experience.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 14,
                color: bc.mutedText,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildList(BcAdaptive bc, Color onSurface) {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 80),
      itemCount: _addresses.length,
      itemBuilder: (ctx, index) {
        final address = _addresses[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 12),
          decoration: BoxDecoration(
            color: bc.cardBg,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: address.isDefault ? BcColors.brand : bc.border, width: address.isDefault ? 1.5 : 1),
          ),
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            leading: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: address.isDefault ? BcColors.brand.withOpacity(0.12) : bc.secondaryBg,
                shape: BoxShape.circle,
              ),
              child: Icon(
                address.label.toLowerCase() == 'home'
                    ? Icons.home_outlined
                    : address.label.toLowerCase() == 'office'
                        ? Icons.work_outline_rounded
                        : Icons.location_on_outlined,
                color: address.isDefault ? BcColors.brand : bc.mutedText,
                size: 22,
              ),
            ),
            title: Row(
              children: [
                Text(
                  address.label,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 15,
                    color: onSurface,
                  ),
                ),
                if (address.isDefault) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: BcColors.success.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text(
                      'Default',
                      style: TextStyle(
                        color: BcColors.success,
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ]
              ],
            ),
            subtitle: Padding(
              padding: const EdgeInsets.only(top: 4),
              child: Text(
                '${address.addressLine}, ${address.city}, ${address.district}',
                style: TextStyle(color: bc.mutedText, fontSize: 13),
              ),
            ),
            trailing: PopupMenuButton<String>(
              icon: Icon(Icons.more_vert_rounded, color: bc.mutedText),
              color: bc.cardBg,
              onSelected: (val) {
                if (val == 'edit') {
                  _showAddressForm(address: address);
                } else if (val == 'delete') {
                  _deleteAddress(address.id);
                }
              },
              itemBuilder: (ctx) => [
                const PopupMenuItem(
                  value: 'edit',
                  child: Row(
                    children: [
                      Icon(Icons.edit_outlined, size: 20),
                      SizedBox(width: 8),
                      Text('Edit'),
                    ],
                  ),
                ),
                const PopupMenuItem(
                  value: 'delete',
                  child: Row(
                    children: [
                      Icon(Icons.delete_outline_rounded, color: BcColors.error, size: 20),
                      SizedBox(width: 8),
                      Text('Delete', style: TextStyle(color: BcColors.error)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

class _AddressFormSheet extends ConsumerStatefulWidget {
  final UserAddress? address;
  final bool makeDefault;
  final VoidCallback onSaved;

  const _AddressFormSheet({
    this.address,
    this.makeDefault = false,
    required this.onSaved,
  });

  @override
  ConsumerState<_AddressFormSheet> createState() => _AddressFormSheetState();
}

class _AddressFormSheetState extends ConsumerState<_AddressFormSheet> {
  final _formKey = GlobalKey<FormState>();
  late String _label;
  late final TextEditingController _addressController;
  late final TextEditingController _cityController;
  late final TextEditingController _districtController;
  late bool _isDefault;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    _label = widget.address?.label ?? 'Home';
    _addressController = TextEditingController(text: widget.address?.addressLine ?? '');
    _cityController = TextEditingController(text: widget.address?.city ?? '');
    _districtController = TextEditingController(text: widget.address?.district ?? 'Colombo');
    _isDefault = widget.address?.isDefault ?? widget.makeDefault;
  }

  @override
  void dispose() {
    _addressController.dispose();
    _cityController.dispose();
    _districtController.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isSaving = true);

    final payload = {
      'label': _label,
      'addressLine': _addressController.text.trim(),
      'city': _cityController.text.trim(),
      'district': _districtController.text.trim(),
      'isDefault': _isDefault,
    };

    try {
      final api = ref.read(apiClientProvider);
      if (widget.address == null) {
        await api.post('/addresses', payload);
        if (mounted) showAppToast(context, 'Address added');
      } else {
        await api.put('/addresses/${widget.address!.id}', payload);
        if (mounted) showAppToast(context, 'Address updated');
      }
      widget.onSaved();
    } catch (e) {
      setState(() => _isSaving = false);
      if (mounted) {
        final err = e.toString().replaceFirst('ApiException: ', '');
        showAppToast(context, err.isNotEmpty ? err : 'Failed to save address');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final bc = context.bc;
    final onSurface = Theme.of(context).colorScheme.onSurface;

    return Container(
      decoration: BoxDecoration(
        color: bc.pageBg,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        border: Border(top: BorderSide(color: bc.border)),
      ),
      padding: EdgeInsets.fromLTRB(16, 20, 16, MediaQuery.of(context).viewInsets.bottom + 24),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  widget.address == null ? 'Add Address' : 'Edit Address',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: onSurface,
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.close_rounded),
                  onPressed: () => Navigator.pop(context),
                )
              ],
            ),
            const SizedBox(height: 16),
            Row(
              children: ['Home', 'Office', 'Other'].map((l) {
                final selected = _label == l;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(l),
                    selected: selected,
                    onSelected: (s) => setState(() => _label = l),
                    backgroundColor: bc.secondaryBg,
                    selectedColor: BcColors.brand.withOpacity(0.15),
                    labelStyle: TextStyle(
                      color: selected ? BcColors.brand : bc.mutedText,
                      fontWeight: selected ? FontWeight.bold : FontWeight.normal,
                    ),
                    side: BorderSide(
                      color: selected ? BcColors.brand : bc.border,
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 18),
            TextFormField(
              controller: _addressController,
              enabled: !_isSaving,
              style: TextStyle(color: onSurface),
              decoration: const InputDecoration(
                labelText: 'Address Line',
                prefixIcon: Icon(Icons.location_on_outlined),
              ),
              validator: (v) => v == null || v.trim().length < 5 ? 'Address is too short' : null,
            ),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _cityController,
                    enabled: !_isSaving,
                    style: TextStyle(color: onSurface),
                    decoration: const InputDecoration(
                      labelText: 'City',
                      prefixIcon: Icon(Icons.location_city_outlined),
                    ),
                    validator: (v) => v == null || v.trim().length < 2 ? 'Required' : null,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _districtController,
                    enabled: !_isSaving,
                    style: TextStyle(color: onSurface),
                    decoration: const InputDecoration(
                      labelText: 'District',
                      prefixIcon: Icon(Icons.map_outlined),
                    ),
                    validator: (v) => v == null || v.trim().length < 2 ? 'Required' : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Set as default address'),
              subtitle: Text('Use this address as primary for checkouts.', style: TextStyle(color: bc.mutedText, fontSize: 11)),
              value: _isDefault,
              activeColor: BcColors.brand,
              onChanged: _isSaving ? null : (s) => setState(() => _isDefault = s),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: _isSaving ? null : _save,
              style: ElevatedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              child: _isSaving
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                      ),
                    )
                  : const Text(
                      'Save Address',
                      style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}
