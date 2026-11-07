'use client';

import { adminApiFetch as adminFetch } from '@/lib/adminApi';
import { getApiBaseUrl } from '@/lib/apiBase';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Power, Trash2, Upload, X, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import ProductImage from '@/components/ui/ProductImage';
import AdminTodaySpecialCard from '@/components/admin/AdminTodaySpecialCard';
import { resolveProductImageUrl } from '@/lib/productImageUrl';
import { confirmDialog } from '@/store/confirmStore';

interface ProductForm {
  name: string;
  categoryId: string;
  basePrice: string;
  cost: string;
  description: string;
  ingredients: string;
  tag: string;
  isAvailable: boolean;
  isDeliveryAvailable: boolean;
  toppingIds: string[];
}

interface GalleryImage {
  id: string;
  kind: 'saved' | 'local';
  url: string;
  file?: File;
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Whole-LKR commerce fields — reject fractional input instead of truncating with parseInt. */
function parseWholeLkr(raw: string, label: string): number {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`${label} must be a whole number (LKR)`);
  }
  const n = Number(trimmed);
  if (!Number.isSafeInteger(n) || n < 0) {
    throw new Error(`Invalid ${label}`);
  }
  return n;
}

function newGalleryId() {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function revokeLocalGalleryUrls(items: GalleryImage[]) {
  for (const item of items) {
    if (item.kind === 'local') URL.revokeObjectURL(item.url);
  }
}

function galleryImageFromSaved(url: string): GalleryImage {
  return { id: newGalleryId(), kind: 'saved', url };
}

function fileToGalleryImage(file: File): GalleryImage | null {
  if (!file.type.startsWith('image/')) {
    toast.error(`${file.name} is not a supported image`);
    return null;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    toast.error(`${file.name} must be less than 5MB`);
    return null;
  }
  return {
    id: newGalleryId(),
    kind: 'local',
    url: URL.createObjectURL(file),
    file,
  };
}

function filesToGalleryImages(files: File[]): GalleryImage[] {
  return files.map(fileToGalleryImage).filter((item): item is GalleryImage => item !== null);
}

function resolveGallerySrc(item: GalleryImage): string {
  return item.kind === 'saved'
    ? (resolveProductImageUrl(item.url) || item.url)
    : item.url;
}

interface ProductImages {
  cover: GalleryImage | null;
  others: GalleryImage[];
}

const EMPTY_PRODUCT_IMAGES: ProductImages = { cover: null, others: [] };

function productImagesFromSavedUrls(urls: string[]): ProductImages {
  if (!urls.length) return EMPTY_PRODUCT_IMAGES;
  return {
    cover: galleryImageFromSaved(urls[0]),
    others: urls.slice(1).map(galleryImageFromSaved),
  };
}

function revokeProductImages(images: ProductImages) {
  revokeLocalGalleryUrls([
    ...(images.cover ? [images.cover] : []),
    ...images.others,
  ]);
}

const EMPTY_FORM: ProductForm = {
  name: '', categoryId: '', basePrice: '', cost: '', description: '', ingredients: '', tag: '', isAvailable: true, isDeliveryAvailable: true, toppingIds: [],
};
const TAGS = ['', 'Classic', 'Popular', 'New', 'Best Seller', 'Signature', 'Rs.200 Only'];

export default function AdminMenuPage() {
  const [tab, setTab] = useState<'products' | 'addons'>('products');
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [addonForm, setAddonForm] = useState({ name: '', extraPrice: '', isAvailable: true });
  const [editingAddonId, setEditingAddonId] = useState<string | null>(null);
  const [showAddonForm, setShowAddonForm] = useState(false);
  const [bulkCategoryId, setBulkCategoryId] = useState('');
  const [bulkToppingIds, setBulkToppingIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'available' | 'unavailable'>('all');
  const [productImages, setProductImages] = useState<ProductImages>(EMPTY_PRODUCT_IMAGES);
  const [isCoverDragOver, setIsCoverDragOver] = useState(false);
  const [isOthersDragOver, setIsOthersDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  const qc = useQueryClient();

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (!showForm) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeForm();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [showForm]);

  const { data: products = [] } = useQuery<any[]>({
    queryKey: ['admin-products', selectedStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (selectedStatus === 'available') params.set('available', 'true');
      else if (selectedStatus === 'unavailable') params.set('available', 'false');
      else params.set('all', 'true');
      const qs = params.toString();
      return adminFetch(`/menu/products${qs ? `?${qs}` : ''}`);
    },
  });

  const filteredProducts = products.filter((p: any) => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory ? p.categoryId === selectedCategory : true;
    const matchesStatus =
      selectedStatus === 'all'
        ? true
        : selectedStatus === 'available'
          ? Boolean(p.isAvailable)
          : !p.isAvailable;
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ['admin-categories'],
    queryFn: () => adminFetch('/menu/categories'),
  });

  const { data: toppings = [] } = useQuery<any[]>({
    queryKey: ['admin-toppings'],
    queryFn: () => adminFetch('/menu/toppings?all=true'),
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => editingId
      ? adminFetch(`/menu/products/${editingId}`, { method: 'PUT', body: JSON.stringify(data) })
      : adminFetch('/menu/products', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-products'] });
      closeForm();
      toast.success(editingId ? 'Product updated' : 'Product created');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, available }: { id: string; available: boolean }) =>
      adminFetch(`/menu/products/${id}`, { method: 'PUT', body: JSON.stringify({ isAvailable: available }) }),
    onSuccess: (_data, { available }) => {
      qc.invalidateQueries({ queryKey: ['admin-products'] });
      toast.success(available ? 'Product is now available' : 'Product is now unavailable');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAddonMutation = useMutation({
    mutationFn: (data: any) => editingAddonId
      ? adminFetch(`/menu/toppings/${editingAddonId}`, { method: 'PUT', body: JSON.stringify(data) })
      : adminFetch('/menu/toppings', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-toppings'] });
      setAddonForm({ name: '', extraPrice: '', isAvailable: true });
      setEditingAddonId(null);
      setShowAddonForm(false);
      toast.success('Addon saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteAddonMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/menu/toppings/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-toppings'] }); toast.success('Addon deleted'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const bulkAssignMutation = useMutation({
    mutationFn: () => adminFetch('/menu/toppings/bulk-assign', {
      method: 'POST',
      body: JSON.stringify({ toppingIds: bulkToppingIds, categoryId: bulkCategoryId }),
    }),
    onSuccess: () => {
      toast.success('Addons assigned to category');
      setBulkCategoryId('');
      setBulkToppingIds([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function closeForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
    setProductImages((prev) => {
      revokeProductImages(prev);
      return EMPTY_PRODUCT_IMAGES;
    });
    setIsCoverDragOver(false);
    setIsOthersDragOver(false);
  }

  function addCoverFile(file: File) {
    const next = fileToGalleryImage(file);
    if (!next) return;
    setProductImages((prev) => {
      const others = prev.cover ? [prev.cover, ...prev.others] : prev.others;
      return { cover: next, others };
    });
  }

  function addCoverFiles(files: File[]) {
    if (!files.length) return;
    addCoverFile(files[0]);
    const rest = files.slice(1);
    if (rest.length) addOtherFiles(rest);
  }

  function addOtherFiles(files: File[]) {
    const accepted = filesToGalleryImages(files);
    if (!accepted.length) return;
    setProductImages((prev) => ({
      ...prev,
      others: [...prev.others, ...accepted],
    }));
  }

  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) addCoverFile(file);
  };

  const handleOthersFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    addOtherFiles(files);
  };

  const handleCoverDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsCoverDragOver(false);
    addCoverFiles(Array.from(e.dataTransfer.files || []));
  };

  const handleOthersDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsOthersDragOver(false);
    addOtherFiles(Array.from(e.dataTransfer.files || []));
  };

  function removeCoverImage() {
    setProductImages((prev) => {
      if (prev.cover?.kind === 'local') URL.revokeObjectURL(prev.cover.url);
      return { ...prev, cover: null };
    });
  }

  function removeOtherImage(id: string) {
    setProductImages((prev) => {
      const target = prev.others.find((item) => item.id === id);
      if (target?.kind === 'local') URL.revokeObjectURL(target.url);
      return {
        ...prev,
        others: prev.others.filter((item) => item.id !== id),
      };
    });
  }

  function useOtherAsCover(id: string) {
    setProductImages((prev) => {
      const picked = prev.others.find((item) => item.id === id);
      if (!picked) return prev;
      const others = prev.others.filter((item) => item.id !== id);
      if (prev.cover) others.unshift(prev.cover);
      return { cover: picked, others };
    });
  }

  async function uploadGalleryItem(item: GalleryImage): Promise<string | null> {
    if (item.kind === 'saved') return item.url;
    if (!item.file) return null;

    const formData = new FormData();
    formData.append('image', item.file);

        const res = await fetch(`${getApiBaseUrl()}/menu/products/upload`, {
      method: 'POST',
      headers: {
        },
      body: formData,
    });

    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.message || 'Image upload failed');
    }

    const uploadResult = await res.json();
    return uploadResult.data?.imageUrl ?? null;
  }

  async function handleToggleAvailability(product: { id: string; name: string; isAvailable: boolean }) {
    const makingUnavailable = product.isAvailable;
    const confirmed = await confirmDialog({
      title: makingUnavailable ? 'Make product unavailable?' : 'Make product available?',
      message: makingUnavailable
        ? `"${product.name}" will be hidden from the customer menu until you turn it back on.`
        : `"${product.name}" will be visible on the customer menu again.`,
      confirmLabel: makingUnavailable ? 'Make unavailable' : 'Make available',
      cancelLabel: 'Cancel',
      variant: makingUnavailable ? 'danger' : 'default',
    });
    if (!confirmed) return;
    toggleMutation.mutate({ id: product.id, available: !product.isAvailable });
  }

  function startCreate() {
    closeForm();
    setShowForm(true);
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    
    const isEditing = !!editingId;
    const confirmed = await confirmDialog({
      title: isEditing ? 'Update Product' : 'Create Product',
      message: isEditing ? 'Are you sure you want to update this product?' : 'Are you sure you want to create this new product?',
      confirmLabel: isEditing ? 'Update' : 'Create',
    });
    
    if (!confirmed) return;

    setUploading(true);
    try {
      const orderedItems = [
        ...(productImages.cover ? [productImages.cover] : []),
        ...productImages.others,
      ];
      const uploadResults = await Promise.all(
        orderedItems.map((item) => uploadGalleryItem(item)),
      );
      const imageUrls = uploadResults.filter((url): url is string => Boolean(url));

      await saveMutation.mutateAsync({
        ...form,
        basePrice: parseWholeLkr(form.basePrice, 'Base price'),
        cost: form.cost.trim() === '' ? 0 : parseWholeLkr(form.cost, 'Cost'),
        toppingIds: form.toppingIds,
        imageUrl: imageUrls[0] ?? null,
        imageUrls,
        isDeliveryAvailable: form.isDeliveryAvailable,
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to save product');
    } finally {
      setUploading(false);
    }
  }

  function startEdit(p: any) {
    closeForm();
    const linked = (p.toppings ?? []).map((pt: any) => pt.toppingId ?? pt.topping?.id).filter(Boolean);

    const imageUrls: string[] = Array.isArray(p.imageUrls) && p.imageUrls.length
      ? p.imageUrls
      : (p.imageUrl ? [p.imageUrl] : []);
    setForm({
      name: p.name,
      categoryId: p.categoryId,
      basePrice: String(p.basePrice),
      cost: String(p.cost ?? ''),
      description: p.description || '',
      ingredients: p.ingredients || '',
      tag: p.tag || '',
      isAvailable: p.isAvailable,
      isDeliveryAvailable: p.isDeliveryAvailable ?? true,
      toppingIds: linked,
    });
    setProductImages(productImagesFromSavedUrls(imageUrls));
    setEditingId(p.id);
    setShowForm(true);
  }

  function toggleProductTopping(toppingId: string) {
    setForm((f) => ({
      ...f,
      toppingIds: f.toppingIds.includes(toppingId)
        ? f.toppingIds.filter((id) => id !== toppingId)
        : [...f.toppingIds, toppingId],
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Menu Management</h1>
          <p className="text-muted text-sm">{products.length} products · {toppings.length} addons</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab('products')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'products' ? 'bg-brand text-white' : 'bg-navy-light text-muted'}`}
          >
            Products
          </button>
          <button
            type="button"
            onClick={() => setTab('addons')}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'addons' ? 'bg-brand text-white' : 'bg-navy-light text-muted'}`}
          >
            Addons
          </button>
        </div>
      </div>

      <AdminTodaySpecialCard />

      {tab === 'products' && (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={startCreate} className="btn-primary px-4 py-2.5 text-sm">
              <Plus size={15} /> Add Product
            </button>
          </div>

          {portalReady && createPortal(
            <AnimatePresence>
              {showForm && (
                <motion.div
                  role="presentation"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4 sm:p-6"
                  onClick={closeForm}
                >
                  <motion.div
                    role="dialog"
                    aria-modal
                    aria-label={editingId ? 'Edit Product' : 'New Product'}
                    initial={{ opacity: 0, scale: 0.94, y: 12 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96, y: 8 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    className="flex max-h-[min(92vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-start justify-between gap-4 border-b border-gray-200 px-6 py-5">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                          {editingId ? 'Edit Product' : 'New Product'}
                        </h3>
                        <p className="mt-1 text-sm text-gray-500">
                          Add product details, images and available add-ons.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={closeForm}
                        className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        aria-label="Close"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    <form onSubmit={submitForm} className="flex min-h-0 flex-1 flex-col">
                      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                        <div className="grid gap-6 lg:grid-cols-12">
                          <section className="flex flex-col gap-4 lg:col-span-5">
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900">Product images</h4>
                              <p className="mt-0.5 text-xs text-gray-500">
                                The first image will be used as the cover.
                              </p>
                            </div>

                            {productImages.cover ? (
                              <div
                                className={`relative rounded-lg border bg-gray-50 ${
                                  isCoverDragOver ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
                                }`}
                                onDragOver={(e) => { e.preventDefault(); setIsCoverDragOver(true); }}
                                onDragLeave={() => setIsCoverDragOver(false)}
                                onDrop={handleCoverDrop}
                              >
                                <div className="aspect-[4/3] w-full overflow-hidden rounded-lg p-2">
                                  <img
                                    src={resolveGallerySrc(productImages.cover)}
                                    alt="Cover preview"
                                    className="h-full w-full rounded object-contain"
                                  />
                                </div>
                                <span className="absolute bottom-3 left-3 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium !text-white">
                                  Cover
                                </span>
                                <button
                                  type="button"
                                  onClick={removeCoverImage}
                                  className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 !text-white shadow-sm hover:bg-red-600"
                                  title="Remove cover image"
                                >
                                  <X size={12} className="!text-white" strokeWidth={2.5} />
                                </button>
                              </div>
                            ) : (
                              <label
                                className={`flex aspect-[4/3] cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed p-5 transition-colors ${
                                  isCoverDragOver
                                    ? 'border-blue-500 bg-blue-50'
                                    : 'border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50/50'
                                }`}
                                onDragOver={(e) => { e.preventDefault(); setIsCoverDragOver(true); }}
                                onDragLeave={() => setIsCoverDragOver(false)}
                                onDrop={handleCoverDrop}
                              >
                                <Upload size={28} className="mb-2 text-blue-600" />
                                <span className="text-sm font-medium text-gray-700">Upload cover image</span>
                                <span className="mt-1 text-xs text-gray-400">PNG, JPG, WEBP · Max 5MB</span>
                                <input type="file" accept="image/*" className="hidden" onChange={handleCoverFileChange} />
                              </label>
                            )}

                            <div
                              className={`rounded-lg transition-colors ${
                                isOthersDragOver ? 'ring-2 ring-blue-100' : ''
                              }`}
                              onDragOver={(e) => { e.preventDefault(); setIsOthersDragOver(true); }}
                              onDragLeave={() => setIsOthersDragOver(false)}
                              onDrop={handleOthersDrop}
                            >
                              <div className="flex flex-wrap gap-3 px-1 pb-1 pt-2">
                                {productImages.others.map((item) => (
                                  <div
                                    key={item.id}
                                    className="group relative h-[72px] w-[72px] shrink-0 rounded-lg border border-gray-200 bg-gray-50"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => useOtherAsCover(item.id)}
                                      className="h-full w-full overflow-hidden rounded-lg"
                                      title="Use as cover image"
                                    >
                                      <img
                                        src={resolveGallerySrc(item)}
                                        alt=""
                                        className="h-full w-full object-contain p-0.5"
                                      />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeOtherImage(item.id)}
                                      className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 !text-white shadow-sm hover:bg-red-600"
                                      title="Remove image"
                                    >
                                      <X size={10} className="!text-white" strokeWidth={2.5} />
                                    </button>
                                  </div>
                                ))}
                                <label className="flex h-[72px] w-[72px] shrink-0 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-gray-400 transition-colors hover:border-blue-400 hover:text-blue-600">
                                  <Plus size={18} />
                                  <span className="mt-0.5 text-[10px] font-medium">Add image</span>
                                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleOthersFileChange} />
                                </label>
                              </div>
                              <p className="mt-2 text-xs text-gray-400">
                                {(productImages.cover ? 1 : 0) + productImages.others.length} image
                                {(productImages.cover ? 1 : 0) + productImages.others.length === 1 ? '' : 's'} selected
                              </p>
                            </div>
                          </section>

                          <section className="flex flex-col gap-4 lg:col-span-7">
                            <div>
                              <h4 className="text-sm font-semibold text-gray-900">Product details</h4>
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label htmlFor="product-name" className="text-sm font-medium text-gray-700">
                                Product name
                              </label>
                              <input
                                id="product-name"
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                placeholder="Product name"
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                required
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex flex-col gap-1.5">
                                <label htmlFor="product-cost" className="text-sm font-medium text-gray-700">
                                  Cost (LKR)
                                </label>
                                <input
                                  id="product-cost"
                                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                  type="number"
                                  min={0}
                                  placeholder="Cost (LKR)"
                                  value={form.cost}
                                  onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                                  required
                                />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label htmlFor="product-price" className="text-sm font-medium text-gray-700">
                                  Selling price (LKR)
                                </label>
                                <input
                                  id="product-price"
                                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                  type="number"
                                  min={0}
                                  placeholder="Selling price (LKR)"
                                  value={form.basePrice}
                                  onChange={(e) => setForm((f) => ({ ...f, basePrice: e.target.value }))}
                                  required
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex flex-col gap-1.5">
                                <label htmlFor="product-category" className="text-sm font-medium text-gray-700">
                                  Category
                                </label>
                                <select
                                  id="product-category"
                                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                  value={form.categoryId}
                                  onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
                                  required
                                >
                                  <option value="">Select category</option>
                                  {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label htmlFor="product-tag" className="text-sm font-medium text-gray-700">
                                  Tag
                                </label>
                                <select
                                  id="product-tag"
                                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                  value={form.tag}
                                  onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}
                                >
                                  {TAGS.map((t) => <option key={t} value={t}>{t || 'No tag'}</option>)}
                                </select>
                              </div>
                            </div>

                            <div className="flex flex-col gap-1.5">
                              <label htmlFor="product-delivery" className="text-sm font-medium text-gray-700">
                                Delivery availability
                              </label>
                              <select
                                id="product-delivery"
                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                value={form.isDeliveryAvailable ? 'yes' : 'no'}
                                onChange={(e) => setForm((f) => ({ ...f, isDeliveryAvailable: e.target.value === 'yes' }))}
                              >
                                <option value="yes">Delivery Available</option>
                                <option value="no">Delivery Not Available</option>
                              </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="flex flex-col gap-1.5">
                                <label htmlFor="product-description" className="text-sm font-medium text-gray-700">
                                  Description
                                </label>
                                <textarea
                                  id="product-description"
                                  className="min-h-[88px] w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                  placeholder="Description (for single product view)"
                                  value={form.description}
                                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                                />
                              </div>
                              <div className="flex flex-col gap-1.5">
                                <label htmlFor="product-ingredients" className="text-sm font-medium text-gray-700">
                                  Ingredients
                                </label>
                                <textarea
                                  id="product-ingredients"
                                  className="min-h-[88px] w-full resize-none rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100"
                                  placeholder="Ingredients (e.g. Fresh Milk, Brown Sugar Syrup, Boba Pearls)"
                                  value={form.ingredients}
                                  onChange={(e) => setForm((f) => ({ ...f, ingredients: e.target.value }))}
                                />
                              </div>
                            </div>
                          </section>
                        </div>

                        {toppings.length > 0 && (
                          <section className="mt-6 border-t border-gray-100 pt-6">
                            <div className="mb-3">
                              <h4 className="text-sm font-semibold text-gray-900">Add-ons</h4>
                              <p className="mt-0.5 text-xs text-gray-500">
                                Select the extras available for this product.
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {toppings.map((t: any) => {
                                const selected = form.toppingIds.includes(t.id);
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => toggleProductTopping(t.id)}
                                    className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                                      selected
                                        ? 'border-blue-600 bg-blue-600 !text-white'
                                        : 'border-blue-300 bg-white text-blue-600 hover:border-blue-400 hover:bg-blue-50'
                                    }`}
                                  >
                                    {t.name} (+{t.extraPrice})
                                  </button>
                                );
                              })}
                            </div>
                          </section>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4">
                        <button
                          type="button"
                          onClick={closeForm}
                          className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saveMutation.isPending || uploading}
                          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium !text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {saveMutation.isPending || uploading
                            ? 'Saving...'
                            : editingId
                              ? 'Update product'
                              : 'Create product'}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>,
            document.body,
          )}

          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="w-full sm:max-w-xs">
              <div className={`input-icon-wrap w-full${searchQuery ? ' input-icon-wrap--end' : ''}`}>
                <Search size={14} className="input-icon" aria-hidden />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="input-field text-sm w-full"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} className="input-action p-1 text-muted hover:text-fg" aria-label="Clear search">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input-field w-full sm:max-w-xs"
            >
              <option value="">All Categories</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as 'all' | 'available' | 'unavailable')}
              className="input-field w-full sm:max-w-xs"
              aria-label="Filter by availability"
            >
              <option value="all">All Status</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
            </select>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-navy-border">
                    {['Image', 'Name', 'Category', 'Price', 'Cost', 'Tag', 'Status', 'Actions'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-muted text-xs font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">
                        No {selectedStatus === 'available' ? 'available' : selectedStatus === 'unavailable' ? 'unavailable' : ''} products match your filters.
                      </td>
                    </tr>
                  ) : (
                  filteredProducts.map((p: any) => (
                    <tr key={p.id} className="border-b border-navy-border hover:bg-navy-light/30">
                      <td className="px-4 py-3">
                        <ProductImage name={p.name} imageUrl={p.imageUrl} className="w-10 h-10 rounded-lg object-cover bg-navy-light/50" />
                      </td>
                      <td className="px-4 py-3 text-white font-medium text-sm">{p.name}</td>
                      <td className="px-4 py-3 text-muted text-xs">{p.category?.name}</td>
                      <td className="px-4 py-3 text-brand font-semibold text-xs">LKR {p.basePrice}</td>
                      <td className="px-4 py-3 text-muted text-xs">LKR {p.cost ?? 0}</td>
                      <td className="px-4 py-3 text-muted text-xs">{p.tag || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium ${p.isAvailable ? 'text-green-400' : 'text-red-400'}`}>
                          {p.isAvailable ? 'Available' : 'Unavailable'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => startEdit(p)} className="btn-outline p-1.5 text-xs"><Edit2 size={12} /></button>
                          <button
                            type="button"
                            onClick={() => handleToggleAvailability(p)}
                            className={`p-1.5 rounded-lg border text-xs ${p.isAvailable ? 'border-red-500/30 text-red-400' : 'border-green-500/30 text-green-400'}`}
                            aria-label={p.isAvailable ? `Make ${p.name} unavailable` : `Make ${p.name} available`}
                          >
                            <Power size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === 'addons' && (
        <>
          <div className="flex justify-end mb-4">
            <button onClick={() => { setAddonForm({ name: '', extraPrice: '', isAvailable: true }); setEditingAddonId(null); setShowAddonForm(true); }} className="btn-primary px-4 py-2.5 text-sm">
              <Plus size={15} /> Add Addon
            </button>
          </div>

          <AnimatePresence>
            {showAddonForm && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="card p-6 mb-6">
                <h3 className="font-semibold text-white mb-4">{editingAddonId ? 'Edit' : 'New'} Addon</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    try {
                      saveAddonMutation.mutate({
                        name: addonForm.name,
                        extraPrice: parseWholeLkr(addonForm.extraPrice, 'Extra price'),
                        isAvailable: addonForm.isAvailable,
                      });
                    } catch (err: any) {
                      toast.error(err.message || 'Invalid price');
                    }
                  }}
                  className="grid sm:grid-cols-3 gap-4"
                >
                  <input className="input-field" placeholder="Addon name" value={addonForm.name} onChange={(e) => setAddonForm((f) => ({ ...f, name: e.target.value }))} required />
                  <input className="input-field" type="number" placeholder="Extra price (LKR)" value={addonForm.extraPrice} onChange={(e) => setAddonForm((f) => ({ ...f, extraPrice: e.target.value }))} required />
                  <label className="flex items-center gap-2 text-sm text-muted">
                    <input type="checkbox" checked={addonForm.isAvailable} onChange={(e) => setAddonForm((f) => ({ ...f, isAvailable: e.target.checked }))} className="accent-brand" />
                    Available
                  </label>
                  <div className="sm:col-span-3 flex gap-3">
                    <button type="submit" className="btn-primary px-6 py-2.5 text-sm">Save</button>
                    <button type="button" onClick={() => setShowAddonForm(false)} className="btn-outline px-6 py-2.5 text-sm">Cancel</button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="card p-5 mb-6">
            <h3 className="font-semibold text-white mb-3">Bulk assign to category</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <select className="input-field" value={bulkCategoryId} onChange={(e) => setBulkCategoryId(e.target.value)}>
                <option value="">Select category</option>
                {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex flex-wrap gap-2">
                {toppings.map((t: any) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setBulkToppingIds((ids) => ids.includes(t.id) ? ids.filter((id) => id !== t.id) : [...ids, t.id])}
                    className={`chip text-xs ${bulkToppingIds.includes(t.id) ? 'chip-active' : ''}`}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              disabled={!bulkCategoryId || bulkToppingIds.length === 0 || bulkAssignMutation.isPending}
              onClick={() => bulkAssignMutation.mutate()}
              className="btn-primary mt-4 px-6 py-2.5 text-sm"
            >
              Assign to all products in category
            </button>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-navy-border">
                  {['Name', 'Price', 'Products', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-muted text-xs font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {toppings.map((t: any) => (
                  <tr key={t.id} className="border-b border-navy-border">
                    <td className="px-4 py-3 text-white">{t.name}</td>
                    <td className="px-4 py-3 text-brand">LKR {t.extraPrice}</td>
                    <td className="px-4 py-3 text-muted">{t._count?.products ?? 0}</td>
                    <td className="px-4 py-3 text-xs">{t.isAvailable ? 'Active' : 'Hidden'}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setAddonForm({ name: t.name, extraPrice: String(t.extraPrice), isAvailable: t.isAvailable });
                            setEditingAddonId(t.id);
                            setShowAddonForm(true);
                          }}
                          className="btn-outline p-1.5"
                        >
                          <Edit2 size={12} />
                        </button>
                        <button onClick={() => deleteAddonMutation.mutate(t.id)} className="p-1.5 text-red-400 border border-red-500/30 rounded-lg">
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
