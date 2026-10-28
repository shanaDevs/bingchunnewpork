import http from 'k6/http';
import { check, sleep } from 'k6';
import { apiUrl, baseHeaders } from '../lib/env.js';
import { browseErrors } from '../lib/metrics.js';

/** Weighted anonymous read mix — safe for production smoke tests. */
const ENDPOINTS = [
  { weight: 5, name: 'health', fn: health },
  { weight: 15, name: 'menu_categories', fn: menuCategories },
  { weight: 25, name: 'menu_products', fn: menuProducts },
  { weight: 15, name: 'menu_product_detail', fn: menuProductDetail },
  { weight: 15, name: 'stores', fn: stores },
  { weight: 10, name: 'promos', fn: promos },
  { weight: 10, name: 'settings_app', fn: settingsApp },
  { weight: 5, name: 'inventory', fn: inventory },
];

function pickWeighted(data) {
  const total = ENDPOINTS.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const ep of ENDPOINTS) {
    r -= ep.weight;
    if (r <= 0) return ep;
  }
  return ENDPOINTS[0];
}

function get(config, path, name) {
  const res = http.get(apiUrl(config, path), {
    headers: baseHeaders(config),
    tags: { name },
  });
  const ok = check(res, {
    [`${name} status 2xx`]: (r) => r.status >= 200 && r.status < 300,
  });
  if (!ok) browseErrors.add(1);
  return res;
}

function health(config) {
  return get(config, '/health', 'health');
}

function menuCategories(config) {
  return get(config, '/api/menu/categories', 'menu_categories');
}

function menuProducts(config) {
  const storeId = config.runtimeData.storeId;
  return get(config, `/api/menu/products?storeId=${storeId}`, 'menu_products');
}

function menuProductDetail(config) {
  const ids = config.runtimeData.productIds || [];
  const id = ids[Math.floor(Math.random() * ids.length)];
  return get(config, `/api/menu/products/${id}`, 'menu_product_detail');
}

function stores(config) {
  return get(config, '/api/stores', 'stores');
}

function promos(config) {
  return get(config, '/api/promos', 'promos');
}

function settingsApp(config) {
  return get(config, '/api/settings/app', 'settings_app');
}

function inventory(config) {
  const storeId = config.runtimeData.storeId;
  const ids = config.runtimeData.productIds || [];
  const productId = ids[Math.floor(Math.random() * ids.length)];
  return get(
    config,
    `/api/inventory/availability?storeId=${storeId}&productId=${productId}`,
    'inventory',
  );
}

export default function browse(data) {
  const { config } = data;
  const ep = pickWeighted();
  ep.fn(config);
  sleep(config.thinkTimeMs / 1000);
}
