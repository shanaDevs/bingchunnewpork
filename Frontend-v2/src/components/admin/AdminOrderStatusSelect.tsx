'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { allowedStatusOptions } from '@/lib/orderStatus';
import { useThemeStore, type Theme } from '@/store/themeStore';
import type { OrderMode, OrderStatus } from '@/types';

const STATUS_FILL: Record<Theme, Record<OrderStatus, string>> = {
  dark: {
    RECEIVED: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    PREPARING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    READY: 'bg-green-500/15 text-green-400 border-green-500/30',
    OUT_FOR_DELIVERY: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    DELIVERED: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
    CANCELLED: 'bg-red-500/15 text-red-400 border-red-500/30',
  },
  light: {
    RECEIVED: 'bg-blue-500/10 text-blue-700 border-blue-300/55',
    PREPARING: 'bg-amber-500/10 text-amber-700 border-amber-300/55',
    READY: 'bg-green-500/10 text-green-700 border-green-300/55',
    OUT_FOR_DELIVERY: 'bg-orange-500/10 text-orange-700 border-orange-300/55',
    DELIVERED: 'bg-teal-500/10 text-teal-700 border-teal-300/55',
    CANCELLED: 'bg-red-500/10 text-red-700 border-red-300/55',
  },
};

function statusLabel(status: OrderStatus, orderMode: OrderMode): string {
  if (status === 'DELIVERED' && orderMode === 'TAKEAWAY') return 'Picked up';
  const labels: Record<OrderStatus, string> = {
    RECEIVED: 'Received',
    PREPARING: 'Preparing',
    READY: 'Ready',
    OUT_FOR_DELIVERY: 'Out for delivery',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
  };
  return labels[status];
}

type Props = {
  orderNumber: string;
  status: OrderStatus;
  orderMode: OrderMode;
  busy?: boolean;
  onChange: (status: OrderStatus) => void;
};

export default function AdminOrderStatusSelect({
  orderNumber,
  status,
  orderMode,
  busy = false,
  onChange,
}: Props) {
  const theme = useThemeStore((s) => s.theme);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const options = allowedStatusOptions(status, orderMode);
  const locked = options.length <= 1;

  useEffect(() => {
    if (!open || !triggerRef.current) return;

    const updatePosition = () => {
      const rect = triggerRef.current!.getBoundingClientRect();
      setMenuStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);

    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onOutside);

    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [open]);

  const menu =
    open &&
    !locked &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={menuRef}
        role="listbox"
        style={menuStyle}
        className="rounded-xl border border-navy-border bg-navy-card shadow-2xl overflow-hidden"
      >
        {options.map((s) => {
          const isSelected = s === status;
          return (
            <button
              key={s}
              type="button"
              role="option"
              aria-selected={isSelected}
              disabled={busy}
              onClick={() => {
                if (s === status) {
                  setOpen(false);
                  return;
                }
                setOpen(false);
                onChange(s);
              }}
              className={`w-full text-left px-3 py-2.5 text-xs font-semibold border-b border-navy-border/50 last:border-0 transition-opacity cursor-pointer hover:opacity-90 disabled:opacity-60 ${
                STATUS_FILL[theme][s]
              } ${isSelected ? 'ring-2 ring-inset ring-brand/25' : ''}`}
            >
              {statusLabel(s, orderMode)}
            </button>
          );
        })}
      </div>,
      document.body,
    );

  return (
    <div className="w-full min-w-[148px]">
      <button
        ref={triggerRef}
        type="button"
        disabled={busy || locked}
        onClick={() => !locked && setOpen((v) => !v)}
        className={`w-full text-xs font-semibold border rounded-xl px-3 py-2 flex items-center justify-between gap-2 transition-colors disabled:opacity-60 touch-manipulation ${STATUS_FILL[theme][status]}`}
        aria-label={`Update status for order ${orderNumber}`}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{statusLabel(status, orderMode)}</span>
        {!locked && (
          <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>
      {menu}
    </div>
  );
}
