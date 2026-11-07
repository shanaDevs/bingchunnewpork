import { OFFER_IMAGES, type HomeOffer } from "@/components/home/homeOffers";
import { resolveProductImageUrl } from "@/lib/productImageUrl";

type OfferImage = {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** A landscape illustration rather than a tall product cut-out; OfferCard centres it in the ring. */
  wide?: boolean;
};

// The stock promo illustrations (used when a promotion has no product or banner image) carry about a third
// of transparent margin, which made them look small on the cards. These are the same pictures cropped to the
// artwork, in public/promos/home/; the originals stay as they are for the other places that use them.
const TRIMMED_STOCK: Record<string, Omit<OfferImage, "alt">> = {
  [OFFER_IMAGES.blue]: { src: "/promos/home/promo-offer-bingchun50-trimmed.png", width: 389, height: 311, wide: true },
  [OFFER_IMAGES.cream]: { src: "/promos/home/promo-offer-boba100-v2-trimmed.png", width: 403, height: 315, wide: true },
  [OFFER_IMAGES.green]: { src: "/promos/home/promo-offer-free-delivery-trimmed.png", width: 384, height: 326, wide: true },
};

/** What an offer card renders. Built from the app's live promotions by `toOffer`. */
export type Offer = {
  id: string;
  /** The big number on the card, e.g. "20%" or "LKR 500". */
  discount: string;
  /** Short word set beside the discount, e.g. "OFF". */
  discountSuffix?: string;
  title: string;
  description?: string;
  /** Shown only for offers redeemed with a code at checkout. */
  couponCode?: string;
  /** ISO date-time; shown on the card as "Valid until …" when provided. */
  endsAt?: string;
  ctaLabel: string;
  /** Optional product cut-out for decoration. */
  image?: OfferImage;
  /** Optional second cut-out, shown behind the first (e.g. the free gift). */
  secondImage?: OfferImage;
  /** How two images are posed together; see OfferCard. Defaults to "stack". */
  imagePair?: "stack" | "cheers";
  /** Card colourway. */
  theme: "blue" | "pale";
  /** The promotion this card was built from; its CTA applies it to the cart. */
  source: HomeOffer;
};

// Promo images come from the API with unknown sizes; the card sets the height and the width follows
// the real image once it loads, so this only seeds the aspect ratio.
const imageFrom = (src: string | null | undefined, alt: string): OfferImage | undefined => {
  const stock = src ? TRIMMED_STOCK[src] : undefined;
  if (stock) return { ...stock, alt };
  const resolved = resolveProductImageUrl(src);
  return resolved ? { src: resolved, alt, width: 480, height: 800 } : undefined;
};

/**
 * Card fields for one home promotion. Titles in the "LKR 50 OFF" / "20% OFF" form are split into the
 * big discount and its suffix; other titles ("FREE DELIVERY", "Buy 1 Get 1") are shown whole.
 * Colourways alternate blue and pale, as in the original design.
 */
export function toOffer(offer: HomeOffer, index: number): Offer {
  const match = offer.title.match(/^(.+?)\s+(OFF|FREE)$/i);
  const gift = offer.giftProduct;
  return {
    id: offer.id,
    discount: match ? match[1] : offer.title,
    discountSuffix: match ? match[2].toUpperCase() : undefined,
    // Title, description and expiry as the admin entered them. Without a title, the formatted subtitle
    // (the description, else "orders above LKR …") stands in, and is not repeated as the description.
    title: offer.name ?? offer.subtitle,
    description: offer.name ? offer.description : undefined,
    endsAt: offer.expiresAt,
    couponCode: offer.requiresPromoCode ? offer.code : undefined,
    ctaLabel: offer.requiresPromoCode ? "Claim Offer" : "Order Now",
    image: imageFrom(offer.image, ""),
    secondImage: gift?.imageUrl ? imageFrom(gift.imageUrl, `Free ${gift.name}`) : undefined,
    theme: index % 2 === 0 ? "blue" : "pale",
    source: offer,
  };
}

/** "31 Dec 2026", in Sri Lanka time so the date never shifts by visitor time zone. */
export const formatOfferDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Colombo",
  }).format(new Date(iso));
