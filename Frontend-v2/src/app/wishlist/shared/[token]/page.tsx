'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useSharedWishlist } from '@/hooks/useWishlist';
import WishlistDashboard from '@/components/wishlist/WishlistDashboard';

export default function SharedWishlistPage() {
  const params = useParams();
  const token = typeof params.token === 'string' ? params.token : undefined;
  const { data, isLoading, isError } = useSharedWishlist(token);

  if (isError) {
    return (
      <div className="wishlist-dash wishlist-dash--loading">
        <div className="wishlist-dash__error card">
          <p>This shared wishlist could not be found.</p>
          <Link href="/menu" className="wishlist-dash__btn wishlist-dash__btn--primary">
            Browse menu
          </Link>
        </div>
      </div>
    );
  }

  if (!isLoading && !data) {
    return (
      <div className="wishlist-dash wishlist-dash--loading">
        <p className="wishlist-dash__loading-text">Loading wishlist…</p>
      </div>
    );
  }

  return (
    <WishlistDashboard
      items={data?.items ?? []}
      isLoading={isLoading}
      variant="shared"
      ownerName={data?.ownerName}
    />
  );
}
