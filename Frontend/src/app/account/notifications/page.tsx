'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Bell, Mail, MessageSquare, Smartphone } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';
import type { User } from '@/types';
import toast from 'react-hot-toast';

type NotificationPrefs = Pick<User, 'notifyEmail' | 'notifySms' | 'notifyPush'>;

export default function NotificationsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { isAuthenticated, user, updateUser } = useAuthStore();
  const [prefs, setPrefs] = useState<NotificationPrefs>({
    notifyEmail: true,
    notifySms: true,
    notifyPush: true,
  });

  useEffect(() => {
    if (!isAuthenticated) router.replace('/account/login');
  }, [isAuthenticated, router]);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<User>('/auth/me', true),
    enabled: isAuthenticated,
  });

  useEffect(() => {
    const source = profile ?? user;
    if (!source) return;
    setPrefs({
      notifyEmail: source.notifyEmail ?? true,
      notifySms: source.notifySms ?? true,
      notifyPush: source.notifyPush ?? true,
    });
  }, [profile, user]);

  const saveMutation = useMutation({
    mutationFn: (body: Partial<NotificationPrefs>) => api.put<User>('/auth/me', body, true),
    onSuccess: (updated) => {
      updateUser({
        notifyEmail: updated.notifyEmail,
        notifySms: updated.notifySms,
        notifyPush: updated.notifyPush,
      });
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.success('Notification preferences saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function toggle(key: keyof NotificationPrefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    saveMutation.mutate({ [key]: next[key] });
  }

  if (!isAuthenticated) return null;

  const items = [
    {
      key: 'notifyPush' as const,
      icon: Smartphone,
      label: 'Push notifications',
      desc: 'Order updates and pickup alerts in your browser',
    },
    {
      key: 'notifySms' as const,
      icon: MessageSquare,
      label: 'SMS notifications',
      desc: 'Text messages for order status changes',
    },
    {
      key: 'notifyEmail' as const,
      icon: Mail,
      label: 'Email notifications',
      desc: 'Receipts and order updates by email',
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 w-full">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/account" className="btn-outline p-2 shrink-0">
          <ChevronLeft size={18} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-fg">Notifications</h1>
          <p className="text-muted text-sm">Choose how we keep you updated</p>
        </div>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-muted text-sm">Loading preferences...</div>
      ) : (
        <div className="space-y-3">
          {items.map((item, i) => {
            const Icon = item.icon;
            const enabled = prefs[item.key];
            return (
              <motion.div
                key={item.key}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="card p-4 flex items-center gap-4"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-brand-subtle shrink-0">
                  <Icon size={18} className="text-brand" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-fg">{item.label}</p>
                  <p className="text-xs text-muted mt-0.5">{item.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={item.label}
                  disabled={saveMutation.isPending}
                  onClick={() => toggle(item.key)}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
                    enabled ? 'bg-brand' : 'bg-navy-light border border-navy-border'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      enabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </motion.div>
            );
          })}

          <div className="card p-4 flex items-start gap-3 mt-4">
            <Bell size={18} className="text-brand shrink-0 mt-0.5" />
            <p className="text-xs text-muted leading-relaxed">
              Order status updates also appear in the bell icon at the top of the page when you are signed in.
              Keep push notifications on for the fastest alerts.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
