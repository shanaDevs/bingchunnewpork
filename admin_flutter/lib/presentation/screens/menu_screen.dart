import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';

import '../../core/app_container.dart';
import '../../core/feedback.dart';
import '../../core/format.dart';
import '../../core/runtime_config.dart';
import '../../domain/entities/admin.dart';
import '../../domain/entities/menu.dart';
import '../../l10n/l10n.dart';
import '../components/admin_widgets.dart';
import '../components/badges.dart';
import '../components/buttons.dart';
import '../components/layout.dart';
import '../components/pos_card.dart';
import '../components/product_widgets.dart';
import '../components/sheets.dart';
import '../components/snack.dart';
import '../components/states.dart';
import '../components/tabs.dart';
import '../state/loadable.dart';
import '../theme/pos_theme.dart';

/// Menu management — port of the web `/admin/menu` (super admin), without the
/// Today's Special card. Products and addons can be added, edited and
/// deactivated. A deactivated product leaves every branch menu; a new product
/// shows as "Coming soon" on the website until a branch admin adds stock.
class MenuScreen extends StatefulWidget {
  const MenuScreen({super.key});

  @override
  State<MenuScreen> createState() => _MenuScreenState();
}

class _MenuScreenState extends State<MenuScreen> {
  String _tab = 'products';
  String _search = '';
  String? _category;
  String _status = 'all';
  late final Loadable<List<AdminProduct>> _products;
  late final Loadable<List<AdminTopping>> _toppings;
  List<MenuCategory> _categories = const [];

  @override
  void initState() {
    super.initState();
    final c = context.read<AppContainer>();
    _products = Loadable(() => c.adminRepository.products());
    _toppings = Loadable(() => c.adminRepository.toppings());
    c.menuRepository.categories().then((v) => mounted ? setState(() => _categories = v) : null, onError: (_) {});
  }

  @override
  void dispose() {
    _products.dispose();
    _toppings.dispose();
    super.dispose();
  }

  String _categoryName(AdminProduct p) =>
      p.categoryName.isNotEmpty ? p.categoryName : (_categories.where((c) => c.id == p.categoryId).firstOrNull?.name ?? '—');

  Future<void> _openForm([AdminProduct? product]) async {
    final saved = await Navigator.of(context).push<bool>(
      MaterialPageRoute(
        builder: (_) => ProductFormScreen(
          product: product,
          categories: _categories,
          toppings: _toppings.data ?? const [],
        ),
      ),
    );
    if (saved == true) _products.load(silent: true);
  }

  Future<void> _toggle(AdminProduct p) async {
    final off = p.isAvailable;
    final ok = await confirmDialog(
      context,
      title: off ? tr('Deactivate product?') : tr('Activate product?'),
      message: off
          ? tr('"{name}" will be removed from the menu of every branch until you turn it back on.', {'name': p.name})
          : tr('"{name}" will be visible on the customer menu again.', {'name': p.name}),
      confirmLabel: off ? tr('Deactivate') : tr('Activate'),
      danger: off,
      icon: off ? Icons.visibility_off_outlined : Icons.visibility_outlined,
    );
    if (!ok || !mounted) return;
    try {
      await context.read<AppContainer>().adminRepository.setProductAvailable(p.id, !p.isAvailable);
      PosFeedback.success();
      if (mounted) showPosSnack(context, off ? tr('Product deactivated') : tr('Product activated'), kind: PosSnackKind.success);
      _products.load(silent: true);
    } catch (e) {
      if (mounted) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    }
  }

