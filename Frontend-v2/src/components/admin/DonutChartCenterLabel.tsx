'use client';

import { Label } from 'recharts';

type Props = {
  value: string | number;
  label: string;
};

export default function DonutChartCenterLabel({ value, label }: Props) {
  return (
    <Label
      position="center"
      content={({ viewBox }) => {
        if (!viewBox || !('cx' in viewBox) || !('cy' in viewBox)) return null;
        const cx = viewBox.cx ?? 0;
        const cy = viewBox.cy ?? 0;
        return (
          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
            <tspan
              x={cx}
              y={cy - 6}
              style={{ fill: 'var(--color-text)', fontSize: 24, fontWeight: 700 }}
            >
              {value}
            </tspan>
            <tspan
              x={cx}
              y={cy + 16}
              style={{ fill: 'var(--color-text-muted)', fontSize: 12, fontWeight: 500 }}
            >
              {label}
            </tspan>
          </text>
        );
      }}
    />
  );
}
