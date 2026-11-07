'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Route } from 'lucide-react';
import { getAdminSession, isSuperAdmin, type AdminSession } from '@/lib/adminAuth';

type Props = {
  visible: boolean;
  onOpen: () => void;
  adminFetch: (endpoint: string, options?: RequestInit) => Promise<{ data?: unknown }>;
};

export default function AdminClassificationFab({ visible, onOpen, adminFetch }: Props) {
  const [mounted, setMounted] = useState(false);
  const [admin, setAdmin] = useState<AdminSession | null>(null);
  const [storeId, setStoreId] = useState('');

  useEffect(() => {
    const session = getAdminSession();
    setAdmin(session);
    if (session && !isSuperAdmin(session) && session.storeId) setStoreId(session.storeId);
    setMounted(true);
  }, []);

  const { data: stores = [] } = useQuery({
    queryKey: ['admin-stores-list'],
    queryFn: async () => (await adminFetch('/stores')).data as { id: string; name: string }[],
    enabled: mounted && visible && isSuperAdmin(admin),
  });

  useEffect(() => {
    if (isSuperAdmin(admin) && stores.length > 0 && !storeId) setStoreId(stores[0].id);
  }, [admin, stores, storeId]);

  const { data: readyCount = 0 } = useQuery({
    queryKey: ['admin-delivery-pending-orders', storeId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (storeId) params.set('storeId', storeId);
      const res = await adminFetch(`/admin/delivery/pending-orders?${params}`);
      return Array.isArray(res.data) ? res.data : [];
    },
    select: (orders) => orders.length,
    enabled: visible && mounted && Boolean(storeId),
    refetchInterval: 15000,
  });

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="fixed bottom-6 right-6 z-[1050] flex items-center gap-2.5 rounded-full border border-brand/30 bg-navy-card px-4 py-3 text-sm font-semibold text-fg shadow-lg shadow-black/25 transition-transform hover:scale-[1.02] hover:border-brand/50 hover:bg-navy-light active:scale-[0.98]"
      aria-label="Open delivery classification suggestions"
    >
      <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-brand text-white">
        <Route size={18} />
        {readyCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-400 ring-2 ring-navy-card" />
          </span>
        )}
      </span>
      <span className="pr-1">Classify orders</span>
      {readyCount > 0 && (
        <span className="rounded-full bg-brand-subtle px-2 py-0.5 text-xs font-bold text-brand tabular-nums">
          {readyCount}
        </span>
      )}
    </button>
  );
}
