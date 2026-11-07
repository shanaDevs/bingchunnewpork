"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/home-redesign/lib/cn";
import { focusRing } from "../accountUi";

/** White cards on this page: a soft lift, smaller than the hero. */
export const panelFrame = "rounded-[1.5rem] bg-white ring-1 ring-brand-100";
export const panel = cn(panelFrame, "p-5 sm:p-6");
export const panelHeading = "font-display-condensed text-2xl leading-none text-brand-950 uppercase sm:text-[1.75rem]";

export const percentOf = (value: number, goal: number) => (goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 100);

/**
 * Stops spaced evenly across, with a line behind them from the first to the last, filled to `percent` (of the way
 * from the first stop to the last).
 */
export function Track({ count, percent, className, children }: { count: number; percent: number; className?: string; children: ReactNode }) {
  // Each stop is 1/count wide; the line runs from the first stop's centre to the last's.
  const inset = `${50 / Math.max(1, count)}%`;
  return (
    <div className={cn("relative", className)}>
      <div aria-hidden="true" className="absolute top-6 h-1.5 -translate-y-1/2 rounded-full bg-slate-100" style={{ left: inset, right: inset }}>
        <div className="h-full rounded-full bg-linear-to-r from-brand-400 to-brand-600 transition-[width] duration-700 ease-out starting:w-0" style={{ width: `${percent}%` }} />
      </div>
      <ol data-stagger className="relative grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, count)}, minmax(0, 1fr))` }}>
        {children}
      </ol>
    </div>
  );
}

/** One stop on a Track: its round icon (with an optional "You" badge), title, a chip and a note. With `onClick`, the stop is a button. */
export function TrackStop({
  icon: Icon,
  iconClass,
  badge,
  title,
  titleClassName,
  chip,
  note,
  onClick,
  label,
}: {
  icon: LucideIcon;
  iconClass: string;
  badge?: string;
  title: string;
  titleClassName?: string;
  chip: ReactNode;
  note?: string;
  onClick?: () => void;
  /** The button's accessible name, when the stop is one. */
  label?: string;
}) {
  const body = (
    <>
      <span className={cn("relative grid size-12 place-items-center rounded-full transition-[background-color,scale]", iconClass, onClick && "group-hover:scale-105")}>
        <Icon className="size-5" aria-hidden="true" />
        {badge && (
          <span className="absolute -top-2.5 -right-3 rounded-full bg-brand-950 px-1.5 py-0.5 text-[0.625rem] font-bold tracking-wide text-snow uppercase shadow">
            {badge}
          </span>
        )}
      </span>
      <span className={cn("mt-2 text-sm font-bold text-brand-950", onClick && "group-hover:underline", titleClassName)}>{title}</span>
      <span className="mt-1">{chip}</span>
      {note && <span className="mt-1.5 text-xs leading-snug text-slate-600">{note}</span>}
    </>
  );

  return (
    <li className="flex flex-col items-center px-1 text-center">
      {onClick ? (
        <button type="button" onClick={onClick} aria-label={label} className={cn("group flex flex-col items-center rounded-2xl px-1 pb-1", focusRing)}>
          {body}
        </button>
      ) : (
        body
      )}
    </li>
  );
}
