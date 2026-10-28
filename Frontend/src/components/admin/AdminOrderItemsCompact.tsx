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

function itemSummary(items: OrderItemPreview[]): string {
  if (items.length === 1) {
    const item = items[0];
    return item.quantity > 1 ? `${item.productName} ×${item.quantity}` : item.productName;
  }
  const first = items[0]?.productName ?? '';
  const extra = items.length - 1;
  return extra > 0 ? `${first} +${extra} more` : first;
}

export default function AdminOrderItemsCompact({ items }: { items?: OrderItemPreview[] }) {
  if (!items?.length) {
    return <span className="text-muted text-xs">—</span>;
  }

  const visible = items.slice(0, 3);
  const hiddenCount = items.length - visible.length;
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
  const tooltip = items.map((item) => `${item.productName} ×${item.quantity}`).join('\n');

  return (
    <div className="admin-order-items-compact" title={tooltip}>
      <div className="admin-order-items-compact__thumbs" aria-hidden>
        {visible.map((item, index) => (
          <ProductImage
            key={`${item.productName}-${index}`}
            name={item.productName}
            imageUrl={itemImageUrl(item)}
            contain
            className="admin-order-items-compact__thumb"
          />
        ))}
        {hiddenCount > 0 && (
          <span className="admin-order-items-compact__more">+{hiddenCount}</span>
        )}
      </div>
      <div className="admin-order-items-compact__text min-w-0">
        <p className="admin-order-items-compact__summary">{itemSummary(items)}</p>
        <p className="admin-order-items-compact__count">
          {totalQty} item{totalQty === 1 ? '' : 's'}
        </p>
      </div>
    </div>
  );
}
