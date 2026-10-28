import http from 'k6/http';
import { apiUrl, baseHeaders } from './env.js';

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (Array.isArray(value.products)) return value.products;
  if (Array.isArray(value.items)) return value.items;
  if (Array.isArray(value.data)) return value.data;
  return [];
}

/**
 * Overlay live store + product IDs onto runtimeData so browse/order work
 * against whatever catalog the target currently has.
 */
export function hydrateCatalog(config) {
  const headers = baseHeaders(config);
  const storesRes = http.get(apiUrl(config, '/api/stores'), {
    headers,
    tags: { name: 'setup_stores' },
  });

  if (storesRes.status < 200 || storesRes.status >= 300) {
    console.warn(`Catalog hydrate: /api/stores returned ${storesRes.status} — using runtime-data.json as-is`);
    return config.runtimeData;
  }

  let stores = [];
  try {
    stores = asArray(storesRes.json('data'));
  } catch {
    stores = [];
  }

  if (stores.length === 0) {
    console.warn('Catalog hydrate: no stores returned — using runtime-data.json as-is');
    return config.runtimeData;
  }

  const preferred = stores.find((s) => s.id === config.runtimeData.storeId);
  const store = preferred || stores[0];

  const productsRes = http.get(apiUrl(config, `/api/menu/products?storeId=${store.id}`), {
    headers,
    tags: { name: 'setup_products' },
  });

  let products = [];
  if (productsRes.status >= 200 && productsRes.status < 300) {
    try {
      products = asArray(productsRes.json('data'));
    } catch {
      products = [];
    }
  }

  const productIds = products.map((p) => p.id).filter(Boolean).slice(0, 8);
  console.log(
    `Catalog hydrate: store=${store.id} (${store.name}) products=${productIds.length}`,
  );

  return {
    ...config.runtimeData,
    storeId: store.id,
    storeName: store.name,
    productIds: productIds.length > 0 ? productIds : config.runtimeData.productIds,
    products: products.slice(0, 8).map((p) => ({
      id: p.id,
      name: p.name,
      basePrice: p.basePrice,
    })),
  };
}
