'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import { Plus, MapPin, Heart, Star } from 'lucide-react';
import { useState } from 'react';
import ProductRadialImage from '@/components/menu/ProductRadialImage';
import MascotHeadRating from '@/components/menu/MascotHeadRating';
import { formatRatingCount } from '@/hooks/useWishlist';

export interface ProductCardProps {
  id?: string;
  name: string;
  basePrice: number;
  description?: string;
  imageUrl?: string;
  tag?: string;
  categoryName?: string;
  emoji?: string;
  isAvailable?: boolean;
  isComingSoon?: boolean;
  isLowStock?: boolean;
  index?: number;
  nearbyBranch?: { name: string; distanceKm: number };
  stockQuantity?: number;
  rating?: number | null;
  ratingCount?: number;
  layout?: 'grid' | 'list' | 'compact';
  isWishlisted?: boolean;
  onWishlistToggle?: () => void;
  orderingClosed?: boolean;
  onSelect: () => void;
}

function tagClass(tag: string): string {
  const t = tag.toLowerCase();
  if (t === 'coming soon') return 'product-card__tag--coming-soon';
  if (t === 'out of stock') return 'product-card__tag--oos';
  if (t === 'popular' || t === 'best seller') return 'product-card__tag--accent';
  if (t === 'new') return 'product-card__tag--success';
  return 'product-card__tag--brand';
}

