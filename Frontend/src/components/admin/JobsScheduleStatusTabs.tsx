'use client';

import { AlertTriangle, CheckCircle2, Truck } from 'lucide-react';

export type JobsScheduleSubTab = 'active' | 'completed' | 'incomplete';

type Props = {
  value: JobsScheduleSubTab;
  onChange: (tab: JobsScheduleSubTab) => void;
  activeCount: number;
  completedCount: number;
  incompleteLabel: string;
};

function tabButtonClass(selected: boolean): string {
  return [
    'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
    selected
      ? 'bg-card text-fg shadow-sm ring-1 ring-navy-border'
      : 'text-muted hover:bg-card/60 hover:text-fg',
  ].join(' ');
}

export default function JobsScheduleStatusTabs({
  value,
  onChange,
  activeCount,
  completedCount,
  incompleteLabel,
}: Props) {
  return (
    <div className="mb-4 rounded-xl border border-navy-border bg-navy-light/15 px-3 py-3 sm:px-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">Schedule list</p>
      <div
        className="inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-navy-border/60 bg-navy-light/35 p-1"
        role="tablist"
        aria-label="Schedule list"
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === 'active'}
          onClick={() => onChange('active')}
          className={tabButtonClass(value === 'active')}
        >
          <Truck size={14} className={value === 'active' ? 'text-brand' : undefined} />
          Active ({activeCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === 'completed'}
          onClick={() => onChange('completed')}
          className={tabButtonClass(value === 'completed')}
        >
          <CheckCircle2 size={14} className={value === 'completed' ? 'text-green-500' : undefined} />
          Complete ({completedCount})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === 'incomplete'}
          onClick={() => onChange('incomplete')}
          className={tabButtonClass(value === 'incomplete')}
        >
          <AlertTriangle size={14} className={value === 'incomplete' ? 'text-amber-500' : undefined} />
          Incomplete ({incompleteLabel})
        </button>
      </div>
    </div>
  );
}
