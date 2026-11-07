'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useWishlist } from '@/hooks/useWishlist';
import WishlistDashboard from '@/components/wishlist/WishlistDashboard';

export default function WishlistPage() {
  const router = useRouter();
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: items = [], isLoading, isError, refetch } = useWishlist();

  useEffect(() => {
    if (authHydrated && !isAuthenticated) {
      router.replace('/account/login');
    }
  }, [authHydrated, isAuthenticated, router]);

  if (!authHydrated || !isAuthenticated) {
    return (
      <div className="wishlist-dash wishlist-dash--loading">
        <p className="wishlist-dash__loading-text">Loading wishlist…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="wishlist-dash wishlist-dash--loading">
        <div className="wishlist-dash__error card">
          <p>Could not load your wishlist.</p>
          <button type="button" onClick={() => refetch()} className="wishlist-dash__btn wishlist-dash__btn--primary">
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <WishlistDashboard items={items} isLoading={isLoading} />;
}
