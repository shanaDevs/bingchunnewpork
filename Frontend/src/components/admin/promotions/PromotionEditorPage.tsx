'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { getApiBaseUrl } from '@/lib/apiBase';
import {
  buildPromotionFormStateFromPromo,
  formToPayload,
  type AdminPromoRow,
} from '@/lib/promotionFormUtils';
import { isSpinLinkedPromo } from '@/lib/promotionTypes';
import PromotionCreatePanel, {
  type PromotionFormState,
} from '@/components/admin/promotions/PromotionCreatePanel';

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
    return data.data ?? data;
  });
}

type Props = {
  mode: 'create' | 'edit';
  promoId?: string;
  branchMode?: boolean;
};

export default function PromotionEditorPage({ mode, promoId, branchMode = false }: Props) {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: promos, isLoading } = useQuery<AdminPromoRow[]>({
    queryKey: ['admin-promos'],
    queryFn: () => adminFetch('/promos/admin/all'),
    enabled: mode === 'edit',
  });

  const promo = mode === 'edit' && promoId ? promos?.find((row) => row.id === promoId) : undefined;

  useEffect(() => {
    if (mode !== 'edit' || isLoading || !promoId) return;
    if (!promo) {
      toast.error('Promotion not found');
      router.replace('/admin/promos?tab=promotions');
      return;
    }
    if (isSpinLinkedPromo(promo)) {
      router.replace('/admin/spin');
    }
  }, [mode, isLoading, promoId, promo, router]);

  function applyBranchLocks(payload: Record<string, unknown>) {
    if (!branchMode) return payload;
    payload.ownership = 'BRANCH';
    payload.branchSharePct = 100;
    payload.platformSharePct = 0;
    payload.branchShareSplits = null;
    payload.contributionSource = null;
    return payload;
  }

  const createMutation = useMutation({
    mutationFn: (data: PromotionFormState) => {
      const payload = applyBranchLocks(formToPayload(data, 'create'));
      return adminFetch('/promos/admin', { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-promos'] });
      qc.invalidateQueries({ queryKey: ['promo-discount-report'] });
      toast.success('Promotion created');
      router.push('/admin/promos?tab=promotions');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to create'),
  });

  const updateMutation = useMutation({
    mutationFn: (data: PromotionFormState) => {
      if (!promoId) throw new Error('Missing promotion id');
      const payload = applyBranchLocks(formToPayload(data, 'update'));
      return adminFetch(`/promos/admin/${promoId}`, { method: 'PUT', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-promos'] });
      qc.invalidateQueries({ queryKey: ['promo-discount-report'] });
      toast.success('Promotion updated');
      router.push('/admin/promos?tab=promotions');
    },
    onError: (e: Error) => toast.error(e.message || 'Failed to update'),
  });

  function goBack() {
    router.push('/admin/promos?tab=promotions');
  }

  if (mode === 'edit' && (isLoading || !promo || isSpinLinkedPromo(promo))) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  return (
    <PromotionCreatePanel
      layout="page"
      mode={mode}
      editKey={promoId ?? null}
      branchMode={branchMode}
      initial={promo ? buildPromotionFormStateFromPromo(promo) : undefined}
      usedCount={promo?.usedCount ?? 0}
      onSubmit={(form) => {
        if (mode === 'edit') updateMutation.mutate(form);
        else createMutation.mutate(form);
      }}
      onCancel={goBack}
      isPending={createMutation.isPending || updateMutation.isPending}
    />
  );
}
