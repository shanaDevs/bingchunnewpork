'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import BrandedChartTooltipShell from '@/components/ui/BrandedChartTooltipShell';
import {
  formatHourLabel,
  isOperatingHour,
  OPERATING_HOURS,
} from '@/lib/storeHours';
import { formatMoney } from '@/lib/receipt';

export type HeatmapCell = {
  day: number;
  hour: number;
  orders: number;
  revenue: number;
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Low → high: green → yellow → orange → red */
const HEATMAP_COLORS = ['#22c55e', '#facc15', '#f97316', '#ef4444'] as const;
const EMPTY_CELL_COLOR = 'rgba(148, 163, 184, 0.18)';

function heatmapColor(intensity: number): string {
  if (intensity <= 0.25) return HEATMAP_COLORS[0];
  if (intensity <= 0.5) return HEATMAP_COLORS[1];
  if (intensity <= 0.75) return HEATMAP_COLORS[2];
  return HEATMAP_COLORS[3];
}

type HoveredCell = {
  day: number;
  hour: number;
  orders: number;
  revenue: number;
  x: number;
  y: number;
};

type Props = {
  data: HeatmapCell[];
  loading?: boolean;
};

export default function HourlySalesHeatmap({ data, loading }: Props) {
  const [hoveredCell, setHoveredCell] = useState<HoveredCell | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const { grid, maxOrders } = useMemo(() => {
    const matrix = Array.from({ length: 7 }, () =>
      Array.from({ length: OPERATING_HOURS.length }, () => ({ orders: 0, revenue: 0 })),
    );

    for (const cell of data) {
      if (!isOperatingHour(cell.hour)) continue;
      if (cell.day >= 0 && cell.day < 7) {
        const hourIndex = OPERATING_HOURS.indexOf(cell.hour);
        if (hourIndex >= 0) {
          matrix[cell.day][hourIndex] = {
            orders: cell.orders,
            revenue: cell.revenue,
          };
        }
      }
    }

    const operatingCells = data.filter((cell) => isOperatingHour(cell.hour));
    const peak = Math.max(1, ...operatingCells.map((cell) => cell.orders));
    return { grid: matrix, maxOrders: peak };
  }, [data]);

  if (loading) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-muted">
        Loading heatmap…
      </div>
    );
  }

  if (data.filter((cell) => isOperatingHour(cell.hour)).every((cell) => cell.orders === 0)) {
    return (
      <div className="flex h-[180px] items-center justify-center text-sm text-muted">
        No hourly activity during store hours
      </div>
    );
  }

  const hourCols = `1.75rem repeat(${OPERATING_HOURS.length}, minmax(0, 1fr))`;

  return (
    <div className="w-full min-w-0">
      <div className="w-full min-w-0">
        <div className="mb-2 grid gap-0.5" style={{ gridTemplateColumns: hourCols }}>
          <div />
          {OPERATING_HOURS.map((hour) => (
            <div key={hour} className="text-center text-[9px] font-medium text-muted">
              {[10, 13, 16, 19, 22].includes(hour)
                ? formatHourLabel(hour).replace(' ', '')
                : ''}
            </div>
          ))}
        </div>

        {grid.map((row, day) => (
          <div
            key={DAY_LABELS[day]}
            className="mb-1 grid items-center gap-0.5"
            style={{ gridTemplateColumns: hourCols }}
          >
            <span className="text-[10px] font-medium text-muted">{DAY_LABELS[day]}</span>
            {row.map((cell, index) => {
              const hour = OPERATING_HOURS[index];
              const intensity = cell.orders / maxOrders;
              return (
                <div
                  key={`${day}-${hour}`}
                  className="aspect-square rounded-md border border-navy-border/20"
                  style={{
                    backgroundColor:
                      cell.orders > 0
                        ? heatmapColor(intensity)
                        : EMPTY_CELL_COLOR,
                  }}
                  onMouseEnter={(event) =>
                    setHoveredCell({
                      day,
                      hour,
                      orders: cell.orders,
                      revenue: cell.revenue,
                      x: event.clientX,
                      y: event.clientY,
                    })
                  }
                  onMouseMove={(event) =>
                    setHoveredCell((current) =>
                      current
                        ? {
                            ...current,
                            x: event.clientX,
                            y: event.clientY,
                          }
                        : null,
                    )
                  }
                  onMouseLeave={() => setHoveredCell(null)}
                />
              );
            })}
          </div>
        ))}

        <div className="mt-3 flex items-center justify-end gap-2 text-[10px] text-muted">
          <span>Low</span>
          <div className="flex gap-1">
            {HEATMAP_COLORS.map((color) => (
              <div
                key={color}
                className="h-4 w-4 rounded-md border border-navy-border/20"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
          <span>High</span>
        </div>
      </div>

      {portalReady &&
        hoveredCell &&
        createPortal(
          <div
            className="pointer-events-none fixed z-50"
            style={{ left: hoveredCell.x + 14, top: hoveredCell.y + 14 }}
          >
            <BrandedChartTooltipShell className="min-w-36">
              <div className="font-medium text-foreground">
                {DAY_LABELS[hoveredCell.day]} {formatHourLabel(hoveredCell.hour)}
              </div>
              <div className="font-mono font-medium tabular-nums text-foreground">
                {hoveredCell.orders} order{hoveredCell.orders !== 1 ? 's' : ''}
              </div>
              <div className="font-mono tabular-nums text-muted-foreground">
                {formatMoney(hoveredCell.revenue)} revenue
              </div>
            </BrandedChartTooltipShell>
          </div>,
          document.body,
        )}
    </div>
  );
}
