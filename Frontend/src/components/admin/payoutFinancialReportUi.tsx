'use client';

import { type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type RowTone = 'default' | 'red';
type Indent = 0 | 1 | 2;

function toneClass(tone: RowTone): string {
  if (tone === 'red') return 'text-red-500';
  return 'text-[#1e293b] dark:text-slate-100';
}

export function ReportRow({
  label,
  value,
  bold = false,
  indent = 0,
  valueTone = 'default',
  hint,
  labelInfo,
}: {
  label: string;
  value: string;
  bold?: boolean;
  indent?: Indent;
  valueTone?: RowTone;
  hint?: string;
  /** Info icon or other control shown beside the row label (e.g. Jason contribution explainer). */
  labelInfo?: ReactNode;
}) {
  const indentClass = indent === 2 ? 'pl-8' : indent === 1 ? 'pl-4' : '';
  return (
    <div
      className={`flex items-start justify-between gap-3 text-[13px] leading-relaxed ${bold ? 'font-bold' : 'font-medium'} ${indentClass}`}
    >
      <div className="min-w-0">
        <span className="inline-flex max-w-full flex-wrap items-center gap-1 text-[#475569] dark:text-slate-300">
          <span>{label}</span>
          {labelInfo}
        </span>
        {hint ? (
          <p className="mt-0.5 text-[10px] font-medium leading-relaxed text-[#94a3b8] dark:text-slate-500">
            {hint}
          </p>
        ) : null}
      </div>
      <span className={`shrink-0 tabular-nums ${toneClass(valueTone)}`}>{value}</span>
    </div>
  );
}

export function ReportGroupHeading({ children }: { children: ReactNode }) {
  return (
    <p className="pl-4 pt-1 text-[13px] font-medium text-[#475569] dark:text-slate-300">
      {children}
    </p>
  );
}

export function ReportSubtotalRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="border-t border-[#e2e8f0] pt-3 dark:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] font-bold text-[#1e293b] dark:text-slate-100">{label}</p>
        <p className="shrink-0 text-[13px] font-bold tabular-nums text-[#1e293b] dark:text-slate-100">
          {value}
        </p>
      </div>
    </div>
  );
}

const infoTriggerClassName =
  'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[#2563eb] transition-colors hover:bg-[#2563eb]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]/40';

export function SectionInfoPopover({
  ariaLabel,
  children,
}: {
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        aria-label={ariaLabel}
        className={infoTriggerClassName}
      >
        <Info className="size-4" aria-hidden />
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        sideOffset={12}
        positionerClassName="z-[10050]"
        className="z-[10050] w-[min(32rem,calc(100vw-3rem))] max-h-[min(28rem,75vh)] space-y-2.5 overflow-y-auto p-4"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function InfoPopoverHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <p className="text-[13px] font-bold text-[#1e293b] dark:text-slate-100">{title}</p>
      {description ? (
        <p className="mt-1 text-[11px] font-medium leading-relaxed text-[#64748b] dark:text-slate-400">
          {description}
        </p>
      ) : null}
    </div>
  );
}

export function InfoFormulaLine({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md bg-[#f8fafc] px-2.5 py-2 font-mono text-[11px] leading-relaxed text-[#334155] dark:bg-slate-800/80 dark:text-slate-200">
      {children}
    </p>
  );
}

export function ReportSection({
  title,
  amount,
  info,
  children,
}: {
  title: string;
  amount?: string;
  info?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="border-b border-[#e2e8f0] px-5 py-4 last:border-b-0 dark:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {info}
          <p className="text-[14px] font-bold text-[#1e293b] dark:text-slate-100">{title}</p>
        </div>
        {amount != null && (
          <p className="shrink-0 text-[14px] font-bold tabular-nums text-[#1e293b] dark:text-slate-100">
            {amount}
          </p>
        )}
      </div>
      {children ? <div className="mt-3 space-y-2.5">{children}</div> : null}
    </div>
  );
}

export function ReportTotalRow({
  label,
  value,
  info,
}: {
  label: string;
  value: string;
  info?: ReactNode;
}) {
  return (
    <div className="border-t-2 border-[#2563eb]/30 bg-[#eff6ff]/40 px-5 py-5 dark:border-blue-500/30 dark:bg-blue-950/20">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {info}
          <p className="text-[16px] font-bold text-[#2563eb]">{label}</p>
        </div>
        <p className="text-[22px] font-bold tabular-nums text-[#2563eb]">{value}</p>
      </div>
    </div>
  );
}
