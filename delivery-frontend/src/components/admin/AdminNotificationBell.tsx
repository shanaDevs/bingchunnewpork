'use client';
import { getApiBaseUrl } from '@/lib/apiBase';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import type { AdminSession } from '@/lib/adminAuth';
import { formatDateTime } from '@/lib/datetime';
import {
  useAdminNotificationContext,
  type AdminNotificationPayload,
} from '@/contexts/AdminNotificationProvider';
import { mainAdminPage, openMainAdminPage } from '@/lib/mainAdminUrl';

interface AdminNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  orderId?: string | null;
  productId?: string | null;
  orderNumber?: string;
  read: boolean;
  createdAt: string;
}

function adminFetch(endpoint: string, options?: RequestInit) {
    return fetch(`${getApiBaseUrl()}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
  }).then(async (r) => {
    const data = await r.json();
    if (!r.ok) throw new Error(data.message || 'Request failed');
    return data;
  });
}

function toBellNotification(payload: AdminNotificationPayload): AdminNotification | null {
  if (!payload.id || !payload.createdAt) return null;
  return {
    id: payload.id,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    orderId: payload.orderId,
    productId: payload.productId,
    orderNumber: payload.orderNumber,
    read: payload.read ?? false,
    createdAt: payload.createdAt,
  };
}

export default function AdminNotificationBell({ adminUser }: { adminUser: AdminSession | null }) {
  const { registerBell } = useAdminNotificationContext();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const load = useCallback(async () => {
    if (!adminUser) return;
    try {
      const res = await adminFetch('/admin/notifications?limit=20');
      setNotifications(res.data?.notifications || []);
      setUnreadCount(res.data?.unreadCount || 0);
    } catch {
      /* ignore */
    }
  }, [adminUser]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    return registerBell({
      onNotification: (payload) => {
        const next = toBellNotification(payload);
        if (next) {
          setNotifications((prev) => [next, ...prev].slice(0, 30));
          setUnreadCount((c) => c + 1);
        }
        // Prominent overlays for NEW_ORDER / NEW_PRODUCT are handled by AdminNotificationProvider.
        if (payload.type !== 'NEW_ORDER' && payload.type !== 'NEW_PRODUCT') {
          toast.success(payload.title, { duration: 5000 });
        }
      },
      onReload: () => {
        void load();
      },
    });
  }, [load, registerBell]);

  async function markRead(id: string) {
    await adminFetch(`/admin/notifications/${id}/read`, { method: 'PATCH' });
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  }

  async function markAllRead() {
    await adminFetch('/admin/notifications/read-all', { method: 'POST' });
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  function openNotification(n: AdminNotification) {
    if (!n.read) markRead(n.id);
    setOpen(false);

    if (n.type === 'NEW_PRODUCT' && n.productId) {
      openMainAdminPage(`/admin/stock?highlight=${encodeURIComponent(n.productId)}`);
      return;
    }

    if (n.orderId || n.orderNumber) {
      const params = new URLSearchParams();
      if (n.orderNumber) params.set('id', n.orderNumber);
      else if (n.orderId) params.set('id', n.orderId);
      params.set('open', '1');
      openMainAdminPage(`/admin/orders?${params.toString()}`);
    }
  }

  if (!adminUser) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative p-2.5 rounded-xl border border-navy-border text-muted hover:text-fg hover:border-brand transition-colors"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-brand text-white text-[10px] font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="admin-notifications-dropdown absolute right-0 top-full mt-2 z-50 w-[min(100vw-2rem,320px)] card p-0 overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-navy-border">
              <p className="text-sm font-semibold text-fg">Notifications</p>
              {unreadCount > 0 && (
                <button type="button" onClick={markAllRead} className="text-xs text-brand hover:underline flex items-center gap-1">
                  <Check size={12} /> Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-72 overflow-y-auto">
              {notifications.length === 0 ? (
                <li className="px-4 py-6 text-center text-muted text-sm">No notifications yet</li>
              ) : (
                notifications.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openNotification(n)}
                      className={`w-full text-left px-4 py-3 border-b border-navy-border hover:bg-navy-light/50 transition-colors ${
                        !n.read ? 'bg-brand-subtle/30' : ''
                      }`}
                    >
                      <p className="text-sm font-medium text-fg">{n.title}</p>
                      <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-muted mt-1">
                        {formatDateTime(n.createdAt, {
                          hour: '2-digit',
                          minute: '2-digit',
                          day: 'numeric',
                          month: 'short',
                        })}
                      </p>
                    </button>
                  </li>
                ))
              )}
            </ul>
            <div className="px-4 py-2 border-t border-navy-border">
              <Link href={mainAdminPage('/admin/orders')} onClick={() => setOpen(false)} className="text-xs text-brand hover:underline">
                View all orders →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
