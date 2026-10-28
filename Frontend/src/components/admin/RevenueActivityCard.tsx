'use client';

type RevenueSlice = { label: string; value: number; color: string };

function fmtChannelAmount(n: number) {
  return n.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Props = {
  slices: RevenueSlice[];
  periodLabel: string;
  loading?: boolean;
};

export default function RevenueActivityCard({ slices, periodLabel, loading }: Props) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const active = slices.filter((s) => s.value > 0);

  return (
    <div className="card flex h-full flex-col overflow-hidden">
      <div className="border-b border-navy-border px-5 py-4">
        <h2 className="text-sm font-semibold text-fg">Revenue Activity</h2>
        <p className="mt-0.5 text-xs text-muted">{periodLabel} · paid orders by channel</p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-5 py-5 sm:flex-row sm:items-center sm:gap-6">
        {loading ? (
          <div className="flex h-[220px] w-full items-center justify-center text-sm text-muted">
            Loading…
          </div>
        ) : total <= 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <div className="mb-3 h-[220px] w-[220px] rounded-full border-2 border-dashed border-navy-border" />
            <p className="text-xs text-muted">No paid revenue in this period</p>
          </div>
        ) : (
          <>
            <div className="relative mx-auto aspect-square w-full max-w-[220px] shrink-0">
              {(() => {
                let cursor = 0;
                const gradientStops = active
                  .map((slice) => {
                    const pct = (slice.value / total) * 100;
                    const start = cursor;
                    cursor += pct;
                    return `${slice.color} ${start}% ${cursor}%`;
                  })
                  .join(', ');

                return (
                  <>
                    <div
                      className="h-[220px] w-[220px] rounded-full"
                      style={{ background: `conic-gradient(${gradientStops})` }}
                      role="img"
                      aria-label="Revenue breakdown chart"
                    />
                    <div className="absolute inset-0 m-auto flex h-[7.25rem] w-[7.25rem] flex-col items-center justify-center rounded-full border border-navy-border bg-navy-card">
                      <span className="text-[9px] font-medium uppercase tracking-wide text-muted">
                        Total
                      </span>
                      <span className="text-lg font-bold leading-tight tabular-nums text-fg">
                        {total >= 1000000
                          ? `${(total / 1000000).toFixed(1)}M`
                          : total >= 1000
                            ? `${(total / 1000).toFixed(total >= 10000 ? 0 : 1)}k`
                            : total.toLocaleString('en-LK')}
                      </span>
                    </div>
                  </>
                );
              })()}
            </div>

            <ul className="w-full max-w-[220px] space-y-3">
              {slices.map((slice) => {
                const pct = total > 0 ? Math.round((slice.value / total) * 100) : 0;
                return (
                  <li key={slice.label}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: slice.color }}
                        />
                        <span className="truncate text-muted">{slice.label}</span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums text-fg">{pct}%</span>
                    </div>
                    <p className="pl-[18px] text-[11px] font-medium text-fg">{fmtChannelAmount(slice.value)}</p>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
