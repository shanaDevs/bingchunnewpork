'use client';

import { FileText } from 'lucide-react';

export type ReportOption = {
  key: string;
  label: string;
};

type Props = {
  options: ReportOption[];
  values: Record<string, boolean>;
  onChange: (key: string) => void;
};

export default function ReportOptionsBar({ options, values, onChange }: Props) {
  return (
    <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex items-center gap-1.5 text-muted">
        <FileText size={15} />
        <span className="text-[11px] font-semibold uppercase tracking-wider">Columns:</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {options.map((opt) => (
          <label key={opt.key} className="flex items-center gap-1.5 text-xs text-fg cursor-pointer select-none hover:text-brand transition-colors">
            <input
              type="checkbox"
              className="rounded border-navy-border text-brand focus:ring-brand bg-input-bg w-3.5 h-3.5"
              checked={values[opt.key] ?? false}
              onChange={() => onChange(opt.key)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  );
}
