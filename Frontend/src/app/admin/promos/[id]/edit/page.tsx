'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import PromotionEditorPage from '@/components/admin/promotions/PromotionEditorPage';
import { getAdminSession, isBranchAdmin, isSuperAdmin } from '@/lib/adminAuth';

export default function AdminEditPromoPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [ready, setReady] = useState(false);
  const [branchMode, setBranchMode] = useState(false);
  const promoId = typeof params.id === 'string' ? params.id : '';

  useEffect(() => {
    const admin = getAdminSession();
    if (!admin || (!isSuperAdmin(admin) && !isBranchAdmin(admin))) {
      router.replace('/admin');
      return;
    }
    setBranchMode(isBranchAdmin(admin));
    setReady(true);
  }, [router]);

  if (!ready || !promoId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  return <PromotionEditorPage mode="edit" promoId={promoId} branchMode={branchMode} />;
}
