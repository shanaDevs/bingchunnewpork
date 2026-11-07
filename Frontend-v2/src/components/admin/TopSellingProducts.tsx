'use client';

import { TrendingUp, Truck } from 'lucide-react';

import ProductImage from '@/components/ui/ProductImage';
import { formatMoney } from '@/lib/receipt';

export type TopProduct = {
  productName: string;
  quantity: number;
  revenue: number;
  imageUrl?: string | null;
};

type ProductSlot = {
  product: TopProduct | null;
  rank?: number;
  rankLabel?: string;
};

type Props = {
  products: TopProduct[];
  topDeliveryProduct?: TopProduct | null;
  periodLabel: string;
};

function RankBadge({ rank, rankLabel }: { rank?: number; rankLabel?: string }) {
  if (rankLabel) {
    return (
      <span className="inline-flex max-w-full items-center gap-0.5 rounded-full border border-indigo-500/35 bg-indigo-500/12 px-1.5 py-0.5 text-[7px] font-bold uppercase leading-none tracking-wide text-indigo-700 dark:text-indigo-300">
        <Truck size={9} className="shrink-0" aria-hidden />
        <span className="truncate">{rankLabel}</span>
      </span>
    );
  }

  return (
    <span className="text-[10px] font-semibold tabular-nums text-muted">
      #{String(rank).padStart(2, '0')}
    </span>
  );
}

function ProductCell({
  product,
  rank,
  rankLabel,
}: {
  product: TopProduct | null;
  rank?: number;
  rankLabel?: string;
}) {
  if (!product) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-dashed border-navy-border/70 bg-surface-raised/50">
        <div className="flex min-h-0 flex-1 items-center justify-center bg-navy-light/15 p-2">
          <p className="px-2 text-center text-[10px] text-muted">No delivery sales</p>
        </div>
        <div className="shrink-0 border-t border-navy-border/50 px-2 py-2 text-center">
          <RankBadge rankLabel={rankLabel ?? 'TOP DELIVERY'} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-navy-border/70 bg-surface-raised">
      <div className="flex min-h-0 flex-1 items-center justify-center bg-navy-light/25 p-2">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border border-navy-border/60 bg-surface-raised sm:h-28 sm:w-28">
          <ProductImage
            name={product.productName}
            imageUrl={product.imageUrl}
            contain
            className="h-full w-full object-contain p-0.5"
          />
        </div>
      </div>
      <div className="shrink-0 border-t border-navy-border/50 px-2 py-2 text-center">
        <div className="mb-1 flex items-center justify-between gap-1">
          <RankBadge rank={rank} rankLabel={rankLabel} />
          <span className="text-[9px] uppercase tracking-wider text-muted">
            {product.quantity} sold
          </span>
        </div>
        <p className="truncate text-[12px] font-semibold text-fg">
          {product.productName}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-muted">
          {formatMoney(product.revenue)} revenue
        </p>
      </div>
    </div>
  );
}

function buildProductSlots(
  products: TopProduct[],
  topDeliveryProduct?: TopProduct | null,
): ProductSlot[] {
  const topThree = products.slice(0, 3);
  return [
    ...topThree.map((product, index) => ({
      product,
      rank: index + 1,
    })),
    {
      product: topDeliveryProduct ?? null,
      rankLabel: 'TOP DELIVERY',
    },
  ];
}

export default function TopSellingProducts({
  products,
  topDeliveryProduct,
  periodLabel,
}: Props) {
  const slots = buildProductSlots(products, topDeliveryProduct);
  const hasData = slots.some((slot) => slot.product);
  const totalSold = slots.reduce((sum, slot) => sum + (slot.product?.quantity ?? 0), 0);

  return (
    <div className="card flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-start justify-between gap-3 border-b border-navy-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-fg">Top Selling Products</h2>
          <p className="mt-0.5 text-xs text-muted">{periodLabel} · ranked by quantity</p>
        </div>
        {hasData && (
          <div className="flex items-center gap-1.5 rounded-md border border-navy-border/80 bg-navy-light/40 px-2.5 py-1.5">
            <TrendingUp size={13} className="text-brand" />
            <span className="text-[11px] font-medium tabular-nums text-fg">{totalSold}</span>
            <span className="text-[10px] text-muted">units</span>
          </div>
        )}
      </div>

      {!hasData ? (
        <p className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted">
          No product sales in this period
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <div className="grid min-h-0 flex-1 grid-cols-4 gap-2 sm:grid-rows-1">
            {slots.map((slot, index) => (
              <ProductCell
                key={`${slot.product?.productName ?? 'empty'}-${index}`}
                product={slot.product}
                rank={slot.rank}
                rankLabel={slot.rankLabel}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
