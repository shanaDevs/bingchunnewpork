import type { ReactNode } from "react";
import { cn } from "@/components/home-redesign/lib/cn";

/** White cards on this page, flat (no shadow). */
export const panel = "rounded-[1.5rem] bg-white p-5 ring-1 ring-brand-100 sm:p-6";
export const panelHeading = "font-display-condensed text-2xl leading-none text-brand-950 uppercase sm:text-[1.75rem]";

/** A section's heading and the line under it, with anything (a link, a count) on the right. */
export function SectionHeading({ id, title, subtitle, aside, className }: { id: string; title: string; subtitle?: string; aside?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div>
        <h3 id={id} className={panelHeading}>
          {title}
        </h3>
        {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
      </div>
      {aside}
    </div>
  );
}
