import {
  absoluteUrl,
  BUSINESS_EMAIL,
  BUSINESS_HOURS,
  BUSINESS_PHONE,
  BUSINESS_PHONE_DISPLAY,
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from '@/lib/seo';

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    alternateName: 'Bing Chun',
    url: SITE_URL,
    logo: absoluteUrl(DEFAULT_OG_IMAGE),
    image: absoluteUrl(DEFAULT_OG_IMAGE),
    description: `${SITE_NAME} — ${SITE_TAGLINE}. Fresh ingredients, crafted with love at 32+ locations island-wide.`,
    email: BUSINESS_EMAIL,
    telephone: BUSINESS_PHONE,
    areaServed: {
      '@type': 'Country',
      name: 'Sri Lanka',
    },
    contactPoint: [
      {
        '@type': 'ContactPoint',
        telephone: BUSINESS_PHONE,
        contactType: 'customer service',
        areaServed: 'LK',
        availableLanguage: ['English', 'Sinhala', 'Tamil'],
      },
    ],
  };
}

export function foodEstablishmentSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FoodEstablishment',
    '@id': `${SITE_URL}/#business`,
    name: SITE_NAME,
    alternateName: 'Bing Chun',
    description: `${SITE_TAGLINE}. Delivery and takeaway from 32+ locations across Sri Lanka.`,
    url: SITE_URL,
    image: absoluteUrl(DEFAULT_OG_IMAGE),
    logo: absoluteUrl(DEFAULT_OG_IMAGE),
    telephone: BUSINESS_PHONE,
    email: BUSINESS_EMAIL,
    priceRange: '$$',
    servesCuisine: ['Bubble Tea', 'Milk Tea', 'Ice Cream', 'Beverages'],
    acceptsReservations: false,
    openingHours: BUSINESS_HOURS,
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'LK',
      addressRegion: 'Sri Lanka',
    },
    areaServed: {
      '@type': 'Country',
      name: 'Sri Lanka',
    },
    sameAs: [SITE_URL],
  };
}

export type StoreForSchema = {
  id: string;
  name: string;
  addressLine?: string | null;
  city?: string | null;
  district?: string | null;
  phone?: string | null;
  openTime?: string | null;
  closeTime?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function storesItemListSchema(stores: StoreForSchema[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${SITE_NAME} Store Locations`,
    description: `Find Bing Chun bubble tea stores across Sri Lanka. Call ${BUSINESS_PHONE_DISPLAY} for inquiries.`,
    numberOfItems: stores.length,
    itemListElement: stores.map((store, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'FoodEstablishment',
        '@id': `${SITE_URL}/stores#${store.id}`,
        name: store.name,
        url: absoluteUrl('/stores'),
        telephone: store.phone || BUSINESS_PHONE,
        address: {
          '@type': 'PostalAddress',
          streetAddress: store.addressLine || undefined,
          addressLocality: store.city || undefined,
          addressRegion: store.district || undefined,
          addressCountry: 'LK',
        },
        ...(store.latitude != null && store.longitude != null
          ? {
              geo: {
                '@type': 'GeoCoordinates',
                latitude: store.latitude,
                longitude: store.longitude,
              },
            }
          : {}),
        ...(store.openTime && store.closeTime
          ? { openingHours: `Mo-Su ${store.openTime}-${store.closeTime}` }
          : { openingHours: BUSINESS_HOURS }),
      },
    })),
  };
}

export type ProductForSchema = {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  basePrice?: number | null;
};

export function menuItemListSchema(products: ProductForSchema[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `${SITE_NAME} Menu`,
    description: 'Premium bubble tea, milkshakes, and ice cream menu.',
    numberOfItems: products.length,
    itemListElement: products.slice(0, 50).map((product, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: absoluteUrl(`/product/${product.id}`),
      name: product.name,
    })),
  };
}

export function productSchema(product: ProductForSchema) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description || `${product.name} from ${SITE_NAME}`,
    image: product.imageUrl ? absoluteUrl(product.imageUrl) : absoluteUrl(DEFAULT_OG_IMAGE),
    url: absoluteUrl(`/product/${product.id}`),
    brand: {
      '@type': 'Brand',
      name: SITE_NAME,
    },
    ...(product.basePrice != null
      ? {
          offers: {
            '@type': 'Offer',
            priceCurrency: 'LKR',
            price: product.basePrice,
            availability: 'https://schema.org/InStock',
            url: absoluteUrl(`/product/${product.id}`),
          },
        }
      : {}),
  };
}
