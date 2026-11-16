'use client';

type LegendItem = {
  key: string;
  label: string;
  color: string;
  percent: number;
  count?: number;
};

type Props = {
  items: LegendItem[];
  /** Vertical stack — better for narrow containers */
  stacked?: boolean;
  /** Legend sits beside the donut; includes count + percent like the analytics mock. */
  side?: boolean;
};

export default function DonutChartLegend({ items, stacked = false, side = false }: Props) {
  if (items.length === 0) return null;

  const layoutClass = side
    ? 'flex min-w-0 flex-1 flex-col justify-center gap-2.5'
    : stacked
      ? 'mt-4 flex w-full max-w-full flex-col gap-2'
      : 'mt-4 flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 px-1';

  return (
    <div className={layoutClass}>
      {items.map((item) => (
        <div key={item.key} className="flex min-w-0 max-w-full items-center gap-2 text-xs">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate text-fg">
            <span className="font-medium">{item.label}</span>
          </span>
          {item.count != null && (
            <span className="shrink-0 tabular-nums text-muted">{item.count}</span>
          )}
          <span className="shrink-0 tabular-nums text-muted">{item.percent}%</span>
        </div>
      ))}
    </div>
  );
}
