'use client';

import ProductImage from '@/components/ui/ProductImage';

type OrderItemPreview = {
  productName: string;
  quantity: number;
  imageUrl?: string | null;
  product?: { imageUrl?: string | null };
};

function itemImageUrl(item: OrderItemPreview): string | null | undefined {
  return item.imageUrl ?? item.product?.imageUrl;
}

export default function AdminOrderItemsCell({ items }: { items?: OrderItemPreview[] }) {
  if (!items?.length) {
    return <span className="text-muted text-xs">—</span>;
  }

  return (
    <ul className="admin-order-items-cell">
      {items.map((item, index) => (
        <li key={`${item.productName}-${index}`} className="admin-order-items-cell__item">
          <ProductImage
            name={item.productName}
            imageUrl={itemImageUrl(item)}
            contain
            className="admin-order-items-cell__thumb"
          />
          <div className="admin-order-items-cell__details">
            <span className="admin-order-items-cell__name">{item.productName}</span>
            <span className="admin-order-items-cell__qty">×{item.quantity}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
