'use client';

import { Store, Truck } from 'lucide-react';

import ProductImage from '@/components/ui/ProductImage';
import { formatMoney } from '@/lib/receipt';

export type ModeTopProduct = {
  productName: string;
  quantity: number;
  revenue: number;
  basePrice?: number;
  imageUrl?: string | null;
};

type Props = {
  title: string;
  mode: 'delivery' | 'pickup';
  product?: ModeTopProduct | null;
  periodLabel: string;
  loading?: boolean;
};

function resolvePrice(product: ModeTopProduct) {
  return product.basePrice ?? (product.quantity > 0 ? Math.round(product.revenue / product.quantity) : 0);
}

export default function DashboardModeTopProductCard({
  title,
  mode,
  product,
  periodLabel,
  loading,
}: Props) {
  const Icon = mode === 'delivery' ? Truck : Store;
  const modeLabel = mode === 'delivery' ? 'Delivery Orders' : 'Pickup Orders';
  const modeStyles =
    mode === 'delivery'
      ? {
          badge:
            'border-indigo-200 bg-indigo-50 text-indigo-800 dark:border-indigo-500/25 dark:bg-indigo-500/12 dark:text-indigo-300',
          iconWrap: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300',
        }
      : {
          badge:
            'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/25 dark:bg-amber-500/12 dark:text-amber-300',
          iconWrap: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
        };

  return (
    <div className="card flex h-full flex-col p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-fg">{title}</h2>
          <p className="mt-0.5 text-xs text-muted">{periodLabel}</p>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold ${modeStyles.badge}`}
        >
          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md ${modeStyles.iconWrap}`}>
            <Icon size={15} aria-hidden />
          </span>
          {modeLabel}
        </span>
      </div>

      {loading ? (
        <div className="flex min-h-[180px] flex-1 animate-pulse flex-col items-center justify-center rounded-xl border border-dashed border-navy-border/70 bg-navy-light/20" />
      ) : !product ? (
        <div className="flex min-h-[180px] flex-1 items-center justify-center rounded-xl border border-dashed border-navy-border/70 bg-navy-light/20 px-4 text-center text-sm text-muted">
          No {mode === 'delivery' ? 'delivery' : 'pickup'} sales in this period
        </div>
      ) : (
        <div className="flex min-h-[180px] flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-navy-border/70 bg-navy-light/15 px-4 py-4 text-center">
          <div className="h-24 w-24 overflow-hidden rounded-xl border border-navy-border/60 bg-surface-raised sm:h-28 sm:w-28">
            <ProductImage
              name={product.productName}
              imageUrl={product.imageUrl}
              contain
              className="h-full w-full object-contain p-1"
            />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fg" title={product.productName}>
              {product.productName}
            </p>
            <p className="mt-1 text-sm font-bold tabular-nums text-brand">{formatMoney(resolvePrice(product))}</p>
            <p className="mt-0.5 text-xs text-muted">{product.quantity} sold</p>
          </div>
        </div>
      )}
    </div>
  );
}
