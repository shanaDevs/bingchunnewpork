'use client';

type LegendItem = {
  key: string;
  label: string;
  color: string;
  percent: number;
};

type Props = {
  items: LegendItem[];
  /** Vertical stack — better for narrow containers */
  stacked?: boolean;
};

export default function DonutChartLegend({ items, stacked = false }: Props) {
  if (items.length === 0) return null;

  return (
    <div
      className={
        stacked
          ? 'mt-4 flex w-full max-w-full flex-col gap-2'
          : 'mt-4 flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 px-1'
      }
    >
      {items.map((item) => (
        <div key={item.key} className="flex min-w-0 max-w-full items-center gap-2 text-xs">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          <span className="min-w-0 truncate text-fg">
            <span className="font-medium">{item.label}</span>
            <span className="text-muted"> · {item.percent}%</span>
          </span>
        </div>
      ))}
    </div>
  );
}