  Future<void> _openAddon([AdminTopping? t]) async {
    final saved = await showPosSheet<bool>(context, builder: (_) => _AddonForm(topping: t));
    if (saved == true) _toppings.load(silent: true);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([_products, _toppings]),
      builder: (context, _) {
        final products = _products.data;
        final toppings = _toppings.data;
        return AdminPageList(
          onRefresh: () => Future.wait([_products.load(silent: true), _toppings.load(silent: true)]),
          children: [
            PageHeader(
              title: tr('Menu Management'),
              subtitle: tr('{p} products · {a} addons', {'p': products?.length ?? '—', 'a': toppings?.length ?? '—'}),
              actions: [
                PosButton(
                  label: _tab == 'products' ? tr('Add product') : tr('Add addon'),
                  icon: Icons.add_rounded,
                  expand: false,
                  height: 42,
                  onPressed: () => _tab == 'products' ? _openForm() : _openAddon(),
                ),
              ],
            ),
            const SizedBox(height: PosSpacing.md),
            PillTabs<String>(
              items: [('products', tr('Products'), Icons.local_cafe_outlined, null), ('addons', tr('Addons'), Icons.add_circle_outline_rounded, null)],
              selected: _tab,
              onSelect: (t) => setState(() => _tab = t),
            ),
            const SizedBox(height: PosSpacing.md),
            if (_tab == 'products') ..._productsView(products) else ..._addonsView(toppings),
          ],
        );
      },
    );
  }

  List<Widget> _productsView(List<AdminProduct>? products) {
    final c = context.pos;
    if (products == null) {
      return [
        _products.error != null
            ? ErrorView(message: _products.error!, onRetry: _products.load)
            : const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView()),
      ];
    }
    final q = _search.toLowerCase();
    final rows = products.where((p) {
      if (q.isNotEmpty && !p.name.toLowerCase().contains(q)) return false;
      if (_category != null && p.categoryId != _category) return false;
      if (_status == 'available' && !p.isAvailable) return false;
      if (_status == 'unavailable' && p.isAvailable) return false;
      return true;
    }).toList();
    return [
      InlineNotice(
        message: tr('New products show as "Coming soon" on the website until a branch admin adds stock for them.'),
        tone: NoticeTone.info,
      ),
      const SizedBox(height: PosSpacing.md),
      SearchBox(hint: tr('Search products'), onChanged: (v) => setState(() => _search = v)),
      const SizedBox(height: PosSpacing.sm),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            CategoryChip(label: tr('All'), selected: _category == null, onTap: () => setState(() => _category = null)),
            for (final cat in _categories) ...[
              const SizedBox(width: 6),
              CategoryChip(label: cat.name, selected: _category == cat.id, onTap: () => setState(() => _category = cat.id)),
            ],
          ],
        ),
      ),
      const SizedBox(height: PosSpacing.sm),
      PillTabs<String>(
        items: [
          ('all', tr('All'), null, products.length),
          ('available', tr('Active'), null, products.where((p) => p.isAvailable).length),
          ('unavailable', tr('Inactive'), null, products.where((p) => !p.isAvailable).length),
        ],
        selected: _status,
        onSelect: (s) => setState(() => _status = s),
      ),
      const SizedBox(height: PosSpacing.md),
      if (rows.isEmpty)
        EmptyView(message: tr('No products match these filters'), icon: Icons.local_cafe_outlined)
      else
        ResponsiveGrid(
          minItemWidth: 360,
          children: [
            for (final p in rows)
              PosCard(
                padding: const EdgeInsets.all(PosSpacing.md),
                onTap: () => _openForm(p),
                child: Row(
                  children: [
                    Opacity(
                      opacity: p.isAvailable ? 1 : 0.5,
                      child: ProductImage(
                        url: p.imageUrls.isEmpty ? null : AppConfig.resolveAssetUrl(p.imageUrls.first),
                        size: 56,
                        contain: true,
                        radius: 10,
                      ),
                    ),
                    const SizedBox(width: PosSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(p.name, maxLines: 2, overflow: TextOverflow.ellipsis, style: PosType.bodyStrong.copyWith(color: c.text)),
                          Text(
                            '${_categoryName(p)} · ${formatMoney(p.basePrice)}',
                            style: PosType.caption.copyWith(color: c.textMuted),
                          ),
                          const SizedBox(height: 4),
                          Wrap(
                            spacing: 4,
                            runSpacing: 4,
                            children: [
                              PosBadge(label: p.isAvailable ? tr('Active') : tr('Inactive'), color: p.isAvailable ? c.successText : c.dangerText),
                              if (!p.isDeliveryAvailable) PosBadge(label: tr('Pickup only'), color: c.warningText),
                              if (p.tag != null) PosBadge(label: p.tag!, color: c.brand),
                            ],
                          ),
                        ],
                      ),
                    ),
                    Column(
                      children: [
                        PosIconButton(icon: Icons.edit_outlined, tooltip: tr('Edit'), onPressed: () => _openForm(p)),
                        const SizedBox(height: 6),
                        PosIconButton(
                          icon: p.isAvailable ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                          tooltip: p.isAvailable ? tr('Deactivate') : tr('Activate'),
                          onPressed: () => _toggle(p),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
          ],
        ),
    ];
  }

  List<Widget> _addonsView(List<AdminTopping>? toppings) {
    final c = context.pos;
    if (toppings == null) {
      return [
        _toppings.error != null
            ? ErrorView(message: _toppings.error!, onRetry: _toppings.load)
            : const Padding(padding: EdgeInsets.all(PosSpacing.xxl), child: LoadingView()),
      ];
    }
    if (toppings.isEmpty) {
      return [EmptyView(message: tr('No addons yet'), icon: Icons.add_circle_outline_rounded)];
    }
    return [
      PosCard(
        padding: EdgeInsets.zero,
        child: Column(
          children: [
            for (final (i, t) in toppings.indexed) ...[
              if (i > 0) Divider(height: 1, color: c.border.withValues(alpha: 0.6)),
              ListTile(
                title: Text(t.name, style: PosType.bodyStrong.copyWith(color: c.text, fontSize: 13.5)),
                subtitle: Text('+${formatMoney(t.extraPrice)}', style: PosType.caption.copyWith(color: c.textMuted)),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    PosBadge(label: t.isAvailable ? tr('Active') : tr('Hidden'), color: t.isAvailable ? c.successText : c.textMuted),
                    const SizedBox(width: 6),
                    Icon(Icons.chevron_right_rounded, color: c.textMuted),
                  ],
                ),
                onTap: () => _openAddon(t),
              ),
            ],
          ],
        ),
      ),
    ];
  }
}

