'use client';

import { useParams } from 'next/navigation';
import BranchWalletDetail from '@/components/admin/BranchWalletDetail';

export default function BranchWalletPage() {
  const { storeId } = useParams<{ storeId: string }>();
  return <BranchWalletDetail storeId={storeId} />;
}
