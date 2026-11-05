'use client';

import type { StockLevelTab } from '@/lib/stockApi';

interface StockLevelTabsProps {
  activeTab: StockLevelTab;
  counts: { newProducts: number; inStock: number; lowStock: number; outOfStock: number; inactive: number };
  onChange: (tab: StockLevelTab) => void;
}

const TABS: {
  id: StockLevelTab;
  label: string;
  countKey: keyof StockLevelTabsProps['counts'];
  modifier: 'new-products' | 'low-stock' | 'out-of-stock' | 'in-stock' | 'inactive';
}[] = [
  { id: 'new_products', label: 'New Products', countKey: 'newProducts', modifier: 'new-products' },
  { id: 'in_stock', label: 'In Stock', countKey: 'inStock', modifier: 'in-stock' },
  { id: 'low_stock', label: 'Low Stock', countKey: 'lowStock', modifier: 'low-stock' },
  { id: 'out_of_stock', label: 'Out of Stock', countKey: 'outOfStock', modifier: 'out-of-stock' },
  { id: 'inactive', label: 'Inactive', countKey: 'inactive', modifier: 'inactive' },
];

function countBadgeClass(id: StockLevelTab, count: number, isActive: boolean): string {
  const base = 'admin-orders-toolbar__status-count';
  if (id === 'new_products' && count > 0) {
    return `${base} admin-stock-level-tabs__status-count--new${isActive ? ' admin-stock-level-tabs__status-count--new-active' : ''}`;
  }
  if (id === 'low_stock' && count > 0) {
    return `${base} admin-orders-toolbar__status-count--blink`;
  }
  if (id === 'out_of_stock' && count > 0) {
    return `${base} admin-stock-level-tabs__status-count--out`;
  }
  if (id === 'out_of_stock') {
    return `${base} admin-stock-level-tabs__status-count--muted`;
  }
  if (id === 'in_stock') {
    return `${base} admin-stock-level-tabs__status-count--in${isActive ? ' admin-stock-level-tabs__status-count--in-active' : ''}`;
  }
  if (id === 'inactive' && count > 0) {
    return `${base} admin-stock-level-tabs__status-count--inactive${isActive ? ' admin-stock-level-tabs__status-count--inactive-active' : ''}`;
  }
  if (id === 'inactive') {
    return `${base} admin-stock-level-tabs__status-count--muted`;
  }
  return `${base} admin-stock-level-tabs__status-count--muted`;
}

export default function StockLevelTabs({ activeTab, counts, onChange }: StockLevelTabsProps) {
  return (
    <div className="admin-stock-level-tabs">
      <div className="admin-stock-level-tabs__list" role="tablist" aria-label="Stock level">
        {TABS.map(({ id, label, countKey, modifier }) => {
          const isActive = activeTab === id;
          const count = counts[countKey];

          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-active={isActive || undefined}
              onClick={() => onChange(id)}
              className={`admin-stock-level-tabs__trigger admin-stock-level-tabs__trigger--${modifier}`}
            >
              <span>{label}</span>
              <span className={countBadgeClass(id, count, isActive)}>{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