/// Add / edit addon (web addon form: name, extra price, active).
class _AddonForm extends StatefulWidget {
  const _AddonForm({this.topping});
  final AdminTopping? topping;

  @override
  State<_AddonForm> createState() => _AddonFormState();
}

class _AddonFormState extends State<_AddonForm> {
  late final _name = TextEditingController(text: widget.topping?.name ?? '');
  late final _price = TextEditingController(text: widget.topping == null ? '' : _num(widget.topping!.extraPrice));
  late bool _active = widget.topping?.isAvailable ?? true;
  bool _busy = false;

  @override
  void dispose() {
    _name.dispose();
    _price.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final price = int.tryParse(_price.text.trim());
    if (_name.text.trim().isEmpty || price == null || price < 0) {
      showPosSnack(context, tr('Enter a name and a whole-number price'), kind: PosSnackKind.error);
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<AppContainer>().adminRepository.saveTopping(
        widget.topping?.id,
        name: _name.text.trim(),
        extraPrice: price.toDouble(),
        isAvailable: _active,
      );
      PosFeedback.success();
      if (!mounted) return;
      showPosSnack(context, widget.topping == null ? tr('Addon created') : tr('Addon updated'), kind: PosSnackKind.success);
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showPosSnack(context, e.toString(), kind: PosSnackKind.error);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    return SafeArea(
      top: false,
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            SheetHeader(title: widget.topping == null ? tr('New addon') : tr('Edit addon')),
            Padding(
              padding: const EdgeInsets.fromLTRB(PosSpacing.xl, 0, PosSpacing.xl, PosSpacing.xl),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  TextField(controller: _name, decoration: InputDecoration(labelText: tr('Name'))),
                  const SizedBox(height: PosSpacing.md),
                  TextField(
                    controller: _price,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(labelText: tr('Extra price (LKR)')),
                  ),
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(tr('Active'), style: PosType.body.copyWith(color: c.text)),
                    value: _active,
                    onChanged: (v) => setState(() => _active = v),
                  ),
                  const SizedBox(height: PosSpacing.sm),
                  PosButton(label: tr('Save addon'), icon: Icons.check_rounded, loading: _busy, onPressed: _save),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

String _num(double v) => v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toString();

/// A product photo: already saved (server path) or picked on this device.
class _Photo {
  const _Photo.saved(this.url) : file = null;
  const _Photo.local(this.file) : url = null;
  final String? url;
  final XFile? file;
}

/// Create / edit product — the web product form (name, category, price, cost,
/// description, ingredients, tag, availability, addons and a photo gallery whose
/// first image is the cover).
class ProductFormScreen extends StatefulWidget {
  const ProductFormScreen({super.key, this.product, required this.categories, required this.toppings});
  final AdminProduct? product;
  final List<MenuCategory> categories;
  final List<AdminTopping> toppings;

  @override
  State<ProductFormScreen> createState() => _ProductFormScreenState();
}

class _ProductFormScreenState extends State<ProductFormScreen> {
  final _form = GlobalKey<FormState>();
  late final AdminProduct? p = widget.product;
  late final _name = TextEditingController(text: p?.name ?? '');
  late final _price = TextEditingController(text: p == null ? '' : _num(p!.basePrice));
  late final _cost = TextEditingController(text: p == null || p!.cost == 0 ? '' : _num(p!.cost));
  late final _desc = TextEditingController(text: p?.description ?? '');
  late final _ingredients = TextEditingController(text: p?.ingredients ?? '');
  late final _tag = TextEditingController(text: p?.tag ?? '');
  late String? _categoryId = p?.categoryId ?? widget.categories.firstOrNull?.id;
  late bool _available = p?.isAvailable ?? true;
  late bool _delivery = p?.isDeliveryAvailable ?? true;
  late final Set<String> _toppingIds = {...?p?.toppingIds};
  late final List<_Photo> _photos = [for (final u in p?.imageUrls ?? const <String>[]) _Photo.saved(u)];
  bool _busy = false;

  static const _maxBytes = 5 * 1024 * 1024;

  @override
  void dispose() {
    for (final c in [_name, _price, _cost, _desc, _ingredients, _tag]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _addPhotos(ImageSource source) async {
    final picker = ImagePicker();
    try {
      final picked = source == ImageSource.camera
          ? [?await picker.pickImage(source: source, maxWidth: 1600, imageQuality: 85)]
          : await picker.pickMultiImage(maxWidth: 1600, imageQuality: 85);
      final ok = <XFile>[];
      for (final f in picked) {
        if (await f.length() > _maxBytes) {
          if (mounted) showPosSnack(context, tr('{name} is over 5 MB', {'name': f.name}), kind: PosSnackKind.error);
          continue;
        }
        ok.add(f);
      }
      setState(() => _photos.addAll(ok.map(_Photo.local)));
    } catch (e) {
      if (mounted) showPosSnack(context, e.toString(), kind: PosSnackKind.error);
    }
  }

  Future<void> _choosePhotoSource() async {
    final source = await showOptionSheet<ImageSource>(
      context,
      title: tr('Add photos'),
      options: [(ImageSource.gallery, tr('Choose from gallery')), (ImageSource.camera, tr('Take a photo'))],
    );
    if (source != null) await _addPhotos(source);
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    if (_categoryId == null) {
      showPosSnack(context, tr('Choose a category'), kind: PosSnackKind.error);
      return;
    }
    final editing = p != null;
    final ok = await confirmDialog(
      context,
      title: editing ? tr('Update Product') : tr('Create Product'),
      message: editing ? tr('Are you sure you want to update this product?') : tr('Are you sure you want to create this new product?'),
      confirmLabel: editing ? tr('Update') : tr('Create'),
    );
    if (!ok || !mounted) return;
    setState(() => _busy = true);
    final repo = context.read<AppContainer>().adminRepository;
    try {
      final urls = <String>[];
      for (final photo in _photos) {
        if (photo.url != null) {
          urls.add(photo.url!);
        } else {
          final u = await repo.uploadProductImage(photo.file!.path);
          if (u != null) urls.add(u);
        }
      }
      await repo.saveProduct(p?.id, {
        'name': _name.text.trim(),
        'categoryId': _categoryId,
        'basePrice': int.parse(_price.text.trim()),
        'cost': _cost.text.trim().isEmpty ? 0 : int.parse(_cost.text.trim()),
        'description': _desc.text.trim(),
        'ingredients': _ingredients.text.trim(),
        'tag': _tag.text.trim(),
        'isAvailable': _available,
        'isDeliveryAvailable': _delivery,
        'toppingIds': _toppingIds.toList(),
        'imageUrl': urls.firstOrNull,
        'imageUrls': urls,
      });
      PosFeedback.success();
      if (!mounted) return;
      showPosSnack(context, editing ? tr('Product updated') : tr('Product created'), kind: PosSnackKind.success);
      Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showPosSnack(context, e.toString(), kind: PosSnackKind.error);
      }
    }
  }

  String? _wholeLkr(String? v, {bool required = true}) {
    final s = (v ?? '').trim();
    if (s.isEmpty) return required ? tr('Required') : null;
    if (!RegExp(r'^\d+$').hasMatch(s)) return tr('Whole number (LKR)');
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final c = context.pos;
    final wide = isTablet(context);
    Widget pair(Widget a, Widget b) => wide
        ? Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Expanded(child: a), const SizedBox(width: PosSpacing.md), Expanded(child: b)])
        : Column(children: [a, const SizedBox(height: PosSpacing.md), b]);
    return Scaffold(
      appBar: AppBar(title: Text(p == null ? tr('New product') : tr('Edit product')), toolbarHeight: 52),
      body: Form(
        key: _form,
        child: ListView(
          padding: centeredPadding(context, maxWidth: 820),
          children: [
            if (p == null) ...[
              InlineNotice(
                message: tr('This product shows as "Coming soon" on the website until a branch admin adds stock for it.'),
                tone: NoticeTone.info,
              ),
              const SizedBox(height: PosSpacing.md),
            ],
            SectionLabel(tr('Photos'), trailing: TextButton.icon(onPressed: _choosePhotoSource, icon: const Icon(Icons.add_a_photo_outlined, size: 16), label: Text(tr('Add')))),
            SizedBox(
              height: 112,
              child: _photos.isEmpty
                  ? PosInset(
                      child: Center(
                        child: TextButton.icon(
                          onPressed: _choosePhotoSource,
                          icon: const Icon(Icons.image_outlined),
                          label: Text(tr('Add a cover photo')),
                        ),
                      ),
                    )
                  : ReorderableListView(
                      scrollDirection: Axis.horizontal,
                      buildDefaultDragHandles: false,
                      onReorder: (from, to) => setState(() {
                        if (to > from) to--;
                        _photos.insert(to, _photos.removeAt(from));
                      }),
                      children: [
                        for (final (i, ph) in _photos.indexed)
                          ReorderableDelayedDragStartListener(
                            key: ObjectKey(ph),
                            index: i,
                            child: Padding(
                              padding: const EdgeInsets.only(right: PosSpacing.sm),
                              child: Stack(
                                children: [
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(PosRadius.button),
                                    child: SizedBox(
                                      width: 104,
                                      height: 104,
                                      child: ph.file != null
                                          ? Image.file(File(ph.file!.path), fit: BoxFit.cover)
                                          : ProductImage(url: AppConfig.resolveAssetUrl(ph.url), size: 104, radius: PosRadius.button),
                                    ),
                                  ),
                                  if (i == 0)
                                    Positioned(
                                      left: 4,
                                      bottom: 4,
                                      child: PosBadge(label: tr('Cover'), color: c.brand, solid: true),
                                    ),
                                  Positioned(
                                    right: 2,
                                    top: 2,
                                    child: InkWell(
                                      onTap: () => setState(() => _photos.removeAt(i)),
                                      child: Container(
                                        padding: const EdgeInsets.all(3),
                                        decoration: const BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                                        child: const Icon(Icons.close_rounded, size: 14, color: Colors.white),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                      ],
                    ),
            ),
            if (_photos.length > 1)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Text(tr('Long-press and drag to reorder. The first photo is the cover.'), style: PosType.caption.copyWith(color: c.textMuted)),
              ),
            const SizedBox(height: PosSpacing.lg),
            SectionLabel(tr('Details')),
            TextFormField(
              controller: _name,
              decoration: InputDecoration(labelText: tr('Product name')),
              validator: (v) => (v ?? '').trim().isEmpty ? tr('Required') : null,
            ),
            const SizedBox(height: PosSpacing.md),
            DropdownButtonFormField<String>(
              initialValue: _categoryId,
              decoration: InputDecoration(labelText: tr('Category')),
              items: [for (final cat in widget.categories) DropdownMenuItem(value: cat.id, child: Text(cat.name))],
              onChanged: (v) => setState(() => _categoryId = v),
            ),
            const SizedBox(height: PosSpacing.md),
            pair(
              TextFormField(
                controller: _price,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: InputDecoration(labelText: tr('Base price (LKR)')),
                validator: _wholeLkr,
              ),
              TextFormField(
                controller: _cost,
                keyboardType: TextInputType.number,
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: InputDecoration(labelText: tr('Cost (LKR, optional)')),
                validator: (v) => _wholeLkr(v, required: false),
              ),
            ),
            const SizedBox(height: PosSpacing.md),
            TextFormField(controller: _desc, minLines: 2, maxLines: 5, decoration: InputDecoration(labelText: tr('Description'))),
            const SizedBox(height: PosSpacing.md),
            TextFormField(controller: _ingredients, minLines: 1, maxLines: 4, decoration: InputDecoration(labelText: tr('Ingredients'))),
            const SizedBox(height: PosSpacing.md),
            TextFormField(controller: _tag, decoration: InputDecoration(labelText: tr('Tag (e.g. Bestseller, New)'))),
            const SizedBox(height: PosSpacing.md),
            PosCard(
              padding: EdgeInsets.zero,
              child: Column(
                children: [
                  SwitchListTile(
                    title: Text(tr('Active on the menu'), style: PosType.body.copyWith(color: c.text)),
                    subtitle: Text(tr('Off removes it from every branch menu'), style: PosType.caption.copyWith(color: c.textMuted)),
                    value: _available,
                    onChanged: (v) => setState(() => _available = v),
                  ),
                  Divider(height: 1, color: c.border.withValues(alpha: 0.6)),
                  SwitchListTile(
                    title: Text(tr('Available for delivery'), style: PosType.body.copyWith(color: c.text)),
                    value: _delivery,
                    onChanged: (v) => setState(() => _delivery = v),
                  ),
                ],
              ),
            ),
            if (widget.toppings.isNotEmpty) ...[
              const SizedBox(height: PosSpacing.lg),
              SectionLabel(tr('Addons')),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: [
                  for (final t in widget.toppings)
                    FilterChip(
                      label: Text('${t.name} · +${formatMoneyAmount(t.extraPrice)}'),
                      selected: _toppingIds.contains(t.id),
                      onSelected: (on) => setState(() => on ? _toppingIds.add(t.id) : _toppingIds.remove(t.id)),
                    ),
                ],
              ),
            ],
            const SizedBox(height: PosSpacing.xl),
            PosButton(
              label: p == null ? tr('Create product') : tr('Save changes'),
              icon: Icons.check_rounded,
              loading: _busy,
              onPressed: _save,
            ),
          ],
        ),
      ),
    );
  }
}
