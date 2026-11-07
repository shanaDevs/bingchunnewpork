'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, Package } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { OrderStatus } from '@/types';
import type { CustomerNotificationPayload } from '@/hooks/useCustomerSocket';
import { formatDateTime } from '@/lib/datetime';

interface CustomerNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  orderId?: string | null;
  orderNumber?: string | null;
  status?: OrderStatus | null;
  read: boolean;
  createdAt: string;
}

type NotificationListResponse = {
  notifications: CustomerNotification[];
  unreadCount: number;
};

interface CustomerNotificationBellProps {
  compact?: boolean;
  /** Extra classes for the trigger button (e.g. circular mobile header style). */
  buttonClassName?: string;
}

export default function CustomerNotificationBell({
  compact = false,
  buttonClassName = '',
}: CustomerNotificationBellProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuthStore();
  const [open, setOpen] = useState(false);

  const { data, refetch } = useQuery<NotificationListResponse>({
    queryKey: ['customer-notifications'],
    queryFn: () => api.get<NotificationListResponse>('/notifications?limit=25', true),
    enabled: isAuthenticated,
    refetchInterval: 60_000,
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return;
    document.documentElement.setAttribute('data-customer-notif-open', '');
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.removeAttribute('data-customer-notif-open');
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    const onNotify = (e: Event) => {
      const payload = (e as CustomEvent<CustomerNotificationPayload>).detail;
      queryClient.setQueryData<NotificationListResponse>(['customer-notifications'], (prev) => {
        const nextItem: CustomerNotification = {
          id: payload.id,
          type: payload.type,
          title: payload.title,
          message: payload.message,
          orderId: payload.orderId,
          orderNumber: payload.orderNumber,
          status: payload.status,
          read: false,
          createdAt: payload.createdAt,
        };
        const existing = prev?.notifications ?? [];
        return {
          notifications: [nextItem, ...existing.filter((n) => n.id !== nextItem.id)].slice(0, 30),
          unreadCount: (prev?.unreadCount ?? 0) + 1,
        };
      });
    };
    window.addEventListener('bc-customer-notification', onNotify);
    return () => window.removeEventListener('bc-customer-notification', onNotify);
  }, [queryClient]);

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`, {}, true);
    queryClient.setQueryData<NotificationListResponse>(['customer-notifications'], (prev) => {
      if (!prev) return prev;
      return {
        notifications: prev.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
        unreadCount: Math.max(0, prev.unreadCount - 1),
      };
    });
  }

  async function markAllRead() {
    await api.post('/notifications/read-all', {}, true);
    queryClient.setQueryData<NotificationListResponse>(['customer-notifications'], (prev) => {
      if (!prev) return prev;
      return {
        notifications: prev.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      };
    });
  }

  function openNotification(n: CustomerNotification) {
    void markRead(n.id);
    setOpen(false);
    if (n.orderNumber) {
      router.push(`/order/${n.orderNumber}`);
    } else {
      router.push('/account/orders');
    }
  }

  if (!isAuthenticated) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refetch();
        }}
        className={
          buttonClassName
            ? `relative flex items-center justify-center shrink-0 ${buttonClassName}`
            : `relative flex items-center justify-center w-10 h-10 rounded-xl text-fg transition-colors ${
                compact
                  ? 'text-muted hover:text-fg hover:bg-navy-light'
                  : 'border border-navy-border hover:border-brand hover:bg-brand-subtle'
              }`
        }
        aria-label="Notifications"
        aria-expanded={open}
      >
        <Bell size={compact ? 20 : 18} strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="customer-notif-badge absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand text-white text-[10px] font-bold flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            className="customer-notif-backdrop fixed inset-0 z-[1000] bg-black/40 md:bg-transparent"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="customer-notif-panel card shadow-2xl z-[1001] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-navy-border shrink-0">
              <p className="font-semibold text-fg text-sm">Notifications</p>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="text-xs text-brand hover:underline flex items-center gap-1"
                >
                  <Check size={12} /> Mark all read
                </button>
              )}
            </div>

            <div className="customer-notif-panel__list flex-1 min-h-0 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-sm text-muted text-center py-8 px-4">No notifications yet</p>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openNotification(n)}
                    className={`w-full text-left px-4 py-3 border-b border-navy-border last:border-0 hover:bg-brand-subtle transition-colors ${
                      !n.read ? 'bg-brand-subtle/40' : ''
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Package size={14} className="text-brand shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-fg">{n.title}</p>
                        <p className="text-xs text-muted mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[10px] text-muted mt-1">
                          {formatDateTime(n.createdAt, {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      {!n.read && <span className="w-2 h-2 rounded-full bg-brand shrink-0 mt-1.5" />}
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="p-3 border-t border-navy-border flex items-center justify-between gap-3 shrink-0">
              <Link
                href="/account/orders"
                onClick={() => setOpen(false)}
                className="text-xs text-brand hover:underline font-medium"
              >
                View orders →
              </Link>
              <Link
                href="/account/notifications"
                onClick={() => setOpen(false)}
                className="text-xs text-muted hover:text-brand font-medium"
              >
                Preferences
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