export default function ProductCard({
  id,
  name,
  basePrice,
  description,
  imageUrl,
  tag,
  categoryName,
  emoji = '🍦',
  isAvailable = true,
  isComingSoon = false,
  isLowStock = false,
  index = 0,
  nearbyBranch,
  rating,
  ratingCount = 0,
  layout = 'grid',
  isWishlisted = false,
  onWishlistToggle,
  orderingClosed = false,
  onSelect,
}: ProductCardProps) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(false);
  const canNavigate = Boolean(id);
  const canAdd = isAvailable;
  const isList = layout === 'list';
  const isCompact = layout === 'compact';
  const unavailableLabel = isComingSoon ? 'Coming Soon' : 'Out of Stock';
  const displayTag = canAdd ? tag : unavailableLabel;
  const showLowStock = canAdd && isLowStock && !isComingSoon;
  const isInteractive = canNavigate || canAdd;

  const nearbyLabel = nearbyBranch
    ? `${nearbyBranch.name.replace('Bing Chun - ', '')} · ${nearbyBranch.distanceKm} km`
    : '';

  const ratingLabel =
    rating != null && rating > 0
      ? `${rating.toFixed(1)}${ratingCount > 0 ? ` (${formatRatingCount(ratingCount)})` : ''}`
      : null;

  const handleCardClick = () => {
    if (canNavigate) {
      router.push(`/product/${id}`);
      return;
    }
    if (!canAdd || orderingClosed) return;
    onSelect();
  };

  const showWishlist = Boolean(onWishlistToggle && id);
  const wishlistButton = showWishlist ? (
    <button
      type="button"
      className={`product-card__wishlist${isWishlisted ? ' product-card__wishlist--active' : ''}`}
      aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
      onClick={(e) => {
        e.stopPropagation();
        onWishlistToggle?.();
      }}
    >
      <Heart size={16} fill={isWishlisted ? 'currentColor' : 'none'} strokeWidth={2} />
    </button>
  ) : null;

  return (
    <div
      className={`product-card-shell group/shell${isCompact ? '' : ' h-full'}${isList ? ' product-card-shell--list' : ''}${isCompact ? ' product-card-shell--compact' : ''}`}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
    >
      {displayTag && !nearbyBranch && (
        <span className={`product-card__tag ${tagClass(displayTag)}`} aria-hidden>
          {displayTag.toUpperCase()}
        </span>
      )}

      {nearbyBranch && (
        <span className="product-card__nearby-badge" aria-hidden>
          <MapPin size={11} strokeWidth={2.5} className="shrink-0" />
          <span className="truncate">{nearbyLabel}</span>
        </span>
      )}

      {!isList && wishlistButton}

      <motion.article
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{
          delay: Math.min(index * 0.04, 0.28),
          duration: 0.4,
          ease: [0.22, 1, 0.36, 1],
        }}
        whileTap={isInteractive ? { opacity: 0.92, transition: { duration: 0.1 } } : undefined}
        className={`product-card product-card--app${isList ? ' product-card--row' : ''}${isCompact ? ' product-card--compact' : ''} ${active ? 'product-card--active' : ''} ${
          isInteractive ? 'cursor-pointer' : 'product-card--unavailable'
        }${canNavigate && !canAdd ? ' product-card--view-only' : ''}`}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && isInteractive) {
            e.preventDefault();
            handleCardClick();
          }
        }}
        role="button"
        tabIndex={isInteractive ? 0 : -1}
        aria-label={
          canAdd
            ? `${name}, LKR ${basePrice}`
            : `${name}, ${unavailableLabel.toLowerCase()} — view details`
        }
      >
        <div className="product-card__image-area">
          <ProductRadialImage imageUrl={imageUrl} alt={name} emoji={emoji} className="h-full w-full" />

          {!isList && (
            <motion.div
              className="product-card__mascot"
              initial={false}
              animate={
                active && !reduceMotion
                  ? { opacity: 1, y: 0 }
                  : { opacity: 0, y: -12 }
              }
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden
            >
              <Image
                src="/brand/mascot-hover.png"
                alt=""
                width={44}
                height={44}
                className="product-card__mascot-img"
              />
            </motion.div>
          )}

          {showLowStock && (
            <span className="product-card__stock-badge">Low Stock</span>
          )}

          {canAdd && !isList && !isCompact && (
            <button
              type="button"
              className="product-card__add-btn"
              aria-label={orderingClosed ? 'Online ordering is closed' : `Add ${name}`}
              disabled={orderingClosed}
              onClick={(e) => {
                e.stopPropagation();
                if (orderingClosed) return;
                onSelect();
              }}
            >
              <Plus size={18} strokeWidth={2.5} />
            </button>
          )}
        </div>

        <div className="product-card__info">
          <div className="product-card__copy">
            {id ? (
              <Link href={`/product/${id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                <h3 className="product-card__name">{name}</h3>
              </Link>
            ) : (
              <h3 className="product-card__name">{name}</h3>
            )}
            {(rating != null || ratingLabel) && (
              <span className="product-card__rating" aria-label={`Rating ${rating ?? 5} out of 5`}>
                {isList ? (
                  <>
                    <MascotHeadRating
                      rating={rating || 5}
                      size={22}
                      className="product-card__rating-heads"
                    />
                    {ratingLabel && (
                      <span className="product-card__rating-value">{ratingLabel}</span>
                    )}
                  </>
                ) : (
                  <>
                    <Star
                      size={12}
                      strokeWidth={1.75}
                      className="product-card__rating-star"
                      fill="currentColor"
                      aria-hidden
                    />
                    <span className="product-card__rating-value">
                      {rating != null && rating > 0 ? rating.toFixed(1) : '—'}
                      {ratingCount > 0 ? ` (${formatRatingCount(ratingCount)})` : ''}
                    </span>
                  </>
                )}
              </span>
            )}
            {description?.trim() ? (
              <p className={`product-card__description${isCompact ? ' product-card__description--hidden' : ''}`}>
                {description.trim()}
              </p>
            ) : null}
            {isList && categoryName && (
              <span className="product-card__category">
                <span aria-hidden>{emoji}</span>
                <span>{categoryName}</span>
              </span>
            )}
          </div>
          <div className="product-card__meta">
            <span className="product-card__price">LKR {basePrice.toLocaleString()}</span>
            {isCompact && canAdd && (
              <button
                type="button"
                className="product-card__add-btn"
                aria-label={orderingClosed ? 'Online ordering is closed' : `Add ${name}`}
                disabled={orderingClosed}
                onClick={(e) => {
                  e.stopPropagation();
                  if (orderingClosed) return;
                  onSelect();
                }}
              >
                <Plus size={14} strokeWidth={2.5} />
              </button>
            )}
            {isList && (showWishlist || canAdd) && (
              <div className="product-card__actions">
                {wishlistButton}
                {canAdd && (
                  <button
                    type="button"
                    className="product-card__add-btn"
                    aria-label={orderingClosed ? 'Online ordering is closed' : `Add ${name}`}
                    disabled={orderingClosed}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (orderingClosed) return;
                      onSelect();
                    }}
                  >
                    <Plus size={18} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.article>
    </div>
  );
}
