'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  MapPin,
  Navigation,
  ChevronRight,
  Gift,
} from 'lucide-react';
import HomeHeroSection from '@/components/home/HomeHeroSection';
import HomeOffersSlider from '@/components/home/HomeOffersSlider';
import ProductCard from '@/components/menu/ProductCard';
import type { Product } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Store as StoreType } from '@/types';
import {
  loyaltyTierLabel,
  loyaltyTierProgress,
  getLoyaltyTierProgressPercent,
  formatLoyaltySpend,
  type LoyaltySummary,
} from '@/lib/loyalty';
import { formatStoreCountLabel } from '@/lib/storeCount';
import { getCurrentPositionWithFallback } from '@/lib/geolocation';
import { isProductComingSoon, isProductLowStock } from '@/lib/productAvailability';
import { useMediaQuery } from '@/hooks/useMediaQuery';

interface HomeDesktopLayoutProps {
  popularProducts: Product[];
  onProductSelect: (product: Product) => void;
  isProductInStock: (product: Product) => boolean;
  wishlistSet?: Set<string>;
  onWishlistToggle?: (productId: string, currentlyWishlisted: boolean) => void;
}

export default function HomeDesktopLayout({
  popularProducts,
  onProductSelect,
  isProductInStock,
  wishlistSet,
  onWishlistToggle,
}: HomeDesktopLayoutProps) {
  const { isAuthenticated } = useAuthStore();
  const isDesktopViewport = useMediaQuery('(min-width: 768px)');
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!isDesktopViewport) return undefined;
    let cancelled = false;
    getCurrentPositionWithFallback().then((loc) => {
      if (!cancelled) setUserLocation(loc);
    });
    return () => {
      cancelled = true;
    };
  }, [isDesktopViewport]);

  const { data: loyalty } = useQuery<LoyaltySummary>({
    queryKey: ['loyalty-summary'],
    queryFn: () => api.get('/loyalty/summary', true),
    enabled: isAuthenticated && isDesktopViewport,
  });

  const { data: stores = [], isLoading: storesLoading } = useQuery<StoreType[]>({
    queryKey: ['stores', userLocation?.lat, userLocation?.lng],
    queryFn: () => {
      const params = new URLSearchParams();
      if (userLocation) {
        params.append('lat', String(userLocation.lat));
        params.append('lng', String(userLocation.lng));
      }
      const qs = params.toString();
      return api.get(qs ? `/stores?${qs}` : '/stores');
    },
    enabled: isDesktopViewport,
  });

  const storeCountLabel = formatStoreCountLabel(stores.length);

  const nearestStore = useMemo(() => {
    if (stores.length === 0) return null;
    if (userLocation) {
      return [...stores].sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999))[0];
    }
    return stores[0];
  }, [stores, userLocation]);

  const points = loyalty?.points ?? 0;
  const totalSpendLkr = loyalty?.totalSpendLkr ?? 0;
  const tier = loyaltyTierLabel(totalSpendLkr);
  const progress = loyaltyTierProgress(totalSpendLkr);
  const progressPercent = getLoyaltyTierProgressPercent(totalSpendLkr);

  return (
    <div className="home-desktop">
      <div className="home-desktop__content">
        <div className="home-desktop__main">
          <HomeHeroSection variant="desktop" storeCountLabel={storeCountLabel} />

          <section className="home-desktop__section home-desktop__section--offers home-offers-section">
            <div className="home-desktop__section-head">
              <h2 className="home-desktop__section-title">Today&apos;s Offers</h2>
              <Link href="/promotions" className="home-desktop__section-link">
                View All <ChevronRight size={14} />
              </Link>
            </div>
            <HomeOffersSlider className="home-offers-slider--desktop" variant="grid" />
          </section>

          <section className="home-desktop__section home-desktop__section--last">
            <div className="home-desktop__popular-panel">
              <div className="home-desktop__section-head">
                <h2 className="home-desktop__section-title">Most Popular</h2>
                <Link href="/menu" className="home-desktop__section-link">
                  View All <ChevronRight size={14} />
                </Link>
              </div>
              <div className="home-desktop__products home-product-grid--stagger product-card-grid">
                {popularProducts.slice(0, 4).map((p, i) => {
                  const wishlisted = wishlistSet?.has(p.id) ?? false;
                  const inStock = isProductInStock(p);
                  const comingSoon = isProductComingSoon(p);
                  return (
                    <ProductCard
                      key={p.id}
                      id={p.id}
                      index={i}
                      layout="grid"
                      name={p.name}
                      basePrice={p.basePrice}
                      description={p.description}
                      imageUrl={p.imageUrl}
                      tag={inStock ? (p.tag || 'Popular') : undefined}
                      emoji={['🧋', '🍨', '🥤', '🍵'][i % 4]}
                      isAvailable={inStock}
                      isComingSoon={comingSoon}
                      isLowStock={isProductLowStock(p)}
                      rating={p.avgRating ?? 4.8}
                      ratingCount={p.ratingCount}
                      isWishlisted={wishlisted}
                      onWishlistToggle={
                        onWishlistToggle
                          ? () => onWishlistToggle(p.id, wishlisted)
                          : undefined
                      }
                      onSelect={() => onProductSelect(p)}
                    />
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <aside className="home-desktop__widgets">
          <div className="home-desktop__widget home-desktop__widget--rewards">
            <div className="home-desktop__widget-head">
              <h3>My Rewards</h3>
              <Gift size={18} />
            </div>
            <p className="home-desktop__rewards-points">
              {points.toLocaleString()} <span>Available Points</span>
            </p>
            <Link href="/account/loyalty" className="home-desktop__rewards-btn">
              Redeem Now
            </Link>
            <div className="home-desktop__rewards-progress">
              <div className="home-desktop__rewards-bar">
                <div
                  className="home-desktop__rewards-fill"
                  style={{ width: `${Math.min(100, progressPercent)}%` }}
                />
              </div>
              <p className="home-desktop__rewards-tier">
                {progress.nextTier
                  ? `${formatLoyaltySpend(progress.remaining)} to ${progress.nextTier}`
                  : tier}
              </p>
            </div>
          </div>

          {nearestStore && (
            <div className="home-desktop__widget home-desktop__widget--store">
              <h3>Find a Store Near You</h3>
              {storesLoading ? (
                <p className="home-desktop__store-loading">Finding nearest store…</p>
              ) : (
                <>
                  <p className="home-desktop__store-name">{nearestStore.name}</p>
                  <p className="home-desktop__store-address">
                    <MapPin size={13} />
                    {nearestStore.addressLine}, {nearestStore.city}
                  </p>
                  {nearestStore.distanceKm != null && (
                    <p className="home-desktop__store-distance">
                      {nearestStore.distanceKm.toFixed(1)} km away
                    </p>
                  )}
                  <a
                    href={`https://maps.google.com?q=${nearestStore.lat},${nearestStore.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="home-desktop__store-btn"
                  >
                    <Navigation size={14} /> Get Directions
                  </a>
                </>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
