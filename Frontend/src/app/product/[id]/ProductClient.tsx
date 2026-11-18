'use client';

import ProductDetailView from '@/components/menu-redesign/product/ProductDetailView';

/** Legacy `/product/[id]` route — same detail UI as `/menu/[id]`. */
export default function ProductClient() {
  return <ProductDetailView />;
}
