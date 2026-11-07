'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PromotionManagementDashboard from '@/components/admin/promotions/PromotionManagementDashboard';
import { getAdminSession, isBranchAdmin, isSuperAdmin } from '@/lib/adminAuth';

export default function AdminPromosPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [branchMode, setBranchMode] = useState(false);

  useEffect(() => {
    const admin = getAdminSession();
    if (!admin || (!isSuperAdmin(admin) && !isBranchAdmin(admin))) {
      router.replace('/admin');
      return;
    }
    setBranchMode(isBranchAdmin(admin));
    setReady(true);
  }, [router]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand border-t-transparent" />
      </div>
    );
  }

  return <PromotionManagementDashboard branchMode={branchMode} />;
}
