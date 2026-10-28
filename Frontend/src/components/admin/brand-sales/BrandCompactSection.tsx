'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
  id?: string;
};

export default function BrandCompactSection({
  title,
  subtitle,
  action,
  icon: Icon,
  children,
  className = '',
  id,
}: Props) {
  return (
    <div id={id} className={`card flex h-full flex-col overflow-hidden ${className}`.trim()}>
      <div className="flex items-start justify-between gap-3 border-b border-[#e2e8f0] px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#307ef2]/10 text-[#307ef2]">
              <Icon size={16} strokeWidth={2.25} aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0 pt-0.5">
            <h2 className="text-[13px] font-semibold text-fg">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[11px] text-muted">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0 pt-0.5">{action}</div>}
      </div>
      <div className="min-h-0 flex-1 p-4">{children}</div>
    </div>
  );
}
